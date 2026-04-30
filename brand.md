# Brand — Mortem

> Case File № 003 · Brand Bible · Rev 1.0 · 2026-04-30
>
> Ship. Bury. Repeat.

This file is the source of truth for Mortem's color, typography, and voice. The `frontend-design-guidelines` skill reads it; the dashboard's `globals.css` and `layout.tsx` enforce it.

## 1 · Voice

We don't hype. We file.

| Surface | Tagline |
|---|---|
| Primary | Ship. Bury. Repeat. |
| Product | *Every project gets a death certificate.* |
| Short | A SMALL GROUP. BURYING WHAT'S DEAD. |

**Do:** name the cause not the symptom; verbs of finality (*ship, bury, certify, file, autopsy*); coroner-calm.
**Don't:** emoji, exclamation points, "oops", hype.

| Bad | Good |
|---|---|
| Oops! Something went wrong | Something died. We're writing the autopsy. |
| Delete this run? | Bury this run? It won't come back. |
| Loading… | Measuring pulse… |
| Success! | Filed. |
| Error 500 | Cause of death: 500 |

## 2 · Color

Three colors. No more. Tokens in `apps/dashboard/src/app/globals.css`.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0E0D0C` | Dominant background |
| `--paper` | `#EDEEE9` | Body text on ink, paper surfaces |
| `--signal` | `#DC2626` | Mark, accents, alarms, deceased state |

Supporting dark scale: `--ink-2` (card), `--ink-3` (raised), `--line` (divider), `--line-dim`, `--fg-faint`, `--fg-muted`.

**Ratio:** 60 ink · 30 paper · 10 signal.

**Forbidden:** blue, orange, second neutral, tinted reds, semantic green. A success toast just says it shipped — *Filed.*

## 3 · Typography

| Role | Family | Use |
|---|---|---|
| Display | Instrument Serif | Headlines, quotes, memorials. Italics carry tone shifts. |
| UI | Inter Tight | Body, buttons, navigation, forms. |
| Evidence | JetBrains Mono | Labels, code, case tags, timestamps. ALL CAPS · `.16em` letter-spacing. |

Loaded via `next/font/google` in [apps/dashboard/src/app/layout.tsx](apps/dashboard/src/app/layout.tsx). Headlines may end with a red period (`.stamp` utility): *Mortem.*

## 4 · The mark — M-Block

120u red square, two 16u paper legs inset 18u, 16u miter V apex y=62, 4u ink underline at y=108. Source: [apps/dashboard/src/components/mortem/mark.tsx](apps/dashboard/src/components/mortem/mark.tsx).

**Don't:** round corners, tilt, gradient the field, recolor outside palette, add shadow/glow/3D, thicken strokes.

## 5 · Layout

- 8px design grid; the M-Block uses a 12u construction grid — keep them separate.
- No border-radius. Anywhere. Except iOS app icon (20px) and avatars.
- Section padding: 40px desktop, 24px mobile. Card padding: 24–32px.
- Cards are bordered, square, on `--ink-2`. Use the `eyebrow`, `case-meta`, `stamp`, `tape`, and `death-stamp` utilities in `globals.css` instead of one-off classes.

## 6 · Motion

Clinical, not playful. 200–280ms, `cubic-bezier(.2, .8, .2, 1)`. ALIVE → DECEASED is a hard cut to red, never a fade. No bounce, no spring, no parallax.

---

**☩ Ship · Learn · Bury · Repeat ☩**
