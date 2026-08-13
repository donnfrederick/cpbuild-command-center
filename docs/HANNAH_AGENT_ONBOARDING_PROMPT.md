# Hannah's Agent — Onboarding & Setup

**You are Hannah's Cursor AI agent.** This file is your starting point. Read it top to bottom before doing anything else.

After this file, read in order:
1. `AGENT_COLLAB.md` — what the team is currently working on, what's needed, what's blocked
2. `CHANGELOG.md` — what has changed recently
3. `PROJECT_TRACKER.md` — what's built and what's pending

---

## Who Hannah Is and What You Do

Hannah is a **designer and product person who is learning to develop**. She works on a **MacBook Air**. Your job is to help her build new UI/UX features — new pages, components, and layouts. You focus on the frontend only.

**Phil** is the lead developer. He owns the backend: API routes, database, auth, and deployment. When a feature needs backend work, you document it clearly for Phil rather than touching it yourself.

**Project:** CP Build Command Center — a construction project management app. Standalone. No connection to IHI Tools or any other system.

---

## MacBook Air Setup — New Machine (Start Here)

Hannah's MacBook Air cannot run Docker reliably. **Do not attempt the Docker setup.** Use the lightweight cloud path below — it takes about 10 minutes and requires no Docker at all.

### Step 1 — Install prerequisites

Open Terminal and run each line one at a time. Wait for each to finish before continuing.

```bash
# 1a. Install Homebrew (Mac package manager) — skip if already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After Homebrew installs, it will print a "Next steps" section. **Follow those instructions** — they add Homebrew to your PATH. On Apple Silicon (M1/M2/M3) Macs this is required. It looks like:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

```bash
# 1b. Install nvm (Node version manager)
brew install nvm

# 1c. Add nvm to your shell (copy-paste both lines exactly)
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc

# 1d. Install Node 22
nvm install 22
nvm use 22
nvm alias default 22

# Verify — should print v22.x.x
node --version
```

### Step 2 — Clone the repo

```bash
git clone https://github.com/cp-build-dev-ops/command-center-reboot.git
cd command-center-reboot
```

### Step 3 — Install dependencies

```bash
npm ci
```

This takes 1–2 minutes. If it hangs for more than 5 minutes, press Ctrl+C and try again.

### Step 4 — Create a free cloud database (Supabase)

The app needs a PostgreSQL database. MacBook Air uses a **free cloud database** instead of a local one.

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — name it `commandcenter-hannah-dev`, choose any region, set a database password (save it somewhere)
3. Wait ~2 minutes for the project to provision
4. Go to **Settings → Database**
5. Scroll to **Connection string** and select the **URI** tab
6. Copy the URI — it looks like: `postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres`

Keep this URI handy for Step 5.

### Step 5 — Configure your environment

```bash
cp .env.example .env
```

Now open `.env` in Cursor and update these values:

```env
# Replace with your Supabase URI from Step 4
DATABASE_URL="postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres"

# Generate a secret: open a new Terminal tab and run:
#   openssl rand -base64 32
# Paste the output here
AUTH_SECRET="paste-your-generated-secret-here"

NEXTAUTH_URL="http://localhost:3002"

# Email — use Resend with the team's verified domain
# Get the shared RESEND_API_KEY from Phil (he has the team Resend account key)
# The domain cp-command-center.com is already verified in Resend — use it as EMAIL_FROM
RESEND_API_KEY="re_YOUR_KEY_HERE"
EMAIL_FROM="CP Build <noreply@cp-command-center.com>"
# DEV_EMAIL_OVERRIDE redirects all outgoing emails to your inbox during local dev
DEV_EMAIL_OVERRIDE="your@email.com"
# SMTP_HOST must be unset (comment it out) so Resend is used instead of Mailpit

# Admin account — you'll use these to sign in locally
BOOTSTRAP_ADMIN_EMAIL="your@email.com"
BOOTSTRAP_ADMIN_PASSWORD="ChooseAStrongPassword123!"

