# Handoff: Aura mobile — "Lights Out / Monokai" (direction 3A)

## Overview

Visual and interaction design for the Aura mobile app's core loop: a school-scoped anonymous
voting game for high schoolers. Each round the user answers superlative-style prompts
("Hottest in the junior class?") by picking one of four classmates. People who get picked
receive an anonymous "flame" and can spend candy (soft currency) or subscribe to God Mode
(hard paywall) to reveal who picked them.

The repo (`apps/mobile`, Expo + expo-router + NativeWind) already implements this loop
functionally — start round, submit votes, inbox, reveals, coins, God Mode. **What did not
exist was any visual design**: screens render with default Tailwind (black text, gray
borders, no layout system). This handoff is that design layer.

Approved direction is **3A**: Monokai Pro greys as the ground, a bright candy accent palette,
chunky rounded type, and "toy button" solid drop shadows. Eight screens are designed. Two
rejected directions (1A acid yellow-on-black, 2A plum) are in the design doc for context but
should be ignored.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing
intended look and behavior. They are not production code to copy. The task is to recreate
these designs in `apps/mobile` using its existing environment: **React Native, expo-router,
NativeWind (Tailwind class names on RN primitives)**, and the shared `@aura/api-client`
hooks that are already wired up.

Concretely: every hex value, radius, font size, and copy string below should land in
NativeWind classes or a theme extension in `apps/mobile/tailwind.config.js`. The HTML uses
`box-shadow` for the toy-button effect; in React Native that is not available — see
**Toy button shadows** under Interactions.

## Fidelity

**High fidelity.** Colors, typography, spacing, radii, and copy are final. Recreate
pixel-accurately at a 402 × 874 logical viewport (iPhone 16 Pro class). Nothing here is a
placeholder except the avatar initials and student names, which are sample data.

---

## Design tokens

### Ground / surface (Monokai Pro)

| Token | Hex | Use |
| --- | --- | --- |
| `ground` | `#221F22` | Screen background, every screen |
| `surface` | `#403E41` | Chips, secondary buttons, tab bar, price cards, read flame rows |
| `raised` | `#4A474B` | Callout banner behind the "somebody picked you 4×" line |
| `cream` | `#FFF6E8` | Candidate cards, flame rows, scratch card, God Mode name list |
| `cream-inner` | `#F2E7D4` | Nested block inside a cream card |
| `cream-rule` | `#E4D6BF` | 1.5px divider inside cream cards |
| `cream-shadow` | `#D9C7AF` | Solid drop shadow under cream cards |

### Text

| Token | Hex | Use |
| --- | --- | --- |
| `text-primary` | `#FFFFFF` | Display headings on ground |
| `text-bright` | `#FCFCFA` | God Mode benefit list |
| `text-secondary` | `#C1C0C0` | Body copy on ground |
| `text-muted` | `#9A989B` | Labels, subtitles, meta on ground |
| `text-dim` | `#848286` | Inactive tab labels |
| `text-faint` | `#727074` | Footnotes, "Later", fine print |
| `text-chevron` | `#B0AEB2` | `›` on cream rows |
| `text-on-cream` | `#2D2A2E` | Names and values on cream |
| `text-on-cream-muted` | `#8B888D` | Grade / school meta on cream |
| `text-scratch-hidden` | `#5B585C` | Unscratched tile glyph |

### Accents (unchanged from 2A — these are the brand)

| Accent | Fill | Solid shadow | Text on fill |
| --- | --- | --- | --- |
| Pink (primary CTA, unread, alerts) | `#FF5CA8` | `#C43A7C` | `#FFFFFF` |
| Mint (God Mode, success, active tab) | `#6BF2C2` | `#3FBF95` | `#0A3B2C`, secondary `#12664C` |
| Yellow | `#FFD84D` | `#D4AC17` | `#3A2A00`, secondary `#7A5A00` |
| Purple | `#7C5CFF` | `#5334D6` | `#FFFFFF` |
| Orange (streak) | `#FF7A3D` | `#C4501E` | `#FFFFFF`, secondary `#FFE0CE` |
| Green (revealed state text) | — | — | `#2E8F6E` |
| Pink text on raised | — | — | `#FFC9E4` |

Rule: exactly one accent per element; never gradient. Candidate card avatars cycle
pink → mint → purple → yellow in grid order.

### Typography

Two families, both Google Fonts (load via `expo-font` / `@expo-google-fonts`):

- **Fredoka 700** — display only: screen titles, prompt text, big numbers, button labels.
- **Nunito** — everything else. 700 for meta, 800 for labels and secondary buttons, 900 for
  names, values, and tab labels.

