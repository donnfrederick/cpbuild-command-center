# CP Build Command Center

Internal construction project management platform for CP Build. Tracks projects, units, phases, and install teams. Integrates with Oracle Primavera Unifier (PDS API) for project data.

**This is a standalone application.** It has no connection to IHI Tools or any other external dashboard.

## Environment Parity

**Node ≥22, npm ≥10.** Use `npm ci` for installs. See [DEV_NOTES.md](./DEV_NOTES.md#environment-parity) for full setup (nvm, .npmrc, reference environment).

## Getting Started

```bash
cp .env.example .env   # Set DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL=http://localhost:3002
npm ci
npm run dev:setup   # First-time: Docker, migrations, admin user
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) with your browser.

## Learn More

- [DEV_NOTES.md](./DEV_NOTES.md) — Stack, directory structure, auth, deployment
- [PROJECT_TRACKER.md](./PROJECT_TRACKER.md) — What's built, what's next, file map
