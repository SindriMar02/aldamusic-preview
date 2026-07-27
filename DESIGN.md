# Alda Music — frumgerð / prototype

**Concept: „Aldan" — the wave that carried Icelandic music.**

Alda means *wave*. Every mechanism on this page is one waveform: it runs the hero,
it divides the sections, it re-draws itself for each artist you land on, and it is
the scrub bar under both draggable rails. Scroll is the playhead.

## The client, in facts (all verified 2026-07-26)

| Fact | Source |
|---|---|
| Alda Music, Eyjarslóð 7, 101 Reykjavík · alda@aldamusic.is · +354 546 2202 | their own site + ja.is |
| Shop hours Mon–Fri 10–18, Sat 12–17, Sun closed | netverslun.aldamusic.is/pages/opnunartimar |
| 54 artists on the roster, with their photographs | aldamusic.is/artist (Prismic library) |
| Skífan opened its first record shop in Hafnarfjörður **1975**, founder Jón Ólafsson | is.wikipedia.org/wiki/Skífan |
| Renamed **Sena** in 2005 | same |
| **Alda Music founded 2016**, bought Sena's publishing rights that July (kt. 510716-1320) | Vísir / ja.is |
| Sold to **Universal Music Group** in 2022, ~1.7 bn ISK (~$12m); Sölvi Blöndal co-founder and largest shareholder, Ólafur Arnalds among the founders | visir.is/g/20222311306d |

Nothing on the page claims a number that is not in this table. No "largest", no
catalogue count, no chart claims.

## Why their current site needs this

aldamusic.is is two clickable rectangles: *Alda Music Listamenn* and *VEFVERSLUN*.
1189px tall, one image, no story, no releases, no roster on the landing page — a
company that owns most of the recorded history of Icelandic music has a homepage
with less content than a business card. Everything below is already theirs; it was
just never put on a page.

## Reference flow (rcarecords.com, studied at source level)

Framed black film hero + outline wordmark + circular play + vertical SCROLL rail +
release ticker → running marquee band announcing each section → draggable infinite
merch rail → artist roll where the centred name ignites in the accent colour and
swaps a full-bleed image → draggable horizontal history timeline → parent-company
band → solid accent CTA band → light footer. Engine: Lenis + GSAP ScrollTrigger +
Draggable/Inertia + SplitType.

**What is transplanted:** the flow, the section grammar, the interaction classes.
**What is not:** their type (Compacta/Romie are licensed), their palette, their
markup, their CSS, their copy. This build is vanilla with **zero dependencies** —
one damped rAF engine does what Lenis + ScrollTrigger were doing there.

## Tokens

```
--ink      #0A0A0B   vinyl black, the page ground
--paper    #EFE9DE   sleeve bone, the light sections
--red      #DF3F5C   sampled out of their own logo SVG
--red-deep #B32742   red as text on bone (AA)
--chalk    #F6F4F1   ink on black
--dust     #8E8E96   labels on black
--slate    #55555C   labels on bone
```

Type — all local, all Icelandic-complete (Þ Ð Æ Ö + acutes machine-checked):
- **Humane** — ultra-condensed variable poster display. The tall thin caps *are* the wave.
- **Archivo** 400/500/700 — body and UI.
- **Departure Mono** — spec voice, chosen because Alda's own logo mark is 8-bit pixel art.

## The spine

1. **Hero** — a monochrome North Atlantic wave film behind the frame, the live canvas
   oscillogram crossing the seam between the two lines of the name (drawn BEHIND the solid
   `ALDA` and showing through the hollow `MUSIC`), both lines flush-fitted to the same
   width in JS, vertical `SKRUNA` rail, ticker of real new releases along the bottom.
   **The scroll signature:** leaving the hero parts the wordmark like a curtain — `ALDA`
   rises, `MUSIC` falls, the film pushes forward to scale 1.16 — all scrubbed off one
   damped channel at tau .085, so it is reversible and feels attached to the finger.
2. `NÝJAR PLÖTUR` marquee (red)
3. **Plötur** — infinite draggable rail with inertia, 16 real releases: sleeve, the
   vinyl sliding out and spinning, real format, real ISK, link to the real product.
4. `54 LISTAMENN` marquee
5. **Listafólk** — the roll: the selected artist's portrait is the whole section,
   full-bleed edge to edge, arriving on a counter-zoom crossfade under one fixed grade;
   54 names in Humane roll past a red marker line, the centred one ignites red, the
   name decodes with a scramble, and the waveform re-seeds from the name so every
   artist has a different wave. Idle for four seconds and a dim ripple runs down the
   list. Portraits load only within ±3 of the read position.
6. `SKÍFAN · SENA · ALDA` marquee
7. **Aldamót** — draggable horizontal timeline, 1975 → 2005 → 2016 → 2022 → today.
8. **Universal band** — the parent, stated plainly.
9. **Red CTA band** — send us music / the shop.
10. **Footer** — real address, real hours, real phone, socials, legal.

## Motion law

One damped rAF engine (`cur += (tgt-cur) * (1-e^(-dt/tau))`), layered time
constants: hero .09s → rails .12s → media reveals .15s → content rises .16s →
parallax .22s. Depth ordering is what reads as expensive; uniform tau reads as
greased. Reads batched before writes. All reveals are **scrubbed** (reversible), so
never review this page with a full-page screenshot.

`prefers-reduced-motion` renders everything at rest: no waveform animation, no marquee
drift, no inertia, no film (the poster frame instead), no scramble, no ripple; the roll
flattens to one viewport with a normally scrollable name column where clicking selects,
and the rails become plain scroll-snap.

## Borrowed, and from where

- **rcarecords.com** — the flow and the section grammar (read at source level: Lenis +
  GSAP ScrollTrigger + Draggable/Inertia + SplitType). None of their code, type or copy.
- **21st.dev `Music Portfolio`** (@lovesickfromthe6ix) — two ideas, both re-implemented
  vanilla because vendoring React + GSAP into a zero-dependency page would be a
  regression: the scramble-decode on the active name, and the idle ripple down the list.
- **The direction-reversing marquee** — the bands are driven from the engine rather than a
  CSS animation, at a base drift plus a scroll-velocity term, so they accelerate when you
  read fast and run backwards when you scroll up.
- **Higgsfield** — the hero film only (one still + one 5s clip, 11.5 credits, boomerang-
  looped to 10s/1.2MB). Everything else on the page is Alda's own material.

## What the QA harness asserts

`qa/probe.mjs` (geometry, clipping, scrub reversibility, fps), `qa/interact.mjs`
(drag/keyboard/menu/tab-visibility/contrast at three depths), `qa/walk.mjs` (the
viewport-by-viewport visual walk — never a full-page screenshot on a scrubbed page).
Current state: 0 horizontal overflow, 0 clipped headings, 0 text escaping its band, 0
console errors, reversibility exact (0.4167 → 1 → 0.4167), 266fps with 0 long tasks,
no contrast failures at hero/shop/CTA depths, no focusable element below 0.9 inherited
opacity across 74 real Tab presses, max image upscale 0.89x.

Three harness bugs worth remembering: headless Chrome caps rAF at 30fps unless you pass
`--disable-gpu-vsync --disable-frame-rate-limit` (a blank page measures the same 30, which
is how I caught it); `evaluateOnNewDocument` runs before `document.documentElement` exists;
and a contrast probe must hide `-webkit-text-stroke-color` as well as `color`, or an
outline face is measured against its own outline.