| Role | Family / weight | Size | Line height |
| --- | --- | --- | --- |
| Screen title ("Your flames", "God Mode") | Fredoka 700 | 36 / 44 | 1.0 |
| Prompt question | Fredoka 700 | 31 | 1.08 |
| Reveal title | Fredoka 700 | 31 | 1.08 |
| Primary button label | Fredoka 700 | 19–20 | 1.0 |
| Card / banner heading | Fredoka 700 | 20 | 1.0 |
| Avatar initials | Fredoka 700 | 21 (large) / 15 (small) | 1.0 |
| Price | Fredoka 700 | 26 | 1.0 |
| Person name | Nunito 900 | 17 | 1.0 |
| Flame prompt line | Nunito 900 | 15 | 1.25 |
| Stat value | Nunito 900 | 14 | 1.0 |
| Benefit line | Nunito 800 | 15 | 1.0 |
| Secondary button | Nunito 800 | 15 | 1.0 |
| Meta ("11th · Lakeview") | Nunito 700 | 13 | 1.0 |
| Section label (all caps) | Nunito 900 | 12–13 | 1.0 |
| Footnote | Nunito 700–800 | 12.5 | 1.0 |
| Badge ("NEW", "BEST DEAL") | Nunito 900 | 10.5–11 | 1.0 |

Minimum text size anywhere: 10.5px, and only on badges.

### Radius

`100px` pills (buttons, chips, avatars, progress, badges) · `30px` scratch card ·
`26px` prompt card, God Mode name card, tab bar · `24px` candidate card ·
`22px` flame row, price card · `20px` scratch tile, callout, inner cream block ·
`16px` flame row icon square.

### Spacing

Screen padding: `56–60px` top (below status bar), `20–22px` horizontal, `28–34px` bottom.
Exception: the scratch reveal (screen 3) uses `34px` horizontal so the card reads as a card
floating on the ground rather than a full-bleed sheet.
Vertical rhythm between blocks: `14 / 16 / 18 / 20 / 22 / 26px`. Grid and list gap: `10–12px`.

### Toy button shadows

The signature of this direction. A solid, un-blurred offset in the element's own darker
shade — never a soft shadow.

| Depth | HTML | Elements |
| --- | --- | --- |
| 3px | `0 3px 0 <dark>` | Small avatars, streak chip |
| 4px | `0 4px 0 #D9C7AF` | Flame rows |
| 5px | `0 5px 0 <dark>` | Candidate cards, primary CTAs, God Mode banner, semester card |
| 6px | `0 6px 0 #D9C7AF` | God Mode name card |
| 7px | `0 7px 0 #D9C7AF` | Scratch card |

**React Native has no un-blurred box-shadow.** Implement as a wrapper `View` with the
shadow color as `backgroundColor`, the same `borderRadius`, and the child offset upward by
the depth — or on RN 0.76+, `boxShadow: '0 5px 0 #C43A7C'` on the View style, which is
supported in the New Architecture. Do not substitute `elevation` or a blurred iOS shadow;
the flat offset is the whole look.

---

## Screens

Eight screens. Every one: `ground` background, column flex, content top-aligned, final
element pushed to the bottom with `marginTop: auto`.

### 1. Vote — `apps/mobile/app/(app)/aura.tsx`

**Purpose.** The core loop. User sees a prompt and four classmates, taps one, advances.

**Layout, top to bottom:**

1. **Status row** — `space-between`.
   - Streak chip: orange `#FF7A3D` pill, `0 3px 0 #C4501E`, padding `7px 14px`, gap 7px.
     `🔥` 15px · `12` Nunito 900 15px white · `days` Nunito 800 13px `#FFE0CE`.
   - Candy chip: `surface` pill, same padding. `🍬` 14px · `48` Nunito 900 15px white.
2. **Progress row** (24px below) — 10px-tall `surface` track, `100px` radius, mint
   `#6BF2C2` fill at `37.5%` (3 of 8), then `3/8` in Nunito 800 13px `#9A989B`, gap 6px.
3. **Prompt card** (26px below) — `surface`, radius 26, padding 20, `position: relative`.
   - Sticker badge, absolutely positioned `top:-14px left:20px`, `rotate(-3deg)`: yellow
     `#FFD84D` pill, padding `5px 12px`, Nunito 900 12px `#3A2A00`,
     copy `EVERYONE'S VOTING ON THIS`.
   - Emoji `🥵` 40px, `wobble` animation (see Interactions).
   - Question: Fredoka 700 31px/1.08 white, `text-wrap: balance`.
   - Subline: Nunito 700 13.5px `#9A989B` —
     `They'll know they got picked. Never that it was you.`
