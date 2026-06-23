import Redis from 'ioredis';
import { env } from './env.js';
import { supabaseAdmin } from './supabase.js';

function build(): Redis | null {
  const url = env.redisUrl?.trim();
  if (!url) return null;

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 300, 5000),
      reconnectOnError: () => true,
    });

    let warned = false;
    client.on('error', (err: Error) => {
      if (!warned) {
        warned = true;
        console.warn('[cache] Redis unavailable, skipping invalidation:', err?.message);
      }
    });
    client.on('ready', () => {
      warned = false;
      console.info('[cache] Redis connected');
    });

    return client;
  } catch (err) {
    console.warn('[cache] Redis init failed:', (err as Error)?.message);
    return null;
  }
}

const redis = build();

const convListKey = (userId: string) => `conv:list:${userId}`;
const convMessagesKey = (conversationId: string, userId: string) =>
  `conv:msgs:${conversationId}:${userId}`;

async function del(keys: string[]): Promise<void> {
  if (!redis || !keys.length) return;
  try {
    await redis.del(...keys);
  } catch {
    /* cache is best-effort */
  }
}

async function loadParticipantIds(conversationId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId);
  return (data || []).map((r: { user_id: string }) => r.user_id);
}

export async function invalidateConversationList(userIds: string[]): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return;
  await del(unique.map(convListKey));
}

export async function invalidateConversation(
  conversationId: string,
  participantUserIds?: string[],
): Promise<void> {
  if (!redis) return;
  const ids = participantUserIds?.length
    ? Array.from(new Set(participantUserIds.filter(Boolean)))
    : await loadParticipantIds(conversationId);
  if (!ids.length) return;
  const keys = ids.flatMap((uid) => [convListKey(uid), convMessagesKey(conversationId, uid)]);
  await del(keys);
}
