## Description

<!-- What does this PR do, and why? One paragraph is enough. -->

## Context Lint

*Check every item that applies. If it applies and the doc wasn't updated, do it now — the doc-update check will label this PR.*

- [ ] Made an architectural or implementation decision → added entry to `docs/decisions/decision-log.md`
- [ ] Added or changed an API route shape → updated `docs/contracts/api-contracts.md`
- [ ] Changed `prisma/schema.prisma` → updated `docs/contracts/db-schema-notes.md`
- [ ] Changed a shared pattern, convention, or anti-pattern → updated `docs/packs/base-pack.md`
- [ ] Added new UI strings → added to both `messages/en.json` and `messages/es.json`

## Pre-Merge Checklist

- [ ] `npm run build` passes (no TypeScript errors)
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run test:unit` passes
- [ ] New code has matching tests (see `.cursor/rules/testing.mdc`)
- [ ] No secrets, credentials, or `.env` files committed
- [ ] PR targets `dev` (not `main`)
- [ ] Design tokens used from `app/globals.css` (if styling changes)