4. **Candidate grid** (18px below) — 2 × 2, gap 12.
   Each card: `cream`, radius 24, padding `16px 14px`, `0 5px 0 #D9C7AF`, column gap 11.
   - Avatar: 54 × 54 circle, accent fill, `0 3px 0 <accent-dark>`, initials Fredoka 700 21px.
   - Name: Nunito 900 17px `#2D2A2E`. Meta: Nunito 700 13px `#8B888D`.
   - Sample: Maya R. (pink), Deven K. (mint), Sofia O. (purple), Tyler L. (yellow) —
     first three `11th · Lakeview`, Tyler `12th · Lakeview`.
5. **Utility row** (16px below) — two equal `surface` pills, padding 13, centered
   Nunito 800 15px `#C1C0C0`: `🔄 New four` and `Skip ⏭`.
6. **Tab bar** (`marginTop: auto`, `marginBottom: 28px`) — `surface`, radius 26,
   padding `12px 6px`, four 78px-wide items, `space-between`.
   - Active (Vote): glyph in a mint `#6BF2C2` pill (`padding 6px 14px`, radius 100),
     label Nunito 900 11px `#6BF2C2`.
   - Inactive: bare 19px glyph, label Nunito 900 11px `#848286`.
   - Items: `🗳 VOTE`, `🔥 FLAMES`, `🏆 RANKS`, `😎 ME`.
   - FLAMES badge: absolute `top:-2px right:14px`, pink `#FF5CA8` circle, min-width 20,
     height 20, `2px` border in `surface` to punch it off the bar, Nunito 900 11px white.

Tap target note: candidate cards are ~175 × 130 and tab items 78 × 56 — both well over 44.

### 2. Flames inbox — `apps/mobile/app/(app)/inbox.tsx`

**Purpose.** Everything you've received. This is the screen that drives monetization.

1. **Header** — `Your flames` Fredoka 700 36px white; subline
   `7 people picked you this week 👀` Nunito 700 14px `#9A989B`.
2. **God Mode banner** (20px below) — mint `#6BF2C2`, radius 24, padding `17px 19px`,
   `0 5px 0 #3FBF95`, `space-between`.
   `See who picked you` Fredoka 700 20px `#0A3B2C`; `God Mode · free for 3 days`
   Nunito 800 12.5px `#12664C`; `😈` 26px.
3. **Curiosity callout** (14px below) — `raised` `#4A474B`, radius 20, padding `14px 16px`,
   `🫣` 19px + `Somebody picked you 4 times this week. Bold of them.` Nunito 800 13.5px
   `#FFC9E4`.
4. **Flame list** (20px below, gap 10). Three states:
   - **Unread** — `cream` row, radius 22, padding 15, `0 4px 0 #D9C7AF`. 46 × 46 icon square
     radius 16 in an accent fill with a 23px emoji; prompt Nunito 900 15px/1.25 `#2D2A2E`;
     meta Nunito 700 12.5px `#8B888D`; trailing pink `NEW` pill (Nunito 900 11px white,
     padding `5px 10px`).
     Sample: `🥵 Hottest in the junior class` / `Girl · 11th grade · 🔒 name hidden`.
   - **Partially revealed** — same, trailing `›` 20px `#B0AEB2`.
     Sample: `😏 Biggest flirt in 3rd period` / `Boy · 12th grade · starts with J`.
   - **Fully revealed** — meta line turns Nunito 800 12.5px green `#2E8F6E`:
     `✅ Revealed: Maya R.`
   - **Read / archived** — `surface` row, no shadow, icon square `raised`, prompt
     `#C1C0C0`, meta `#848286`, chevron `#727074`.
     Sample: `🎤 Would go viral first` / `Boy · 10th grade · already opened`.
5. **Footer** (`marginTop: auto`, padding `16px 0 32px`) — centered
   `flames disappear after 30 days ✨` Nunito 800 12.5px `#727074`.

The read-receipt state ("already opened") is deliberate: the sender's reveal screen shows
whether the recipient has opened their flame.

### 3. Scratch reveal — new modal route, e.g. `app/(app)/reveal/[flameId].tsx`

**Purpose.** The dopamine beat. Replaces the slot-machine reel from 1A — same
progressive-disclosure mechanic, read as a scratch card rather than a casino reel.

