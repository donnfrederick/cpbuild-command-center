# Navigation invariants

These are hard product rules from Hannah. They do not bend for any permission
flag, any screen size, any A/B test, any "just this once" tweak. If you think
one of these needs to change, ask her directly before making the change.

If you're an AI agent reading this: treat these rules with the same weight as
rules in `.cursor/rules/`. They are the enforcement layer; this file is the
explanation. A matching machine-readable rule lives at
`.cursor/rules/nav-invariants.mdc`.

---

## 1. Feedback page placement (mobile)

**The Feedback page (`/feedback` / "Submit Feedback") lives ONLY in the
profile-icon menu in the top-right corner (`MobileAccountPanel`). It MUST NOT
appear in the mobile bottom nav.**

Why: feedback is a low-frequency utility. Giving it a top-level nav slot
pushes higher-frequency destinations (projects, forms, users) off the bar and
signals to users that submitting feedback is a primary workflow — it isn't.

How it's enforced:

- `components/layout/MobileBottomNav.tsx` has a header comment and does not
  render feedback. The `canViewFeedback` prop is kept in the interface only
  for backwards compatibility with `app/[locale]/(dashboard)/layout.tsx`; the
  component ignores it.
- `__tests__/unit/MobileBottomNav.unit.test.tsx` has an explicit invariant
  test: "DOES NOT include the feedback page in the bottom nav". If this test
  fails in the future, fix the regressed component — do not delete or weaken
  the test.
- `components/layout/MobileAccountPanel.tsx` is the only mobile surface that
  renders a "Submit Feedback" menu row.

If future work introduces a new mobile nav surface, it inherits this rule.
Only `MobileAccountPanel` shows feedback.

---

## 2. (placeholder for future invariants)

Add to this doc whenever Hannah clarifies a nav placement rule a second time.
The heuristic: if you've caught an AI agent (or a developer) breaking a rule
twice, write it down here and in `.cursor/rules/nav-invariants.mdc`.
