---
name: ÁRUMI Parfum & Care
description: A wholesale perfume catalog set like a showroom — each product alone on a white stage, named in heavy capitals, priced in amber.
colors:
  canvas: "#f2f2f0"
  surface: "#ffffff"
  ink: "#1b1b1a"
  muted: "#6d6d68"
  primary: "#1e1e1c"
  primary-hover: "#33322f"
  primary-wash: "#e8e8e5"
  night: "#1e1e1c"
  on-night: "#f2f2f0"
  on-night-muted: "#a6a6a1"
  price: "#96622a"
  price-bright: "#c8955f"
  gold: "#c9a34c"
  wordmark: "#4d522c"
  rule: "#e2e2de"
  control: "#858580"
  danger: "#a33a2b"
  danger-wash: "#f7ebe8"
typography:
  display:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.75rem, 7vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  price:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  body:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.18em"
  wordmark:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  md: "14px"
  lg: "28px"
  full: "999px"
spacing:
  gutter: "16px"
  stage-gap: "12px"
  block: "20px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-inverse:
    backgroundColor: "{colors.on-night}"
    textColor: "{colors.night}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  card-stage:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "8px"
  block-night:
    backgroundColor: "{colors.night}"
    textColor: "{colors.on-night}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
  chip-tag:
    backgroundColor: "{colors.primary-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
---

# Design System: ÁRUMI Parfum & Care

## Overview

**Creative North Star: "The White Stage"**

A wholesale catalog that behaves like a showroom rather than a price list. Every product stands alone on a white stage lifted off a neutral ground, named in heavy grotesque capitals, with its price in amber. The world was pinned by the client's own fashion-app reference and met from their logo's own colours: the graphite of its «PARFUM & CARE» subtitle and the gold of its flourish. Olive, the wordmark's colour, survives in the wordmark alone.

Density is phone-first and thumb-led. The buyer is a wholesaler on a market floor, one hand, bright light: hierarchy is carried by scale and weight, not by colour or ornament, and every primary action sits in the lower third of a 390×844 screen. Dark blocks appear inside light screens — the terms of trade, the request total, the request bar — and never as a dark theme.

It replaces an olive-and-cream boutique direction set in a display serif, kept as evidence only: nothing here returns to cream grounds, serif headlines, centred captions between rules, or hairlined boxes around every item.

**Key Characteristics:**
- White stages on a neutral ground, lifted by soft offset shadow rather than outlined.
- Heavy grotesque capitals for every heading; sentence case for long Russian names.
- Amber means money and nothing else — two ambers, one per ground.
- Dark blocks for the conditions a buyer must read before committing.
- Everything pressed is a capsule.

## Colors

A restrained palette: neutrals, graphite, and one accent spent only on money.

### Primary
- **Showroom Graphite** (primary): buttons, active states, the basket, the focus ring and text selection. Taken from the logo's subtitle — the reference's black button, softened a step off pure black.
- **Night Block** (night): the dark blocks inside light screens — terms of trade, «Условия», the request total, the request bar. The same graphite as primary, deliberately: the button and the block are one material.

### Secondary
- **Ledger Amber** (price): every price on a light ground, and the minimum-order figure in body copy. Deep enough to read in daylight on both the canvas and a card.
- **Lamplit Amber** (price-bright): money on a night block only — the minimum in the terms block, the request total, its progress bar. This is the reference's own price colour; on any light ground it measures 2.65:1 and vanishes on a sunlit phone.

### Tertiary
- **Flourish Gold** (gold): decorative lines only — the rule under the header, the underline beneath the current format and the current category tab. Never text, never a state on its own.
- **Wordmark Olive** (wordmark): the ÁRUMI mark and its Á monogram, nothing else.

