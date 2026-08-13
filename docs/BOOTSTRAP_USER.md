# Bootstrap User (Super Admin)

One-time setup to create an initial user account in each environment.

## Prerequisites

- Migrations applied (`npm run db:migrate` locally, or `db:deploy` in CI/Railway)
- `DATABASE_URL` for the target environment

## Create Initial Account

Run once per environment with the appropriate `DATABASE_URL`:

```bash
BOOTSTRAP_USER_EMAIL="you@example.com" \
BOOTSTRAP_USER_NAME="Your Name" \
BOOTSTRAP_USER_PASSWORD="<choose a strong, unique password>" \
BOOTSTRAP_USER_ROLE=ADMIN \
DATABASE_URL="<connection string>" \
npm run bootstrap:user
```

## Environments

| Environment | DATABASE_URL source |
|-------------|---------------------|
| **Local** | `.env` or `postgresql://postgres:postgres@localhost:5433/commandcenter` |
| **Dev** | Railway → Postgres service → Variables → `DATABASE_URL` |
| **Prod** | Railway → Postgres service (prod) → Variables → `DATABASE_URL` |

## After Bootstrap

1. Log in at the app URL with your email and password.
2. You’ll have ADMIN role (full access, including Users dashboard).
3. Change your password after first login if desired (when that feature exists).

## Notes

- Safe to run multiple times — skips if the user already exists.
- Use a strong, unique password for each environment.
- Get `DATABASE_URL` from Railway: service → Variables or Connect tab.