1. **Eyebrow** — `SCRATCH TO REVEAL` Nunito 900 13px `#9A989B`, centered.
2. **Title** (8px below) — `Who thinks you're the hottest junior?` Fredoka 700 31px/1.08
   white, centered, `text-wrap: balance`.
3. **Scratch card** (26px below) — `cream`, radius 30, padding 22, `0 7px 0 #D9C7AF`,
   column gap 16.
   - **Tile row** (gap 10) — three equal tiles, radius 20, padding `14px 10px`, centered
     column gap 3. Each: 22px emoji, Fredoka 700 19px value, Nunito 900 10.5px state label.
     - Scratched: mint `#6BF2C2` — `🎓` / `11th` / `SCRATCHED` (`#0A3B2C`, `#12664C`).
     - Scratched: yellow `#FFD84D` — `👧` / `Girl` / `SCRATCHED` (`#3A2A00`, `#7A5A00`).
     - Unscratched: `#B0AEB2` — `🪙` / `M?` / `TAP HERE` (`#5B585C`, `#727074`).
   - `1.5px` `#E4D6BF` rule.
   - **Stat rows** (gap 9) — label Nunito 800 14px `#8B888D`, value Nunito 900 14px
     `#2D2A2E`: `Picked you` / `4 times 🔥` · `Since` / `2 weeks ago` ·
     `Also picked you for` / `2 other prompts` · `In their grade you're` /
     `their #1 pick 🏆`.
   - **Cross-sell block** — `cream-inner` `#F2E7D4`, radius 20, padding `14px 16px`,
     `🫂` 22px + `3 other people picked you too` Nunito 900 14px `#2D2A2E` /
     `Two juniors and a senior. Scratch them next.` Nunito 700 12.5px `#8B888D`.
4. **Primary CTA** (22px below) — pink `#FF5CA8` pill, padding 17, `0 5px 0 #C43A7C`,
   Fredoka 700 19px white: `Scratch the last one · 🍬 3`.
5. **Secondary CTA** (12px below) — `surface` pill, padding 15, Fredoka 700 17px mint
   `#6BF2C2`: `Skip the wait · God Mode 😈`.
6. **Refill line** (14px below) — `Free scratch every day at 3pm` Nunito 800 13.5px
   `#9A989B`, centered.
7. **Dismiss** (`marginTop: auto`, `paddingBottom: 30px`) — `Later` Nunito 800 14px `#727074`.

**Reveal order is fixed:** grade → gender → first initial → full name. The first two are
free on open; the third costs 3 candy; the full name is God Mode only. Each step is a
separate paid decision, which is the point.

### 4. God Mode paywall — replaces `src/components/GodModeOverlay.tsx`

1. **Close** — `✕` 22px `#727074`, right-aligned.
2. **Mark** (4px below) — `😈` 46px in a 56px box, `wobble` animation.
3. **Title** (6px below) — `God Mode` Fredoka 700 44px mint `#6BF2C2`.
4. **Subtitle** (8px below) — `Stop guessing. Get the actual names.` Nunito 700 15.5px/1.4
   `#C1C0C0`.
5. **Teaser card** (20px below) — `cream`, radius 26, padding 17, `0 6px 0 #D9C7AF`, gap 13.
   Three rows: 36px circle avatar (accent fill, Fredoka 700 15px initial), name
   Nunito 900 15px `#2D2A2E`, trailing 16px emoji.
   - Row 1 sharp: `M` pink / `Maya R. picked you` / `🥵`
   - Row 2 `blur(3.5px)`: `J` purple / `Jordan P. picked you` / `😏`
   - Row 3 `blur(4.5px)`: `A` mint / `Amara T. picked you` / `💅`
   - Footer: `+ 5 MORE HIDING IN HERE` Nunito 900 12.5px `#8B888D`, centered.
   In RN use `expo-blur` or pre-blurred placeholder rows; the progressive blur down the
   stack is intentional.
6. **Benefits** (20px below, gap 10) — `✅` 16px + Nunito 800 15px `#FCFCFA`:
   `Real names on every flame` · `Double candy every round` ·
   `Unlimited scratches, no waiting` · `Vote in stealth mode`.
7. **Price cards** (20px below, gap 11) — two equal, radius 22, padding `16px 13px`.
   - Weekly: `surface`. Label `WEEKLY` Nunito 900 12px `#848286`; `$6.99` Fredoka 700 26px
     white; `every week` Nunito 700 12px `#848286`.
   - Semester (selected): mint `#6BF2C2`, `0 5px 0 #3FBF95`. Sticker badge absolute
     `top:-12px left:11px`, `rotate(-3deg)`, pink pill, Nunito 900 10.5px white,
     `BEST DEAL`. Label `SEMESTER` `#12664C`; `$29.99` Fredoka 700 26px `#0A3B2C`;
     `$1.50 a week` `#12664C`.