### Neutral
- **Gallery Grey** (canvas): the page ground. Neutral near-white, chosen so white stages still lift off it.
- **Stage White** (surface): cards, inputs, sheets, grouped menu blocks.
- **Graphite Ink** (ink): body text and headings.
- **Quiet Grey** (muted): secondary facts — brand, volume, pack multiple, counts.
- **Night Paper** (on-night) and **Night Grey** (on-night-muted): text and marks on a night block, tinted from the ground rather than a generic grey.
- **Wash** (primary-wash): hover beneath quiet controls, tag fills, skeleton bars.
- **Hairline** (rule): dividers inside a grouped block. Decorative, exempt from contrast minimums.
- **Field Edge** (control): the boundary of a form field or an outlined capsule; clears 3:1 on both grounds.
- **Alarm** (danger) and **Alarm Wash** (danger-wash): out of stock, errors.

### Named Rules
**The Money Rule.** Amber is spent on prices, totals and minimums and on nothing else — not links, not tabs, not active states. A link coloured like a price reads as one.

**The One Amber Per Ground Rule.** Ledger Amber on a light ground, Lamplit Amber on a night block, never the bright one on white. `src/lib/tokens.test.ts` measures both against their grounds and fails if either drifts.

**The Four-and-a-Half Rule.** Every text colour clears 4.5:1 on the ground it is used on — not only body copy. A price is the text that most needs to survive a bright screen.

## Typography

**Display Font:** Manrope (with system-ui, -apple-system)
**Body Font:** Manrope (with system-ui, -apple-system)
**Wordmark Font:** Cormorant Garamond (with Georgia), for the ÁRUMI mark only

**Character:** One grotesque carries everything, from heavy tight capitals to body copy; the only serif on the page is the logo drawn in its own face. Numbers are lining and tabular everywhere, so an article number sits on the baseline and a column of prices aligns.

### Hierarchy
- **Display** (800, clamp(1.75rem, 7vw, 2.5rem), 1, uppercase, −0.03em): the page title — «Оптовый склад парфюмерии», a category name, «Заявка».
- **Headline** (800, 1.75rem, 1, uppercase, −0.03em): section headings — «Категории», «Новинки», «Об аромате».
- **Title** (800, 0.875rem, 1.15, uppercase, −0.03em): a product name on a card; up to three lines, two reserved so a row's prices align.
- **Price** (800, 1.5rem on cards, up to 2rem on a product page, tabular): the largest text on any card.
- **Body** (400–700, 1rem, 1.55): descriptions, rows, form input.
- **Label** (600, 0.75rem, uppercase, 0.18em): form field labels, menu group names, note tiers. Only ever at 12–14px.

### Named Rules
**The Scale Carries It Rule.** Hierarchy comes from size and weight. A heading that needs a rule, a box or a colour to be read as a heading was set too small.

**The Long-Name Rule.** Headings and product names are capitals; category names in rows, tabs and the menu are sentence case and bold. A five-word Russian format name reads faster in lower case.

**The Unit Rule.** A number is never separated from its unit — «35 мл», «2 в 1» — bound with a non-breaking space by `keepUnits()` wherever a category name is set.

## Layout

A single phone-width column (max 48rem, 16px gutters) that holds its structure up to desktop, where the product page opens into two columns — picture left and sticky, details right. Stages sit 12px apart, two columns on a phone, three and four on wider screens. Sections are separated by 48px, blocks padded 20px. Lanes on the home screen are horizontal rails that bleed to both screen edges, so the card cut off at the edge says there is more.

The header is two rows: menu, wordmark and basket above; a full-width capsule search below, where a thumb reaches it.

On a phone the product page ends in the request bar: sticky at the foot, so «В заявку» is in the first screen and in its lower third, and it comes to rest above the footer instead of covering it.

## Elevation & Depth

