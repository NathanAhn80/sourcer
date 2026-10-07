# Sourcer

Chrome extension + dashboard for **Threads** and **Xiaohongshu** content research overlays, collect-to-library, and media download.

Inspired by the public HypeDuck product model (overlays on the user’s signed-in browser session; explicit collect/download). No HypeDuck code was reused.

## Stack

- `apps/web` — Next.js 15 dashboard + REST API + Prisma/SQLite
- `extension` — Chrome MV3 (Vite + CRXJS)

## Setup

```bash
cd C:\Users\yuns\sourcer
npm install
npm run db:push
npm run db:seed
```

Seed prints a demo `apiKey` (`sk_...`).

### Dashboard

```bash
npm run dev:web
```

Open http://localhost:3456 and paste the API key.

### Extension

```bash
npm run dev:ext
```

1. Chrome → `chrome://extensions` → Developer mode
2. Load unpacked → select `extension/dist` (or the CRXJS dev output shown in the terminal)
3. Open the Sourcer popup → set API Base `http://localhost:3456` + API key → Save
4. Visit https://www.threads.net or https://www.xiaohongshu.com and refresh

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Health check |
| GET | `/api/me` | Bearer | Current user |
| GET | `/api/items?platform=` | Bearer | Library list |
| POST | `/api/items` | Bearer | Collect / upsert item |

## Docs

- [FEATURE_INVENTORY.md](./FEATURE_INVENTORY.md) — MVP field matrix
- [docs/BEHAVIORAL_SPEC.md](./docs/BEHAVIORAL_SPEC.md) — HypeDuck behavioral observation (no reverse engineering)
- [BACKLOG.md](./BACKLOG.md) — Post-MVP priorities