8. **CTA** (`marginTop: auto`, `paddingBottom: 32px`) — pink pill, padding 18,
   `0 5px 0 #C43A7C`, Fredoka 700 20px white: `Try 3 days free`. Below it, 12px gap,
   centered `Then $29.99 a semester. Cancel whenever.` Nunito 700 12.5px `#727074`.

### 5. Ranks board — new route, `app/(app)/ranks.tsx`

**Purpose.** Public school-wide leaderboard. The social-proof engine and the reason to care
about your own flame count.

1. **Header** — `The board` Fredoka 700 36px white; subline `Most flames at Lakeview this
   week` Nunito 700 14px `#9A989B`. Right-aligned orange pill, `0 3px 0 #C4501E`, padding
   `6px 12px`, Nunito 900 12px white: `⏳ 2d left`. Pill must not shrink or wrap.
2. **Filter chips** (18px below, gap 8) — radius 100, padding `8px 15px`. Active: mint fill,
   Nunito 900 13px `#0A3B2C`. Inactive: `surface`, Nunito 800 13px `#C1C0C0`.
   `Overall` (active) · `My grade` · `Hottest`.
3. **Podium** (20px below, gap 9, `align-items: flex-end`) — three `cream` cards, centered
   columns, gap 6. Second and third: `flex: 1`, radius 22, padding `14px 8px`,
   `0 4px 0 #D9C7AF`, 46px avatar, name Nunito 900 14px, score Fredoka 700 20px, rank label
   Nunito 900 11px `#8B888D`. First: `flex: 1.14`, radius 24, padding `18px 8px`,
   `0 6px 0 #D9C7AF`, 56px avatar, name 15px, score Fredoka 700 26px, plus a yellow sticker
   badge absolute `top:-13px`, `rotate(-3deg)`, Nunito 900 11px `#3A2A00`: `👑 THE ONE`.
   Order left-to-right is 2nd, 1st, 3rd. Sample: Tyler L. 171 (mint), Maya R. 184 (pink),
   Sofia O. 158 (purple).
4. **Ranks 4–8** (18px below, gap 8) — five `surface` rows, radius 20, padding `13px 15px`,
   gap 13: rank number Fredoka 700 17px `#848286` in a 26px column, 38px avatar
   (Fredoka 700 14px, accent fill cycling yellow → mint → pink → purple → yellow), name
   Nunito 900 15px white, grade Nunito 700 12.5px `#848286`, score Nunito 900 15px
   `#C1C0C0`. Sample: Jordan P. 121, Amara T. 104, Nico V. 97, Ella H. 88, Marcus B. 81.
   Then a centered `· · ·` Nunito 800 12.5px `#727074` marking the truncation.
   Render at least five rows here — a short list leaves dead space above the pinned card and
   makes the `· · ·` read as a load failure. The list scrolls; ranks 9+ live below the fold.
5. **Your rank** (`marginTop: auto`, `marginBottom: 28px`) — pink card, radius 24, padding
   `17px 19px`, `0 5px 0 #C43A7C`, gap 14: `14` Fredoka 700 30px white,
   `You · 62 flames` Nunito 900 15px white, `6 more flames cracks the top 10`
   Nunito 800 12.5px `#FFD6E9`, trailing `📈` 24px.

Your own row is always pinned at the bottom regardless of scroll position, and always pink —
it is the only pink element on the screen.

### 6. Profile — `apps/mobile/app/(app)/profile.tsx` (currently a stub)

**Purpose.** Your own trophy case, plus the invite loop.

1. **Nav row** — `‹` 22px `#727074` left, `⚙️` 20px right.
2. **Identity** (14px below, gap 15) — 78px pink circle avatar, Fredoka 700 29px white,
   `0 4px 0 #C43A7C`, `flex-shrink: 0`. Beside it: `Riley B.` Fredoka 700 28px white,
   `11th grade · Lakeview High` Nunito 700 13.5px `#9A989B`, and an orange streak pill
   (`align-self: flex-start`, padding `4px 11px`, `0 3px 0 #C4501E`, Nunito 900 13px white)
   reading `🔥 12 day streak`.
3. **Stat trio** (22px below, gap 9) — three equal `surface` cards, radius 20, padding
   `14px 10px`, centered. Value Fredoka 700 24px, label Nunito 900 11px `#848286`.
   `62 FLAMES` (white) · `#14 IN SCHOOL` (mint `#6BF2C2`) · `7 FRIENDS` (white).
