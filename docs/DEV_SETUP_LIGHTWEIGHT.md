# Dev Setup — Supabase + Resend (Recommended)

**No Docker required.** This is the default setup for all developers. Uses Supabase (free cloud Postgres) and Resend instead of local Docker containers. Works great on MacBook Airs and any machine.

---

## Quick Start (~10 minutes)

### 1. Clone and install

```bash
git clone https://github.com/cp-build-dev-ops/command-center-reboot.git
cd command-center-reboot
npm ci
```

### 2. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose any region, set a strong database password (save it — you'll need it below)
3. Wait ~30 seconds for provisioning

### 3. Get your two connection strings

In the Supabase dashboard go to **Settings → Database → Connection string**:

| String | Where to find it | What it's for |
|--------|-----------------|---------------|
| **Transaction pooler** (port 6543) | "Transaction" tab | `DATABASE_URL` — used by the app at runtime |
| **Direct connection** (port 5432) | "Direct connection" or `db.[ref].supabase.co:5432` | `DIRECT_URL` — used ONLY by Prisma migrations |

> **Why two URLs?**  
> The app connects through Supabase's PgBouncer pooler for efficient connection reuse. But Prisma migrations require a *direct* connection — DDL statements are incompatible with PgBouncer's transaction mode. If you only set `DATABASE_URL`, migrations will fail or behave unpredictably.

The URLs look like:

```
# Transaction pooler (runtime — DATABASE_URL):
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct connection (migrations — DIRECT_URL):
postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

Note: the username is different between the two. The pooler uses `postgres.[ref]`; the direct uses just `postgres`.

### 4. Get a Resend API key

1. Create a free account at [resend.com](https://resend.com)
2. Go to **API Keys → Create API Key** (copy it — shown only once)
3. Go to **Contacts** and add your personal email address so invite emails reach your inbox in dev

### 5. Configure `.env`

```bash
cp .env.example .env
```

Fill in these values (everything else can stay as-is for now):

```env
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"

AUTH_SECRET="<output of: openssl rand -base64 32>"

RESEND_API_KEY="re_YOUR_KEY"
DEV_EMAIL_OVERRIDE="yourname@gmail.com"   # invite emails go here during dev

BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
BOOTSTRAP_ADMIN_PASSWORD="ChangeMe123!"
```

### 6. Run setup

```bash
npm run dev:setup:cloud
```

This will:
- Run all Prisma migrations against your Supabase database (via `DIRECT_URL`)
- Bootstrap the first admin account
- Print a summary

### 7. Start the app

```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) and sign in with your bootstrap credentials.

---

## What runs where

| Service | Where it runs |
|---------|--------------|
| PostgreSQL | ☁️ Supabase (your free project) |
| Email | ☁️ Resend (invite emails → `DEV_EMAIL_OVERRIDE`) |
| Next.js | 💻 Your machine (localhost:3002) |
| Cursor / IDE | 💻 Your machine |

No Docker. No local Postgres. No Mailpit.

---

## Security notes

- **Per-developer database:** Each person creates their own free Supabase project. No shared credentials.
- **Never commit `.env`.** It's in `.gitignore`. The Supabase URI contains your database password.
- **`DEV_EMAIL_OVERRIDE`** redirects all outbound email to your personal address. It's ignored in production.
- The direct URL (`DIRECT_URL`) is only used by Prisma — never exposed to the browser.

---

## Troubleshooting

**`DATABASE_URL must point to a cloud Postgres`**  
You still have `localhost` in `DATABASE_URL`. Replace it with your Supabase URI.

**Prisma migrations fail with `prepared statement` or `pgbouncer` errors**  
Make sure `DIRECT_URL` is set to the **direct** connection (port 5432, `db.[ref].supabase.co`). Migrations must bypass the pooler.

**Emails not arriving**  
1. Check `RESEND_API_KEY` is set and valid
2. Make sure your email is in Resend's contact list (or you own a verified domain)
3. Check `DEV_EMAIL_OVERRIDE` is set to the email you're checking

**`Can't reach database server`**  
- Check the Supabase project is active (free projects sleep after inactivity — click "Restore project")
- Verify the connection string is correct
- Free tier allows all IPs by default; no allowlist changes needed

**App builds fine but Prisma Client errors at runtime**  
Run `npm run db:generate` to regenerate the Prisma Client after any schema change.

---

## Running migrations

```bash
# Apply pending migrations (also runs automatically on Railway deploy):
npm run db:deploy        # prisma migrate deploy — uses DIRECT_URL

# Create a new migration during development:
npm run db:migrate       # prisma migrate dev — uses DIRECT_URL

# Push schema changes without a migration file (experimental/dev only):
npm run db:push          # prisma db push
```

---

## Docker alternative

If you prefer a fully local setup with Docker, see the comments at the bottom of `.env.example`. Commands:

```bash
npm run dev:up      # start Postgres + Mailpit containers
npm run dev:setup   # run migrations + bootstrap admin
npm run dev         # start Next.js
npm run dev:mail    # open Mailpit at http://localhost:8025
```