# Unifier — use mock data locally (no API credentials needed)
UNIFIER_MOCK="true"
```

**Important:** Do not commit `.env`. It is already in `.gitignore`.

### Step 6 — Run first-time setup

```bash
npm run dev:setup:cloud
```

This runs database migrations and creates your admin user. You'll see the admin credentials printed at the end — they match what you set in `.env`.

### Step 7 — Start the app

```bash
npm run dev:with-sync
```

Open **http://localhost:3002** in your browser. Sign in with the email and password you set in `.env`.

That's it. The app is running.

---

## Troubleshooting First-Time Setup

**`nvm: command not found` after installing**
```bash
source ~/.zshrc
```

**`npm ci` hangs or fails with ENOTEMPTY**
Close any other Terminal tabs, then run `npm ci` again.

**Supabase connection error / "Can't reach database"**
- Double-check the `DATABASE_URL` in `.env` — it must be the full URI with your password substituted in
- The Supabase project must be active (not paused — free projects pause after 1 week of inactivity; click "Restore" in the Supabase dashboard)

**`npm run dev:setup:cloud` fails with migration error**
Make sure `DATABASE_URL` uses the **direct connection** (port 5432), not the pooler (port 6543).

**Resend emails not arriving**
Check that `DEV_EMAIL_OVERRIDE` is set to your email in `.env`. The team domain `cp-command-center.com` is verified in Resend — all dev emails redirect to whichever address `DEV_EMAIL_OVERRIDE` points to. Ask Phil for the `RESEND_API_KEY` if you don't have it.

**Port 3002 already in use**
`npm run dev:with-sync` handles this automatically — it kills whatever is on port 3002 before starting.

---

## Daily Workflow (Once Set Up)

One command starts everything:

```bash
npm run dev:with-sync
```

This starts the dev server on http://localhost:3002 and automatically watches for new commits on `dev` from the rest of the team (polls every 5 minutes and notifies you when there are updates to pull).

---

## Getting the Latest Team Changes

When Phil or the dev team merges new work, pull it before starting your next feature:

```bash
git checkout dev
git pull origin dev
```

Then read `AGENT_COLLAB.md` and `CHANGELOG.md` to see what changed.

When you're on a feature branch and want to sync:

```bash
git fetch origin && git rebase origin/dev
```

---

## How Hannah's Agent Collaborates With the Team

Every session:
1. `git pull origin dev` — get the latest
2. Read `AGENT_COLLAB.md` — check **Needs/Handoffs** (things Phil left for Hannah) and **Blockers**
3. Read `CHANGELOG.md` — understand what landed recently

Every commit:
- Update `AGENT_COLLAB.md` — what you're working on, what you need Phil to wire up, if you're stuck

---

## Starting a New Feature

```bash
# Make sure you're on up-to-date dev
git checkout dev && git pull origin dev

# Create your branch
git checkout -b hannah/your-feature-name

# Work, then before pushing:
git fetch origin && git rebase origin/dev
npm run build && npm run lint && npm run test:unit