4. **Superlatives** (22px below) — label `WHAT YOU'VE WON` Nunito 900 12.5px `#9A989B`,
   then wrapping pills (gap 9), radius 100, padding `9px 14px`, Nunito 900 13.5px, each with
   its accent's 3px shadow: `🥵 Hottest in 11th` (pink), `💅 Best dressed ×3` (yellow),
   `🎤 Would go viral` (purple), and `🔒 2 still locked` (`surface`, `#848286`, no shadow).
   Locked pills open the God Mode paywall.
5. **Invite card** (22px below) — `cream`, radius 26, padding 18, `0 6px 0 #D9C7AF`, gap 12.
   `💌` 24px + `Bring your class` Fredoka 700 20px `#2D2A2E`; body
   `Every friend who joins puts you in more people's polls. More polls, more flames.`
   Nunito 700 13.5px/1.4 `#8B888D`; a 10px `#E4D6BF` track with a 60% pink fill and `3/5`
   Nunito 900 12px `#8B888D`; then a pink pill, padding 14, `0 4px 0 #C43A7C`,
   Fredoka 700 16px white: `Invite 2 more · get 🍬 25`.
6. **Safety row** (`marginTop: auto`, `marginBottom: 30px`) — `surface`, radius 20, padding
   `14px 16px`, `Block or report someone` Nunito 800 13.5px `#C1C0C0` with a `›` 18px
   `#727074`. This row is required on every profile, yours and others'.

### 7. Candy shop — new modal route, `app/(app)/candy.tsx`

**Purpose.** Soft-currency top-up. Earn paths come first, purchase second, subscription last.

1. **Nav row** — `‹` 22px `#727074`, centered title `Candy` Fredoka 700 19px white, 22px
   spacer right.
2. **Balance card** (22px below) — yellow `#FFD84D`, radius 28, padding 22,
   `0 6px 0 #D4AC17`, centered. `🍬` 36px with the `wobble` animation; `48` Fredoka 700 44px
   `#3A2A00`; `1 candy = 1 scratch` Nunito 900 13px `#7A5A00`.
3. **Earn list** (22px below) — label `EARN IT FREE` Nunito 900 12.5px `#9A989B`, rows at
   gap 9, radius 20, padding `14px 16px`, gap 13: 21px emoji, title Nunito 900 15px,
   subtitle Nunito 700 12.5px, payout Nunito 900 15px.
   - `🗳 Finish today's round` / `8 questions, takes a minute` / `+10` — `surface`,
     white title, `#848286` subtitle, mint payout.
   - `🔥 Keep your streak` / `Day 12 · payout doubles at day 30` / `+5` — same treatment.
   - `💌 Invite a classmate` / `They join, you both get paid` / `+25` — **`cream` row**,
     `0 4px 0 #D9C7AF`, `#2D2A2E` title, `#8B888D` subtitle, `#C43A7C` payout. Promoting the
     invite row to cream is deliberate: it is the only viral lever on the screen.
4. **Purchase row** (22px below) — label `OR JUST BUY IT`, then three cards, gap 9,
   `align-items: flex-end`. Side cards: `surface`, `flex: 1`, radius 22, padding `15px 8px`,
   amount Fredoka 700 22px white, `candy` Nunito 700 12px `#848286`, price Nunito 900 14px
   `#C1C0C0` — `25 / $1.99` and `300 / $12.99`. Middle card: pink, `flex: 1.1`, padding
   `19px 8px`, `0 5px 0 #C43A7C`, amount Fredoka 700 26px white, `candy` `#FFD6E9`, price
   Nunito 900 15px white — `100 / $5.99` — with a yellow sticker badge absolute `top:-12px`,
   `rotate(-3deg)`, Nunito 900 10.5px `#3A2A00`: `MOST PICKED`.
5. **God Mode cross-sell** (`marginTop: auto`, `marginBottom: 30px`) — mint, radius 24,
   padding `16px 18px`, `0 5px 0 #3FBF95`, gap 13: `😈` 24px,
   `Or skip candy entirely` Nunito 900 15px `#0A3B2C`,
   `God Mode shows every name, always` Nunito 800 12.5px `#12664C`, and a `#0A3B2C` pill
   (padding `9px 14px`, Nunito 900 13px mint) reading `Try free`.

### 8. Onboarding — school picker — `apps/mobile/app/onboarding.tsx`

**Purpose.** Step 2 of 4. Binds the account to one school, which scopes everything else.

