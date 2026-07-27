# vendor/

`mechanical-waves.tsx` — pulled from the 21st.dev registry
(`designali-in/mechanical-waves`) with `npx shadcn add`. Kept here for provenance only;
it is **not** in the build.

This project is vanilla JS with zero dependencies, so the component's React/Tailwind shell
cannot be used as-is. What was adopted is its **mechanism**, reimplemented in
`public/app.js` as `makeLattice()`:

- a lattice of horizontal node lines (`LINE_SPACING`, `NODE_SPACING`)
- a 2D gaussian (`a * exp(-(x-x0)²/2σx² - (y-y0)²/2σy²)`) raising nodes near a peak
- a peak "age" that propagates to neighbouring nodes, so a disturbance travels along the
  lattice instead of just pulsing in place
- `quadraticCurveTo` between node midpoints for smooth wires

Adopted the physics, replaced the skin: colours come from this page's tokens, the field
ducks under the wordmark band, it is gated to the hero and off under reduced motion.
