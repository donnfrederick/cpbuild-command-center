# Mobile-first density — design principle

> **Audience:** AI agents and contributors producing UI for CP Build.
> **Source of truth for:** how compact, mobile-optimized our UI defaults are.
> **Companion Cursor rule:** `.cursor/rules/mobile-density.mdc` (alwaysApply).

## Why this exists

CP Build is used by field inspectors on phones, often outdoors, often with
gloves, often with the screen at 50 % brightness in direct sunlight. Every
pixel of vertical space matters. Every unnecessary label is cognitive
overhead. Every extra toolbar button is a potential mistap.

Hannah (the designer driving this app's UX) has pushed back repeatedly on
UI that looks reasonable on a 1440-px laptop but falls apart on a 375-px
phone. Rather than waiting for her to push back, the agent should default
to compact, icon-first, mobile-first UI on the **first draft**.

## The rules (condensed)

See `.cursor/rules/mobile-density.mdc` for the canonical list. The short
version:

1. **Icons beat labels** for secondary actions. Only the primary CTA gets
   a text label.
2. **Autosave replaces explicit Save** where data is persistent.
3. **Header toolbars**: at most 3 actions, at most 1 labeled.
4. **Tap targets** come from padding around icons, not oversized labels.
5. **Spacing defaults are tight** — and they're **maximums, not targets**.
   Start at 10–12 px padding on cards / rows / list wrappers on mobile.
   Don't double-pad (page wrapper + card both at 16 px = 32 px lost).
6. **The 320 px test**: imagine the screen at iPhone SE width before
   shipping.
7. **Never nest padded containers on mobile.** Max 2 levels of padding.
8. **Reserve space for actions; don't float them over content.** Action
   buttons in cards/rows are flex siblings, never absolute-positioned
   overlays. Absolute positioning lets long titles flow underneath.
9. **No decorative icons on repeating list items.** If the icon is the
   same on every row, delete it — it eats width without adding signal.
10. **When in doubt, cut.** Fewer elements always.

## Worked examples

### Form builder top bar

**Before (wrong):**

```
[← Forms]  |  [Draft]  .............  [Saved]  [👁 Preview]  [Save draft]  [Publish]
```

Four labeled buttons. Divider chrome. Overflows on anything narrower than
~580 px. Feedback from Hannah: "Unpublish is cut off."

**After (right):**

Draft state:

```
[←]  [Draft]  .............  Saved  [👁]  [💾]  [ Publish ]
```

Published state:

```
[←]  [Published]  ..........  Saved  [👁]  [ Unpublish ]
```

- Back is icon-only; the "Forms" label was chrome.
- Vertical divider removed — the status pill provides the visual grouping.
- Preview and Save are icon-only ghost buttons (32×32 tap target).
- Publish keeps its label — it's the single primary CTA.
- Unpublish keeps its label when published — context makes icon ambiguous.

### Tap target anatomy

A 16 px icon inside a 32×32 container with neutral hover background is the
same tap area as a labeled 80 px button, at 40 % of the width. Always
prefer that ratio.

```tsx
<button
  aria-label="Preview form"
  title="Preview as an inspector"
  style={{ width: 32, height: 32, borderRadius: 7, ... }}
>
  <Eye size={16} aria-hidden />
</button>
```

### Autosave indicator + icon save (belt-and-suspenders)

When the product has autosave AND you want an explicit Save button for
user comfort:

```
...  Saved  [💾]  [ Publish ]
      ^^^^^  ^^^
      live   icon-only ghost button
      state  (same shape as Preview)
```

Never pair autosave with a *labeled* Save button — the label is the thing
that eats width on narrow screens.

### Flattening nested containers

**Before (wrong):** 3 levels of padding eat ~84 px of a 320 px viewport.

```
┌─ Question card · padding 16 ───────────────────┐
│  ┌─ Amber callout · padding 14 ─────────────┐  │
│  │  ┌─ White inner card · padding 12 ───┐   │  │
│  │  │ Deficiency 1                      │   │  │
│  │  │ [describe the deficiency...]      │   │  │
│  │  │ Severity: [Minor][Major][Critical]│   │  │
│  │  └───────────────────────────────────┘   │  │
│  │  ┌─ White inner card · padding 12 ───┐   │  │
│  │  │ ...                                │   │  │
│  │  └───────────────────────────────────┘   │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**After (right):** 2 levels. The amber box IS the container; deficiencies
are separated by 1 px top borders, not by nested cards.

```
┌─ Question card · padding 16 ───────────────────┐
│  ┌─ Amber callout · padding 14 ─────────────┐  │
│  │ DEFICIENCIES · 2                         │  │
│  │ ─────────────────────────────────────── │  │
│  │ Deficiency 1                         [×] │  │
│  │ [describe the deficiency...]             │  │
│  │ Severity: [Minor][Major][Critical]       │  │
│  │ [Add photo]                              │  │
│  │ ─────────────────────────────────────── │  │
│  │ Deficiency 2                         [×] │  │
│  │ ...                                      │  │
│  │ ─────────────────────────────────────── │  │
│  │ [+ Add another]                          │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

Saves 24 px of content width. Same semantic grouping, simpler DOM, faster
to scan.

## When to break the rules

- On **very** data-dense analytics dashboards aimed at desktop-only users
  (BI_ANALYST role on `/reports/*`), labels may be appropriate on
  secondary actions. Flag this explicitly in code comments when doing so.
- Destructive actions inside overflow menus (e.g. "Delete this form")
  should have icon + label — the friction is intentional.
- First-time onboarding/empty-state CTAs can be more verbose because
  discoverability matters more than density there.

Outside those exceptions, apply the rules.

## How Hannah trains the agent on this

If Hannah has to say "this is too crowded" or "make this an icon" on UI
the agent just shipped, that's the agent's tell that the rules weren't
applied. Re-read this file and the companion `.cursor/rules/` rule at the
start of any UI task to reset defaults.