1. **Progress** — four 8px bars, gap 5, radius 100. Steps 1–2 mint `#6BF2C2`, steps 3–4
   `surface`.
2. **Title** (30px below) — `Which school do you go to?` Fredoka 700 38px/1.04 white,
   `text-wrap: balance`.
3. **Subtitle** (10px below) — `You'll only ever see people from your school, and only they
   can see you.` Nunito 700 15px/1.45 `#9A989B`.
4. **Search field** (22px below) — `surface`, radius 20, padding `15px 17px`, gap 11:
   `🔍` 17px, typed value `Lakeview` Nunito 800 16px white, and a 2 × 20px mint caret.
5. **Results** (12px below, gap 9) — radius 20, padding `15px 16px`, gap 13. 44px icon
   square radius 15 with a 21px `🏫`; name Nunito 900 15.5px; meta Nunito 700 12.5px.
   - Selected: `cream` row, `0 4px 0 #D9C7AF`, mint icon square, `#2D2A2E` name,
     `#8B888D` meta, trailing 24px mint check circle (`✓` Nunito 900 13px `#0A3B2C`) —
     `Lakeview High School` / `Austin, TX · 312 kids already here`.
   - Unselected: `surface` row, `raised` icon square, white name, `#848286` meta, no check —
     `Lakeview Prep` / `41 kids already here`, `Lake Travis High` / `88 kids already here`.
   Showing the existing student count per school is intentional social proof.
6. **Safety note** (20px below) — `raised` `#4A474B`, radius 20, padding `15px 16px`, gap 11,
   `🔒` 18px + `Aura is 13+. We check your grade with your school, and nobody ever sees who
   you voted for — not even the person you picked.` Nunito 700 13px/1.42 `#C1C0C0`.
7. **CTA** (`marginTop: auto`, `paddingBottom: 32px`) — mint pill, padding 18,
   `0 5px 0 #3FBF95`, Fredoka 700 19px `#0A3B2C`: `That's my school`. Below, 12px gap,
   centered `Can't find it? Request your school` Nunito 800 12.5px `#727074`.

The CTA is mint, not pink — pink is reserved for the voting/flame loop, mint for
account and God Mode surfaces. Keep that split.

---

## Interactions & behavior

**Vote tap.** Tapping a candidate card is the vote — no confirm step. On press: scale to
`0.96` and collapse the 5px shadow to 0 (translate the card down 5px) over 90ms, so the toy
button physically depresses. Then the picked card's avatar flashes to pink, a `+10 🍬` chip
flies to the candy counter, and the next question slides in from the right (220ms,
`cubic-bezier(.32,.72,0,1)`). Progress fill animates to the new percentage over 300ms.

**Wobble.** Prompt emoji and the God Mode mark rotate `-2.5deg → 2.5deg → -2.5deg` over 3s,
`ease-in-out`, infinite. Applies to the emoji only, never a container.

**New four / Skip.** `New four` re-rolls candidates for the same prompt (same press
depression, cards cross-fade 150ms). `Skip` advances the prompt without voting and does not
award candy.

**Scratch.** Tapping an unscratched tile: 400ms mask wipe diagonally, tile background
animates from `#B0AEB2` to its accent, value cross-fades from `M?` to the revealed value,
label flips to `SCRATCHED`. Light haptic on reveal (`Haptics.impactAsync(Light)`), success
haptic on the final tile. If candy is insufficient, tapping opens the candy shop rather
than erroring.

**Flame row.** Unread rows open the reveal modal; the `NEW` pill is removed optimistically.
Read rows still open but render in the `surface` state.

**Paywall.** Semester is pre-selected. Tapping Weekly moves the mint fill and the `BEST
DEAL` sticker stays on Semester. The teaser rows are non-interactive — tapping anywhere on
the card triggers the CTA.

**Streak.** The orange chip pulses once (scale 1 → 1.08 → 1, 400ms) on first open each day
after the streak increments. At 20:00 local, if the day's round is unplayed, the chip turns
`#C4501E` and reads `12 days · ends tonight`.

**Empty states.** No flames: keep the God Mode banner hidden, show a centered
`Nobody's picked you yet. Vote so people see you back.` Nunito 800 15px `#9A989B` plus a
pink `Start voting` pill. No round available: replace the candidate grid with a `surface`
card counting down to the next drop.

**Loading.** Candidate cards render as `cream` blocks at `0.35` opacity with a 1.4s pulse;
never a spinner over the whole screen.