Depth is lift, not outline. White stages carry a soft, offset graphite shadow that separates them from the ground without drawing a line around them. Grouped blocks are divided inside by hairlines. Night blocks need no shadow: their value does the separating.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgb(30 30 28 / 0.05)`): every stage at rest.
- **Raised** (`box-shadow: 0 6px 20px rgb(30 30 28 / 0.07)`): available for a lifted state.
- **Sheet** (`box-shadow: 0 14px 36px rgb(30 30 28 / 0.12)`): overlays.

### Named Rules
**The Lift-Not-Line Rule.** A card is separated from the ground by depth. A hairline box around every item is the grid this system replaced.

## Shapes

Three radii and no others. Large, generous corners on anything that holds content — stages, night blocks, the sheet's top edge (28px). Moderate corners on things inside them — image wells, thumbnails, form fields (14px). Fully round on everything pressed — buttons, the search field, the basket, stepper controls, tags, the sort control.

### Named Rules
**The One Capsule Rule.** If you can press it, it is a capsule. The round shape is reserved for action, so it is never used for a container.

## Components

### Buttons
- **Shape:** capsule (999px).
- **Primary:** graphite fill, white text, bold, 12px × 24px. Hover one step lighter.
- **Inverse:** the primary turned over for a night ground — light fill, graphite text. The request bar's «В заявку», and the phone capsule in the terms block.
- **Secondary:** white fill, field-edge outline, graphite text.
- **Quiet:** text with a hairline underline — «Убрать», «Поделиться».
- **Disabled:** a line and a whisper — outline, transparent fill, muted text — never a filled grey slab that reads as "in progress".

### Cards / Containers
- **Stage:** white, 28px corners, 8px inner padding, resting shadow. The picture sits in a 14px-cornered well of the canvas colour at 4:5, because glass dissolves on white and client photographs arrive on mixed backgrounds.
- **Card body:** name, then price, then brand · volume · pack multiple small at the foot, then stock. Most important first and large, everything else small and last.
- **Night block:** graphite, 28px corners, 20px padding, heading in display caps, facts as label–value rows divided by faint hairlines.

### Inputs / Fields
- **Search:** capsule, white, field-edge outline, full width.
- **Form fields:** 14px corners, white, field-edge outline; the focus ring is graphite.

### Chips
- **Tags:** wash fill, graphite text, capsule, 12px bold — gender and scent families on a product page.

### Navigation
- **Menu:** a bottom sheet with a 28px top edge and a display-caps title; its groups are white stages with rows divided inside by hairlines, bold labels, counts in muted grey on the right.
- **Category tabs:** a horizontally scrolling text row; the current one in ink, extra-bold, gold underline; the rest muted.
- **Back:** a drawn arrow and the category name.

### Format Row (signature)
The reference's size row, carrying this catalog's pivot: the same fragrance in its other formats. Volume on top, its price in amber beneath, the current one underlined in gold. A volume that appears twice is told apart by the kind of bottle («2 в 1», «карандаш»).

### Request Bar (signature)
On a phone, a sticky night bar at the foot of a product page: drawn − and + in outlined capsules, and an inverse «В заявку» filling the rest. Hidden from `md`, where the column holds the same control in its light form.

## Do's and Don'ts

### Do:
- **Do** put a product on a white stage and let depth, not a border, separate it.
- **Do** set every heading in heavy grotesque capitals and let its size do the work.
- **Do** spend amber on money only: Ledger Amber on light grounds, Lamplit Amber on night blocks.
- **Do** put the conditions a buyer must read — minimum, pack, delivery, total — in a night block.
- **Do** make everything pressed a capsule, and keep capsules for things that are pressed.
- **Do** draw icons as SVG in the rule's stroke weight — menu, back arrow, bag, chevron, plus and minus.
- **Do** keep the primary action in the lower third of a phone screen.
- **Do** design the empty states — a missing photograph is the Á monogram in its well; an empty catalog says so in a sentence.

### Don't:
- **Don't** use cream or warm-tinted grounds; the ground is neutral.
- **Don't** set a heading in a serif, or use the serif for anything but the ÁRUMI mark.
- **Don't** use the bright amber on a light ground.
- **Don't** colour a link, tab or active state amber.
- **Don't** put a small spaced-caps label above a heading or a product name; the brand follows the name, it does not caption it.
- **Don't** outline cards with hairlines, and don't nest cards.
- **Don't** use a dark theme; dark is a block inside a light screen.
- **Don't** use gradients, glass, emoji in the interface, or a third typeface.
- **Don't** animate anything but sheets and modals, and never beyond 250ms or through layout properties.
