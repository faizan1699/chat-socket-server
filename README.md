# NexChat Socket Server

Standalone Socket.IO + WebRTC signalling server for NexChat. Deploy this as a long-running Node service on a host that supports persistent WebSocket connections (Vercel cannot — that's why this is split out).

Recommended hosts: **Railway**, **Fly.io**, **Render**, **DigitalOcean App Platform**.

---

## Production deploy (Railway example)

1. **Create a new Railway service** from this monorepo.
2. **Set the Root Directory** in service settings to `socket-server`.
3. **Set environment variables** (see `.env.example`):
   - `JWT_SECRET` — must match the Next.js app
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INTERNAL_API_SECRET` — generate a long random string, MUST match the Next.js app
   - `ALLOWED_ORIGINS` — your frontend URL(s), comma-separated (e.g. `https://chat.com,https://www.chat.com`)
   - `NODE_ENV=production`
4. Railway autodetects the Dockerfile and deploys.
5. Note the public URL Railway assigns (e.g. `https://nexchat-socket.up.railway.app`).
6. **Update the Next.js app's env on Vercel:**
   - `NEXT_PUBLIC_SOCKET_URL` → the Railway URL
   - `SOCKET_SERVER_INTERNAL_URL` → the same Railway URL
   - `INTERNAL_API_SECRET` → same secret as on Railway

### Custom domain (recommended)

Point a subdomain like `sockets.your-app.com` at the Railway service. This makes:
- The CORS allowlist easier to reason about
- Same-site cookies work cross-domain (with `SameSite=None; Secure`)

### Cookies vs Bearer tokens

The frontend `useSocket` hook passes the access token both ways:
- **As a cookie** (works automatically when frontend + socket are on sibling domains under the same parent + cookies use `SameSite=None`)
- **In the Socket.IO `auth.token` field** (works always, including mobile native apps and cross-origin browsers blocked by ITP)

You don't need to pick one — both flow through `lib/auth/socket-auth.ts → tokenFromHandshake()`.

---

## Internal HTTP bridge

The Next.js app's REST handlers (e.g. admin send-as-admin, force-logout) call:

```
POST /internal/emit
Headers: X-Internal-Secret: <INTERNAL_API_SECRET>
Body:    { "username": "alice", "event": "receive-message", "payload": {...} }
```

```
GET /internal/online?username=alice
Headers: X-Internal-Secret: <INTERNAL_API_SECRET>
→ { "online": true }
```

Both endpoints require the shared secret in `X-Internal-Secret`. Without it the server returns 401. Never expose `/internal/*` to the public without the guard.

---

## Health check

`GET /healthz` returns `200 ok` — wire to Railway/Fly health probes.

---

## Scaling beyond one instance

This server keeps presence (`onlineUsers`) and active-call pairs in memory. For >1 replica, add the Socket.IO Redis adapter and run a Redis instance — both Railway and Fly offer one-click Redis. Until you hit ~50k concurrent users a single instance is fine.

---

## File structure

```
src/
  index.ts            HTTP server + Socket.IO bootstrap + lifecycle
  handlers.ts         All socket.on(...) event handlers (mirrors original pages/api/socket.ts)
  internal-bridge.ts  /internal/emit + /internal/online HTTP endpoints
  auth.ts             socket handshake authentication (token + DB lookup)
  tokens.ts           JWT verification (must use same JWT_SECRET as Next app)
  cookies.ts          cookie header parser
  supabase.ts         supabase admin client
  env.ts              env var loader + validator
```