**Ranks board.** Filter chips swap the list in place, 150ms cross-fade, no route change.
Your pinned row animates its rank number when it changes (count up/down over 400ms). Tapping
any row opens that person's public profile — the trophy-case view of screen 6, without the
stat trio and invite card.

**Invite.** `Invite 2 more` opens the native share sheet with a school-scoped join link. The
progress bar fills optimistically on send and settles when the invitee actually joins;
candy is credited only on join, and the copy must not imply otherwise.

**Candy shop.** Opens as a modal sheet from anywhere candy is short — including a failed
scratch tap. Earn rows are tappable and route to their action (round, streak, share sheet).
Purchase cards go straight to the native IAP sheet; the middle card is not pre-selected,
only visually promoted.

**Onboarding.** Search filters as you type, debounced 200ms. Selecting a school moves the
cream treatment and check to the tapped row. The CTA is disabled (`surface` fill,
`#727074` label) until a school is selected. Grade verification happens on the next step.

**Responsive.** Design height is 874. At ≤ 740 (iPhone SE) drop the prompt subline, reduce
prompt type to 27px, and reduce candidate card padding to `13px 12px`. Cap layout width at
440 on tablets and center.

## State

Per the existing repo shape (`@aura/api-client` hooks are already in place):

- `round` — prompt list, index, four candidates per prompt, `roundId`.
- `votes[]` — local optimistic list, flushed via the existing submit mutation.
- `candy` (was coins) — server value, optimistic increment on vote.
- `streak` — days, `playedToday`.
- `flames[]` — prompt, sender attributes, `revealTier` (`none | grade | gender | initial |
  name`), `readAt`.
- `revealTier` per flame drives the scratch tiles; advancing tiers is a server call that
  debits candy.
- `entitlement` — `godMode: boolean`, `trialEndsAt`.

`godMode: true` collapses the scratch card to a single row showing the full name, hides both
CTAs, and turns every flame meta line green.

## Assets

None. Every glyph is a system emoji (🔥 🍬 🥵 😏 💅 🎤 😈 🫣 🫂 🎓 👧 🪙 🗳 🏆 😎 🔄 ⏭ ✅ 🔒),
every shape is a `View` with a background and radius. No images, no icon font, no SVG.
Fonts come from Google Fonts: `Fredoka` (500/600/700) and `Nunito` (600/700/800/900).

If emoji rendering is inconsistent across Android OEMs, swap to a bundled emoji font rather
than redrawing as icons — the emoji are load-bearing for the tone.

## Files in this bundle

- `3a-screens.html` — the four approved screens, standalone. Open in a browser.
- `Aura Mobile.dc.html` — the full design doc: 3A (approved, top), 2A (plum, superseded),
  1A/1B/1C (turn-1 explorations). Reference only.
- `ios-frame.jsx`, `support.js` — support files for the design doc.

## Repo files to change

| Design | Target |
| --- | --- |
| 1. Vote | `apps/mobile/app/(app)/aura.tsx` |
| 2. Flames inbox | `apps/mobile/app/(app)/inbox.tsx` |
| 3. Scratch reveal | new: `apps/mobile/app/(app)/reveal/[flameId].tsx` |
| 4. God Mode paywall | `apps/mobile/src/components/GodModeOverlay.tsx` |
| 5. Ranks board | new: `apps/mobile/app/(app)/ranks.tsx` |
| 6. Profile | `apps/mobile/app/(app)/profile.tsx` (stub today) |
| 7. Candy shop | new: `apps/mobile/app/(app)/candy.tsx` |
| 8. Onboarding — school picker | `apps/mobile/app/onboarding.tsx` |
| Tab bar | replaces `apps/mobile/src/components/TabHeader.tsx`; wire in `app/(app)/_layout.tsx` |
| Tokens | `apps/mobile/tailwind.config.js` theme extension |

Not designed: `app/(app)/add.tsx` and `about.tsx` (both stubs), onboarding steps 1, 3, and 4,
and the public-profile variant of screen 6. The four tab destinations, the reveal, the
paywall, the shop, and the school picker are all covered.

Naming note: the design calls the soft currency **candy** (🍬), not coins. The repo's
`coins` field names can stay; the user-facing string is candy everywhere.

## Content and safety notes

Prompts are Gas-style superlatives but all positively framed — "hottest", "biggest flirt",
"best dressed", "would go viral first". There are no negative, ranking-down, or
appearance-critical prompts, and the design never shows a vote count against a person. Keep
that constraint: the voter is always anonymous to the recipient, only the recipient sees
their own flames, and God Mode reveals names **to the recipient only** — never who voted for
someone else. The repo's existing block/report path must remain reachable from any profile.
