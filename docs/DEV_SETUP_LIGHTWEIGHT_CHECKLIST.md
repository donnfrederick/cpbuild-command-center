# Lightweight Setup — Step-by-Step Checklist

Follow these steps in order. Check off each as you go.

---

## Part 1: Supabase (Database) — You do this

### Step 1.1: Create a Supabase project

1. Go to **[supabase.com](https://supabase.com)** and sign in (or create a free account).
2. Click **New Project**.
3. Fill in:
   - **Name:** `command-center-dev` (or any name)
   - **Database Password:** Choose a strong password — **save it somewhere**, you'll need it.
   - **Region:** Pick one close to you.
4. Click **Create new project** and wait ~2 minutes for it to spin up.

### Step 1.2: Get your connection string

1. In your project, go to **Settings** (gear icon in sidebar) → **Database**.
2. Scroll to **Connection string**.
3. Select the **URI** tab.
4. Copy the connection string. It looks like:
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. **Replace `[YOUR-PASSWORD]`** with the database password you set in Step 1.1.
6. **Paste it here** (you'll add it to `.env` in Part 3):
   ```
   _________________________________________________
   ```

---

## Part 2: Resend (Email) — You do this

### Step 2.1: Get a Resend API key

1. Go to **[resend.com](https://resend.com)** and sign in (or create a free account).
2. Go to **API Keys** → **Create API Key**.
3. Name it `command-center-dev`.
4. Copy the key (starts with `re_`). **You won't see it again.**
5. **Paste it here** (for Part 3):
   ```
   _________________________________________________
   ```

### Step 2.2: Verify your email (so you can receive invite emails)

1. In Resend, go to **Domains** (or **Settings** if that's where verification is).
2. For testing, you can use Resend's built-in domain — add **your email address** to the verified list so you can receive test emails.
3. Or: Add a domain you own and verify it.

---

## Part 3: Update your `.env` — You do this

1. Open `.env` in the project root (create from `.env.example` if it doesn't exist).
2. Replace or add these lines with **your actual values**:

```env
# ── Lightweight setup (no Docker) ─────────────────────────────────────────────
DATABASE_URL="PASTE_YOUR_SUPABASE_URI_HERE"
NEXTAUTH_URL="http://localhost:3002"
AUTH_SECRET="GENERATE_WITH_openssl_rand_base64_32"

# Email — use Resend, no Mailpit
RESEND_API_KEY="PASTE_YOUR_RESEND_KEY_HERE"
EMAIL_FROM="Command Center <noreply@yourdomain.com>"
# Comment out or remove SMTP_HOST so we use Resend:
# SMTP_HOST=

# Bootstrap admin (your dev login)
BOOTSTRAP_ADMIN_EMAIL="your-email@example.com"
BOOTSTRAP_ADMIN_PASSWORD="PickAStrongPassword123!"

# Dev bypass (skip login screen)
DEV_BYPASS_AUTH="true"

# Unifier mock (no real API needed for basic dev)
UNIFIER_MOCK="true"
```

3. **Generate AUTH_SECRET:** Run this in your terminal and paste the output:
   ```bash
   openssl rand -base64 32
   ```

4. **Save the file.**

---

## Part 4: Run setup — I'll do this (you run the commands)

Once your `.env` is ready, run:

```bash
npm ci
npm run dev:setup:cloud
npm run dev
```

Open **http://localhost:3002** and log in with your `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.

---

## Quick reference

| What | Where to get it |
|------|-----------------|
| DATABASE_URL | Supabase → Settings → Database → Connection string (URI) |
| RESEND_API_KEY | Resend → API Keys → Create |
| AUTH_SECRET | `openssl rand -base64 32` |

---

## Stuck?

- **Supabase connection fails:** Use the **direct** connection (port 5432) not the pooler (6543). In Supabase, check "Connection string" for the "Direct connection" option.
- **Emails not sending:** Make sure `SMTP_HOST` is commented out or removed. Add your email to Resend's verified list.
- **Can't log in:** Run `npm run bootstrap:admin` again to reset the admin user.
