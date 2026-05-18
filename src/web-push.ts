import webpush from 'web-push';
import { supabaseAdmin } from './supabase.js';

const PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim();
const PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@nexchat.site';

let configured = false;
function ensure(): boolean {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
    return true;
  } catch (err) {
    console.warn('[socket/web-push] setVapidDetails failed:', err);
    return false;
  }
}

export interface WebPushPayload {
  kind?: 'call-incoming' | 'message' | 'generic';
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  ttl?: number;
}

interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function parseSub(raw: string): StoredSub | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.endpoint === 'string' && obj.keys?.p256dh && obj.keys?.auth) {
      return obj as StoredSub;
    }
  } catch {}
  return null;
}

export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<void> {
  if (!ensure()) return;
  const { data, error } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('platform', 'web');
  if (error) {
    console.warn('[socket/web-push] fetch subs failed:', error.message);
    return;
  }
  const rows = (data ?? []) as Array<{ token: string }>;
  if (rows.length === 0) return;

  const ttl = payload.ttl ?? (payload.kind === 'call-incoming' ? 30 : 86400);
  const json = JSON.stringify({
    kind: payload.kind ?? 'generic',
    title: payload.title,
    body: payload.body ?? '',
    icon: payload.icon ?? '/images/logo.png',
    badge: payload.badge ?? '/images/logo.png',
    tag: payload.tag,
    url: payload.url ?? '/',
    data: payload.data ?? {},
    requireInteraction: !!payload.requireInteraction,
  });

  const deadTokens: string[] = [];
  await Promise.all(
    rows.map(async (row) => {
      const sub = parseSub(row.token);
      if (!sub) {
        deadTokens.push(row.token);
        return;
      }
      try {
        await webpush.sendNotification(sub, json, {
          TTL: ttl,
          urgency: payload.kind === 'call-incoming' ? 'high' : 'normal',
        });
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          deadTokens.push(row.token);
        } else {
          console.warn('[socket/web-push] send failed', status, err?.message ?? err);
        }
      }
    }),
  );

  if (deadTokens.length) {
    await supabaseAdmin
      .from('push_tokens')
      .delete()
      .in('token', deadTokens)
      .then(({ error: e }) => {
        if (e) console.warn('[socket/web-push] prune failed:', e.message);
      });
  }
}