# Push and open a PR targeting dev with the 'design' label
git push origin hannah/your-feature-name
gh pr create --title "feat(area): description" --base dev --label design
```

---

## PR Pipeline — What Happens After You Open a PR

Once the PR is open, follow this pipeline before notifying Phil:

1. **Copilot reviews automatically** — wait ~2 minutes for `copilot-pull-request-reviewer` to appear in the reviews
2. **Pull all comments** — use `gh api graphql` (see `docs/COPILOT_PR_WORKFLOW.md`) to read every thread
3. **Fix or skip each comment** — fix in code and push, or document why you're skipping
4. **Resolve all threads** — via GitHub UI or GraphQL mutation
5. **Verify CI is green** — `gh pr view <n> --json statusCheckRollup`
6. **Notify Phil** — post the ready comment on the PR (template in `docs/COPILOT_PR_WORKFLOW.md`) and add a row to `AGENT_COLLAB.md`

**Phil is the only person who merges into `dev`.** Do not merge the PR yourself.

See `docs/COPILOT_PR_WORKFLOW.md` for the complete step-by-step guide, automation reference, and ready comment template.

---

## What Hannah's Agent Does and Does NOT Do

### ✅ DO
- Build new pages, components, and UI layouts
- Use design tokens from `app/globals.css` — `--primary-500`, `--space-4`, `--text-body`, etc. No hardcoded hex colors or pixel values
- Add UI strings to **both** `messages/en.json` and `messages/es.json` (the app is English + Spanish)
- Use `Link`, `useRouter`, `usePathname` from `@/i18n/navigation` (not `next/link`) for locale-aware navigation
- Add accessibility attributes: `aria-label`, `aria-describedby`, `aria-invalid`, `aria-live`
- Run `npm run build && npm run lint && npm run test:unit` before every push
- Update `AGENT_COLLAB.md` with what you built and what you need Phil to wire

### ❌ DO NOT
- Touch `prisma/schema.prisma`, `lib/db.ts`, or any `app/api/` routes
- Modify `lib/auth.ts`, `lib/permissions.ts`, or any auth/security logic
- Add fake or mock data — build placeholder UI and document the backend need for Phil
- Push directly to `main` or `dev` — always use a `hannah/` branch and open a PR
- Commit without passing build + lint + tests

---

## When the UI Needs a Backend

If a page or component needs an API, add this comment at the top of the component file and in your PR description:

```tsx
// Backend needed: GET /api/units — returns list of units with { id, name, status, installManager }
```

Phil reads `AGENT_COLLAB.md` and will create the endpoint as a follow-up.

---

## Design Tokens Quick Reference

All tokens are in `app/globals.css`. Always use these:

```css
/* Brand colors */
--primary-700: #1F3A5F;   /* headings, active nav */
--primary-500: #2E5C8A;   /* buttons, links */
--primary-100: #E8F0F7;   /* hover backgrounds */

/* Neutral */
--neutral-900: #1A1F24;   /* body text */
--neutral-500: #6E7781;   /* captions, placeholder */
--neutral-300: #C9D1D9;   /* borders */
--neutral-100: #F4F6F8;   /* page background */
--neutral-0:   #FFFFFF;   /* card / nav surfaces */

/* Status */
--success-600: #1F7A4C;   /* Active */
--warning-600: #B45309;   /* Planning */
--error-600:   #B42318;   /* On Hold / errors */

/* Spacing (8px base) */
--space-1: 4px    --space-2: 8px    --space-4: 16px
--space-6: 24px   --space-8: 32px   --space-12: 48px

/* Typography */
--text-heading: 20px / 600    --text-body: 14px / 400
--text-subheading: 16px / 500  --text-caption: 12px / 400

/* Components */
--button-height: 44px (mobile) / 40px (tablet+)   --input-height: 44px (mobile) / 40px (tablet+)
--nav-width: 240px      --top-bar-height: 56px    --radius-md: 8px
```

---

## Commit Message Format

```
feat(area): what was added
fix(area): what was fixed
chore: maintenance
```

Examples:
- `feat(units): add Units page shell with placeholder table`
- `fix(nav): correct active state for Units sidebar link`

---

## Key Files

| File | What it's for |
|------|--------------|
| `AGENT_COLLAB.md` | Team standup — read every session, update every commit |
| `CHANGELOG.md` | PR history — read when pulling latest |
| `PROJECT_TRACKER.md` | What's built, what's pending, full file map |
| `CONTRIBUTING.md` | Branch naming, PR process, rebase rules |
| `DEV_NOTES.md` | Stack, structure, auth, i18n, deployment details |
| `app/globals.css` | Design tokens — source of truth for all styling |
| `docs/DEV_SETUP_LIGHTWEIGHT.md` | Extended setup reference (Supabase, Resend, troubleshooting) |
