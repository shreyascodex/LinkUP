# LinkUp

**Stay connected. Chat together.**

LinkUp is a full-stack real-time messaging platform built with React, TypeScript, Tailwind CSS v4, Express, WebSockets (`ws`), Drizzle ORM, Cloud SQL (PostgreSQL), and Firebase Authentication.

## Features

- **Authentication**: Google OAuth (`signInWithPopup`), Email/Password sign-in, registration, email verification, and password reset.
- **User Profiles & Discovery**: Unique usernames enforced at the database level, display names, bios, avatar uploads, real-time presence, and user search.
- **Private & Group Messaging**: Real-time WebSocket message delivery, optimistic UI updates with idempotent deduplication, message pagination, replies, editing, soft deletion, read receipts, typing indicators, and URL link previews.
- **Group Administration**: Group creation, editable group name and description, member management, admin role promotion/demotion, and leaving groups.
- **Private Attachments**: Authenticated file and image uploads with progress tracking, inline image previews, lightbox viewer, and authorized downloads.
- **Notifications & Search**: In-app notification feed, optional permission-gated browser alerts, global authorized message search, and in-conversation search.
- **Settings & Themes**: Persistent Light, Dark, and System theme modes, privacy toggles, notification preferences, and account management.

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React
- **Backend**: Node.js, Express, `ws` WebSocket Server, Drizzle ORM, Multer, Zod
- **Database**: PostgreSQL (Cloud SQL)
- **Authentication**: Firebase Authentication (Client SDK + Firebase Admin ID Token verification)

## Environment Configuration

See `.env.example` for runtime variables (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`). Firebase client configuration is stored in `firebase-applet-config.json`.

## Development Commands

```bash
npm install
npm run dev       # Starts full-stack Express + WebSocket + Vite server on port 3000
npm run lint      # Runs TypeScript type-checking (tsc --noEmit)
npm run build     # Builds production frontend bundle
npx vitest run    # Runs automated test suite
```
