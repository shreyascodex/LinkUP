# LinkUp — Architecture

## Application Architecture
LinkUp runs as a unified full-stack Node.js server (`server.ts`) serving:
1. **REST API (`/api/*`)**: Authenticated Express routes backed by PostgreSQL via Drizzle ORM.
2. **Real-Time WebSocket Engine (`/ws`)**: Authenticated `ws` server attached to the HTTP server on port 3000.
3. **React SPA**: Served via Vite middleware in development and `dist/` static assets in production.

## Database Relationships (PostgreSQL)
- `profiles` (1) ↔ (1) `user_settings`
- `profiles` (1) ↔ (N) `conversation_members` (N) ↔ (1) `conversations`
- `conversations` (1) ↔ (N) `messages` (1) ↔ (N) `message_attachments`
- `messages` (1) ↔ (N) `message_reads`
- `profiles` (1) ↔ (N) `notifications`

Direct conversations enforce 1-to-1 uniqueness via `conversations.direct_key` (`min(id):max(id)`). Duplicate message retries are prevented by a unique composite index on `(conversation_id, client_message_id)`.

## Authentication & Authorization Model
1. Clients authenticate via Firebase Auth (`signInWithPopup` or Email/Password) and obtain short-lived Firebase ID Tokens in memory (`user.getIdToken()`).
2. Every REST call includes `Authorization: Bearer <token>`, verified server-side via `firebase-admin/auth`.
3. Every conversation, message, search, and attachment endpoint verifies membership in `conversation_members` (and `role === 'admin'` for group administration) using the authenticated server profile ID—never trusting client-supplied user IDs.
4. Uploaded attachments are stored outside static web roots and streamed through `GET /api/attachments/:id` only after membership verification.

## Realtime Architecture
- Clients open `/ws?token=<firebaseIdToken>`.
- Server tracks active sockets per user ID (`Map<string, Set<WebSocket>>`), updates `profiles.status` and `last_seen_at`, and broadcasts `presence:update` to conversation peers (respecting `user_settings` privacy flags).
- Ephemeral `typing:start` / `typing:stop` frames verify conversation membership before broadcasting to other members.
- Durable mutations (message create/edit/delete, read receipts, group changes, notifications) persist to PostgreSQL first and then broadcast delta events to connected recipients.
