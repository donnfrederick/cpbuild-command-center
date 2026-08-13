import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],

    // Named pools let `--project` filtering work:
    //   npm run test:unit        → only __tests__/unit/**
    //   npm run test:integration → only __tests__/integration/**
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "."),
            // next-intl (ESM) imports "next/navigation" without the .js extension,
            // which fails Node module resolution in Vitest. Map to the file directly.
            "next/navigation": path.resolve(__dirname, "node_modules/next/navigation.js"),
          },
        },
        test: {
          name: "unit",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["__tests__/unit/**/*.{test,spec}.{ts,tsx}"],
          server: {
            deps: {
              // Force next-intl through Vite's resolver so its bare-specifier
              // ESM imports (e.g. "next/navigation") resolve correctly in jsdom.
              inline: ["next-intl"],
            },
          },
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { "@": path.resolve(__dirname, ".") } },
        test: {
          name: "integration",
          globals: true,
          environment: "node",
          setupFiles: ["./vitest.integration.setup.ts"],
          include: ["__tests__/integration/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],

    // ── Coverage ────────────────────────────────────────────────────────
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**", "components/**", "app/api/**", "hooks/**"],
      exclude: [
        "**/*.d.ts",
        "**/node_modules/**",
        "components/ui/**",
        "components/devtools/**",
        "app/api/auth/**",
        "app/api/devtools/**",
        "app/api/design-tokens/**",
        "lib/auth.ts",
        "lib/db.ts",
        "lib/email.ts",
        "lib/ai/types.ts",
        "lib/msw/**",
        "lib/tour/**",
        "lib/azure-keyvault.ts",
        "lib/design-tokens-server.ts",
        "lib/dev-logger.ts",
        "components/projects/CreateProjectModal.tsx",
        "components/projects/ProjectsTable.tsx",
        "components/account/OfflinePreferences.tsx",
        "components/admin/BriefingAnalysisTab.tsx",
        "app/api/daily-briefing/analysis/route.ts",
        "components/auth/**",
        "components/layout/**",
        "components/team/**",
        "app/api/invites/route.ts",
        "app/api/invites/accept/**",
        "app/api/offline/snapshot/**",
        "app/api/projects/[id]/route.ts",
        "app/api/team/[id]/**",
        "components/shared/DevSwCleanup.tsx",
      ],
      thresholds: { lines: 75, functions: 63, branches: 60 },
    },
  },
});
