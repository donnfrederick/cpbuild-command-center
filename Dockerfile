# Use node:22-slim (resolves to latest 22.x LTS, currently 22.22.0).
# This matches what GH Actions resolves node-version:"22" to, ensuring
# Railway and CI use the same Node version. Bypasses nixpacks entirely.
#
# When upgrading Node: change 22 → XX here and in .node-version / .nvmrc.
FROM node:22-slim

# Runtime dependencies:
#  - openssl: Prisma requires it at both build and runtime
#  - libnss3, libatk1.0-0, libatk-bridge2.0-0, libcups2, libdrm2, libxkbcommon0,
#    libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libpango-1.0-0,
#    libcairo2, libasound2, libnspr4, libx11-6, libxcb1, libxext6, libxi6,
#    libxrender1, libxtst6, libgtk-3-0, libglib2.0-0, libexpat1, libfontconfig1,
#    libdbus-1-3, ca-certificates, fonts-liberation:
#    Shared libraries needed by the headless Chromium binary downloaded by
#    @sparticuz/chromium-min at runtime. The "-min" build ships just the
#    executable and assumes the host provides these libs (it was designed for
#    AWS Lambda / Vercel environments). On node:22-slim they are absent, so
#    every PDF export (activity log, observations, issues) would fail at
#    `puppeteer.launch()` with "libnss3.so: cannot open shared object file".
#    This list mirrors the one puppeteer documents for Debian-based containers.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files + .npmrc before npm ci so legacy-peer-deps and
# engine-strict=false are active during install.
# Also copy prisma/ so the postinstall `prisma generate` can find schema.prisma.
# Keeping --ignore-scripts off means all package lifecycle scripts run normally
# (required for packages that download platform binaries in postinstall).
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
RUN npm ci

# Layer 2: remaining source + build
#
# We skip `npm run db:generate` here because it was already run by `postinstall`
# immediately after `npm ci` above (line 63). Since the `prisma/` directory is
# copied BEFORE `npm ci` (line 62), the postinstall `prisma generate` already
# ran against the correct schema. Re-running it after the full `COPY . .` was
# redundant (~30–60s on Railway's build step) unless prisma/schema.prisma
# changes between the two COPYs — which cannot happen in a single build.
COPY . .
RUN npm run build

# Do NOT set EXPOSE — Railway auto-injects PORT into the container and uses
# that port for both traffic routing and health checks. Setting EXPOSE 3000
# here causes Railway to probe port 3000 while Next.js listens on the
# injected PORT (8080), producing "service unavailable" health check failures.
#
# Railway overrides CMD with the service-level "Start Command":
#   npx prisma migrate deploy && npm run bootstrap:admin && npm run start
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
