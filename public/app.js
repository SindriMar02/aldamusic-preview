/* Alda Music — frumgerð. One damped rAF engine, zero dependencies.
 *
 * Everything scroll-linked goes through `chan()`: a channel eased toward its target per
 * frame with its own time constant. Layered taus are what read as expensive; a single tau
 * for everything reads as greased. Reads are all batched before writes so no element
 * forces a second layout in the same frame.
 */
(() => {
  'use strict';

  const doc = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- damped channels ---------------- */
  const channels = [];
  function chan(tau, apply, start = 0) {
    const c = { tau, cur: start, tgt: start, apply, settled: true };
    channels.push(c);
    return c;
  }
  function setT(c, v) {
    if (v !== c.tgt) { c.tgt = v; c.settled = false; wake(); }
  }

  let raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    let moving = false;
    for (const c of channels) {
      if (c.settled) continue;
      const k = 1 - Math.exp(-dt / c.tau);
      c.cur += (c.tgt - c.cur) * k;
      if (Math.abs(c.tgt - c.cur) < 0.0005) { c.cur = c.tgt; c.settled = true; }
      else moving = true;
      c.apply(c.cur);
    }
    if (moving || dragging) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ---------------- page channels ----------------
     NOTHING here writes to the root element any more, and that single fact is most of this
     page's scroll cost.

     A custom property that is not registered with `@property` INHERITS. Setting one on
     <html> therefore dirties the inherited-style chain of the entire document, so all three
     of these writes — sixty times a second, for the whole length of a scroll — were forcing
     Blink to recalculate 931 of the page's 1352 elements per pass. Suppressing just these
     three took a pass from 931 elements to 118, a 87% cut, measured over three interleaved
     runs (qa/split-recalc.mjs). Suppressing every transition and every animation on the page
     instead changed nothing at all: +5%.

     Two of the three were writing to no one. `--al-p` and `--al-vel` were never read by a
     single CSS declaration — only `chPage.cur` and `chVel.cur` are read, from JS, so the
     channels stay and the property writes go. `--al-rule` has exactly one consumer, the
     shop rules, so it is written on them. */
  const chPage = chan(0.12, () => {});
  const chVel = chan(0.12, () => {});
  let ruleEls = [];
  const chRule = chan(0.18, (v) => {
    const s = v.toFixed(4);
    for (const el of ruleEls) el.style.setProperty('--al-rule', s);
  });

  /* The hero curtain. Tight tau (.085) so the parting feels attached to the finger, while
     media and content sit on slower channels: the depth ordering of the time constants is
     what reads as expensive. */
  const heroEl = document.querySelector('[data-hero]');
  const chHero = chan(0.085, (v) => heroEl?.style.setProperty('--al-hx', v.toFixed(4)));

  /* ---------------- header hide / show ---------------- */
  const hd = document.querySelector('[data-hd]');
  let lastY = window.scrollY;
  let velT = 0;

  /* ---------------- scrubbed reveals ---------------- */
  /* Layout position, NOT getBoundingClientRect: the reveal itself applies a translate, so
     reading the transformed rect feeds the output back into the input and the value settles
     at a different point depending on which direction you arrived from (measured 0.353 up
     vs 0.417 down at the identical scrollY). offsetTop is immune to transforms, and it also
     removes every layout read from the scroll loop. */
  const revealed = [];
  function absTop(el) {
    let y = 0, n = el;
    while (n) { y += n.offsetTop; n = n.offsetParent; }
    return y;
  }
  function markReveals() {
    const sel = '.al-shop-head > *, .al-shop-foot > *, .al-hist-head > *, '
      + '.al-parent > *, .al-cta > *, .al-ft-col, .al-ft-base > *, .al-rel';
    document.querySelectorAll(sel).forEach((el) => {
      el.setAttribute('data-rv', '');
      revealed.push({ el, top: 0, h: 0 });
    });
  }
  function measureReveals() {
    for (const r of revealed) { r.top = absTop(r.el); r.h = r.el.offsetHeight; }
  }

  /* A focusable control inside a scrubbed reveal can be tabbed to while it is still at
     opacity 0. Force the nearest revealing ancestor to rest while focus is inside it. */
  document.addEventListener('focusin', (e) => {
    const host = e.target.closest?.('[data-rv]');
    if (host) host.classList.add('has-focus');
  });
  document.addEventListener('focusout', (e) => {
    const host = e.target.closest('[data-rv]');
    if (host) host.classList.remove('has-focus');
  });

  /* ---------------- the waveform ---------------- */
  /* Alda means wave. One deterministic oscillogram: a sum of sines whose partials are
     seeded from a string, so every artist genuinely has a different wave and it is the
     same wave on every visit. */
  function seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function makeWave(canvas, opts) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    const state = {
      seed: seedOf(opts.seed || 'alda'), amp: 1, ping: 0, hover: 0, hx: 0.5, hy: 0.62,
      w: 0, h: 0, dpr: 1, live: false, t: 0, dip: null, lead: 0,
    };

    function size() {
      const r = canvas.getBoundingClientRect();
      state.dpr = Math.min(devicePixelRatio || 1, 2);
      state.w = Math.max(1, Math.round(r.width));
      state.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(state.w * state.dpr);
      canvas.height = Math.round(state.h * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      /* measure the band the wordmark occupies so the field can duck under it */
      if (opts.dipSel) {
        const m = document.querySelector(opts.dipSel);
        if (m) {
          const mb = m.getBoundingClientRect();
          state.dip = [mb.top - r.top + mb.height * 0.06, mb.top - r.top + mb.height * 0.94];
        }
      }
    }

    function partials() {
      const s = state.seed;
      return [
        { f: 1 + s * 0.6, a: 0.46, p: s * 6.28, sp: 0.22 },
        { f: 2.4 + s * 1.7, a: 0.26, p: s * 3.1, sp: -0.34 },
        { f: 4.7 + s * 3.2, a: 0.15, p: s * 1.7, sp: 0.51 },
        { f: 9.3 + s * 6.1, a: 0.085, p: s * 5.2, sp: -0.72 },
        { f: 17.5 + s * 9, a: 0.045, p: s * 2.4, sp: 0.95 },
      ];
    }
    let ps = partials();

    /* A FIELD, not a line. One trace across a frame is the generic default; a stack of them
       at perspective spacing is a swell you can read depth in, and it is what a spectrogram
       of a record actually looks like. Rows tighten and dim toward the horizon, amplitude
       and brightness grow toward the viewer, and the pointer raises a local crest across
       several rows at once rather than denting a single wire. */
    function draw(dt) {
      state.t += dt;
      const { w, h } = state;
      ctx.clearRect(0, 0, w, h);
      const env = state.amp * (1 + state.ping * 1.2);
      const rows = opts.rows ?? (w > 1100 ? 20 : w > 700 ? 16 : 12);
      const step = w > 1100 ? 3 : 4;
      /* the horizon sits above the frame, so the top rows read as far away */
      const top = h * (opts.top ?? -0.06);
      const span = h * (opts.span ?? 1.14) - top;

      for (let i = 0; i < rows; i++) {
        const t = i / (rows - 1);
        /* squared distribution: far rows crowd together, near rows open up */
        const base = top + span * (t ** 1.7);
        const depth = t;                       /* 0 far, 1 near */
        const gap = span * (1.7 * (t ** 0.7) / rows);
        const ampBase = gap * (opts.gain ?? 2.6) * env * (0.4 + depth * 0.85);

        /* the wordmark band is kept quiet so 316px of white type stays crisp over it */
        let vis = 0.1 + depth * 0.92;
        if (state.dip) {
          const [d0, d1] = state.dip;
          if (base > d0 - gap && base < d1 + gap) vis *= 0.2;
        }
        if (vis < 0.02) continue;

        const accent = i === rows - 4 || i === rows - 9;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += step) {
          const u = x / w;
          const win = Math.sin(Math.PI * clamp(u)) ** 0.55;
          /* one crest that rises across neighbouring rows, not a dent in one wire */
          const near = state.hover
            ? state.hover
              * Math.exp(-((u - state.hx) ** 2) / 0.012)
              * Math.exp(-((depth - state.hy) ** 2) / 0.06)
            : 0;
          const ph = state.t * 0.34 + i * 0.44;
          const y = Math.sin(u * (1.6 + state.seed * 0.9) * Math.PI * 2 - ph) * 0.5
            + Math.sin(u * (3.7 + state.seed * 2.2) * Math.PI * 2 + ph * 0.72) * 0.26
            + Math.sin(u * (8.3 + state.seed * 4.4) * Math.PI * 2 - ph * 1.4) * 0.11;
          const yy = base - y * ampBase * win * (1 + near * 3.6);
          ctx.lineTo(x, yy);
        }
        /* Occlusion by ERASING, not by darkening. Rows are drawn far to near, and each one
           punches out everything already painted below its own ridge with destination-out.
           So a nearer ridge hides the ones behind it and the traces stop reading as crossed
           wire — but because the canvas is transparent over the film, erasing canvas pixels
           reveals the film rather than covering it. Twenty translucent fills stacked to
           near-opaque black and buried the wave entirely, which was the whole point of it. */
        if (opts.fill !== false) {
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.strokeStyle = accent
          ? `rgba(223,63,92,${(0.5 + state.ping * 0.5) * vis})`
          : `rgba(246,244,241,${(opts.inkAlpha ?? 0.5) * vis})`;
        ctx.lineWidth = accent ? 1.5 : 0.6 + depth * 0.9;
        ctx.stroke();
      }

      /* the playhead: where the page is, read straight off the scroll channel */
      if (opts.playhead) {
        const px = w * clamp(chPage.cur);
        ctx.beginPath();
        ctx.moveTo(px, h * 0.06); ctx.lineTo(px, h * 0.94);
        ctx.strokeStyle = 'rgba(223,63,92,.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'var(--red)';
        ctx.fillStyle = '#DF3F5C';
        ctx.fillRect(px - 2.5, h * 0.06 - 2.5, 5, 5);
        ctx.fillRect(px - 2.5, h * 0.94 - 2.5, 5, 5);
      }
    }

    let wraf = 0, wlast = 0;
    function loop(now) {
      wraf = 0;
      const dt = wlast ? Math.min((now - wlast) / 1000, 0.05) : 0.016;
      wlast = now;
      state.ping *= Math.exp(-dt / 0.42);
      state.hover += (state.hoverT - state.hover) * (1 - Math.exp(-dt / 0.16));
      if (opts.velocity) state.amp = 1 + Math.abs(chVel.cur) * 0.55;
      if (state.ping < 0.002) state.ping = 0;
      draw(dt);
      if (state.live) wraf = requestAnimationFrame(loop);
      else wlast = 0;
    }
    state.hoverT = 0;

    /* The intro: amplitude sweeps 0 to 1 while the two lines of the wordmark rise, so the
       wave looks like it is being drawn under the name rather than already sitting there. */
    function intro(dur = 1.5) {
      if (reduce.matches) { state.amp = 1; draw(0); return; }
      state.amp = 0;
      start();
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / (dur * 1000));
        state.amp = 1 - (1 - t) ** 3;
        if (t < 1) requestAnimationFrame(step); else state.amp = 1;
      };
      requestAnimationFrame(step);
    }

    function start() {
      if (state.live || reduce.matches) return;
      state.live = true;
      if (!wraf) wraf = requestAnimationFrame(loop);
    }
    function stop() {
      state.live = false;
      if (wraf) { cancelAnimationFrame(wraf); wraf = 0; }
    }

    size();
    draw(0);

    /* only run while on screen; a canvas rAF off screen is pure waste */
    new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? start() : stop()));
    }, { rootMargin: '10% 0px' }).observe(canvas);

    addEventListener('resize', () => { size(); draw(0); }, { passive: true });

    return {
      intro,
      ping() { state.ping = 1; if (!state.live) draw(0); },
      reseed(str) { state.seed = seedOf(str); ps = partials(); this.ping(); },
      hover(on, x, y) {
        state.hoverT = on ? 1 : 0;
        if (x != null) state.hx = x;
        if (y != null) state.hy = y;
        if (on) start();
      },
      redraw() { size(); draw(0); },
    };
  }

  /* ---------------- infinite draggable rail (the shop) ---------------- */
  /* Hand-rolled pointer drag + inertia. Two copies of the list in the DOM and a modulo on
     half the track width give a seamless loop; a duplicated-content marquee must wrap at
     exactly half, never at 100% + gap, or a blank gap scrolls through. */
  let dragging = false;

  function makeRail(root, opts) {
    const track = root.querySelector(opts.trackSel);
    if (!track) return null;
    let span = 0, x = 0, v = 0, drift = opts.drift || 0, paused = false;
    let base = 0, manual = 0;
    const infinite = opts.infinite !== false;
    const clone = track.querySelector('.al-rail-clone');

    /* written straight onto the track, not as a custom property on the rail: a property
       change on an ancestor invalidates style for every descendant that inherits it, and
       this rail carries ~250 nodes */
    const put = (val) => { track.style.transform = `translate3d(${-val.toFixed(2)}px,0,0)`; };
    const ch = chan(0.1, put);

    function measure() {
      span = infinite && clone ? clone.offsetLeft : Math.max(0, track.scrollWidth - root.clientWidth
        + parseFloat(getComputedStyle(root).paddingLeft) * 2);
      if (!infinite) span = Math.max(0, span);
      write(x);
    }

    function norm(val) {
      if (!span) return 0;
      if (infinite) return ((val % span) + span) % span;
      return clamp(val, 0, span);
    }

    function write(val) {
      manual = val - base;
      x = norm(val);
      ch.cur = x; ch.tgt = x; ch.settled = true;
      put(x);
      if (opts.onMove) opts.onMove(x, span);
    }

    /* the rail has its own loop: inertia and idle drift are time-based, not scroll-based */
    let rraf = 0, rlast = 0;
    function tick(now) {
      rraf = 0;
      const dt = rlast ? Math.min((now - rlast) / 1000, 0.05) : 0.016;
      rlast = now;
      if (!dragging) {
        v *= Math.exp(-dt / 0.34);
        if (Math.abs(v) < 2) v = 0;
      }
      const d = paused || reduce.matches || !onScreen ? 0 : drift;
      if (v || d) write(x + (v + d) * dt);
      if (v || (d && !paused) || dragging) rraf = requestAnimationFrame(tick);
      else rlast = 0;
    }
    function run() { if (!rraf && !reduce.matches) rraf = requestAnimationFrame(tick); }

    let id = null, px = 0, pt = 0, moved = 0;
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      id = e.pointerId; px = e.clientX; pt = performance.now(); moved = 0;
      dragging = true; v = 0;
      root.setAttribute('data-drag', '1');
      root.setPointerCapture(id);
      run();
    });
    root.addEventListener('pointermove', (e) => {
      if (id !== e.pointerId || !dragging) return;
      const dx = e.clientX - px;
      const now = performance.now();
      const dt = Math.max(now - pt, 1) / 1000;
      px = e.clientX; pt = now; moved += Math.abs(dx);
      v = -dx / dt * 0.72;
      write(x - dx);
    });
    function up(e) {
      if (id !== e.pointerId) return;
      dragging = false; id = null;
      root.removeAttribute('data-drag');
      /* a drag that travelled must not also fire the link under the finger */
      if (moved > 8) {
        const kill = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
        root.addEventListener('click', kill, { capture: true, once: true });
        setTimeout(() => root.removeEventListener('click', kill, { capture: true }), 0);
      }
      run();
    }
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);

    root.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight') return;
      e.preventDefault();
      const stepW = root.querySelector(opts.itemSel)?.offsetWidth || 260;
      write(x + (k === 'ArrowRight' ? stepW : -stepW));
    });

    /* A drag cursor that follows the pointer: on a rail whose only affordance is dragging,
       the pointer itself has to say so. Pointer-events-none, transform-only, and it is
       removed entirely for coarse pointers and reduced motion. */
    let cursor = null;
    if (matchMedia('(pointer: fine)').matches && !reduce.matches) {
      cursor = document.createElement('span');
      cursor.className = 'al-cur';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.innerHTML = '<i></i><i></i>';
      root.appendChild(cursor);
      root.addEventListener('pointermove', (e) => {
        const r = root.getBoundingClientRect();
        cursor.style.transform =
          `translate3d(${(e.clientX - r.left).toFixed(1)}px,${(e.clientY - r.top).toFixed(1)}px,0)`;
      }, { passive: true });
    }

    root.addEventListener('pointerenter', () => { paused = true; cursor?.setAttribute('data-on', '1'); });
    root.addEventListener('pointerleave', () => { paused = false; cursor?.removeAttribute('data-on'); run(); });
    root.addEventListener('focusin', () => { paused = true; });
    root.addEventListener('focusout', () => { paused = false; run(); });

    /* the scroll position sets the rail's base offset; a drag adds to it */
    function scrollTo(p) {
      const b = (opts.travel ?? 1) * span * clamp(p);
      if (Math.abs(b - base) < 0.5) return;
      base = b;
      const t = norm(base + manual);
      setT(ch, t);
      x = t;
      if (opts.onMove) opts.onMove(x, span);
    }

    /* Only drift while the rail is actually on screen: a self-carrying rail that runs off
       screen is a rAF loop nobody can see. */
    let onScreen = false;
    new IntersectionObserver((es) => {
      es.forEach((e) => {
        onScreen = e.isIntersecting;
        if (onScreen) run();
      });
    }, { rootMargin: '10% 0px' }).observe(root);
    const visible = () => onScreen;

    addEventListener('resize', measure, { passive: true });
    return { measure, run, scrollTo, visible, get x() { return x; }, get span() { return span; } };
  }

  /* ---------------- the roll ---------------- */
  function makeRoll() {
    const root = document.querySelector('[data-roll]');
    if (!root) return null;
    const spacer = root.querySelector('[data-roll-spacer]');
    const list = root.querySelector('[data-roll-list]');
    const numEl = root.querySelector('[data-roll-num]');
    const nameEl = root.querySelector('[data-roll-name]');
    const rows = [...list.querySelectorAll('.al-name')];
    const plates = [...root.querySelectorAll('[data-plate]')];
    const names = rows.map((r) => r.querySelector('.al-name-t').textContent.trim());
    const n = rows.length;

    const wave = makeWave(root.querySelector('[data-wave="roll"]'), {
      seed: names[0], inkAlpha: 0.6, rows: 5, top: 0.1, span: 0.92, gain: 2.2, fill: false,
    });

    let row = 56, travel = 0, cur = -1;
    /* Same reason as the rail: this section holds 54 rows and 54 plates.

       The time constant is HALVED for touch, and that is the whole of the "the artists lag"
       complaint. The section holds a steady ~53fps on a throttled phone, identical to every
       other section on the page, so nothing here is dropping frames — what it was doing was
       trailing the finger by 122ms and then coasting for another 500ms after the finger
       stopped. A mouse wheel arrives in discrete notches and damping is what makes it feel
       continuous; a finger IS continuous, and content that does not track it reads as lag no
       matter how smooth it is. Desktop keeps the full .13 for the wheel. */
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const chRoll = chan(touch ? 0.06 : 0.13, (v) => { list.style.transform = `translate3d(0,${-v.toFixed(2)}px,0)`; });

    function measure() {
      row = rows[0]?.offsetHeight || 56;
      /* Scroll cost per artist, decoupled from row height: 54 rows at full row height made
         this one section 4.9 viewports tall.

         Touch gets 90px rather than 40. At 40 an ordinary 900px flick moved the roster past
         23 of the 54 artists, so no portrait was ever on screen long enough to be looked at
         — the section read as frantic, which is easy to mistake for the page being slow. It
         was not: the roll holds the same ~53fps as every other section. 90px puts a flick at
         about 10 artists. The cost is length, and it is the real tradeoff here: the section
         goes from 2120px of scroll to roughly 4770px.
         Desktop stays at 48 deliberately — a wheel is a different instrument and that value
         has not been measured the way this one has. */
      travel = row * (n - 1);
      const perArtist = innerWidth >= 1024 ? 48 : 90;
      spacer.style.setProperty('--al-roll-travel', `${perArtist * (n - 1)}px`);
    }

    /* Portraits are only fetched near the read position: 54 eager images would be 2.4MB of
       requests for a section most visitors see two of. */
    /* Portraits are 1800px because they render full-bleed; that makes the eager set the
       whole page-weight question. One is eager, its immediate neighbours warm on first
       paint, and the window widens only once the section is actually being read. */
    /* And the window is a WINDOW, in both directions. Lazy loading bounds what is fetched,
       not what is retained: reading to the end of the roll decoded all 54 portraits and
       nothing ever gave them back, 271MB of bitmap on a phone, which is a tab kill and a
       reload rather than a slow page. A portrait at 1800px is 13MB decoded and it is 1800px
       for a reason -- full-bleed cover on a 390px phone displays it at 844x844, so at dpr2 it
       genuinely wants ~1700px and a smaller source visibly softens it. So the fix is to hold
       FEW, not to hold small: plates outside the window give their src back and the decode
       with it. src is stashed first, because a lazy plate that never loaded has nowhere else
       to get it from. */
    let warmSpan = 1;
    /* resolved once: the roll advances about once per frame during a fling, so anything
       per-plate in here runs at frame rate. An earlier version of this walked all 54 plates
       with a querySelector each time the active artist changed, which was 32 selector
       lookups a frame — the window is small, so only the window should be touched. */
    const plateImg = plates.map((p) => p.querySelector('img'));
    const held = new Set();
    plates.forEach((p, k) => {
      const img = plateImg[k];
      if (img) {
        img.dataset.src = img.getAttribute('src') || '';
        if (img.getAttribute('src')) held.add(k);
      }
      /* an archive plate paints the SAME photo twice: once contained as the <img>, and once
         behind it as the out-of-focus wash on ::before. Releasing only the <img> would leave
         half the roll's bitmap retained through the custom property. */
      const bg = p.style.getPropertyValue('--al-bg');
      if (bg) p.dataset.bg = bg;
    });

    function warm(i) {
      /* one past the leading edge: the roll only ever advances one artist at a time */
      const lo = Math.max(0, i - warmSpan), hi = Math.min(n - 1, i + warmSpan + 1);
      for (let k = lo; k <= hi; k++) {
        if (held.has(k)) continue;
        const img = plateImg[k]; if (!img) continue;
        if (img.dataset.src) img.setAttribute('src', img.dataset.src);
        if (img.loading === 'lazy') { img.loading = 'eager'; img.decode?.().catch(() => {}); }
        const p = plates[k];
        if (p.dataset.bg) p.style.setProperty('--al-bg', p.dataset.bg);
        held.add(k);
      }
      /* and give back everything outside it, walking only what is actually held */
      for (const k of held) {
        if (k >= lo && k <= hi) continue;
        if (k === cur) continue;              /* never drop the plate on screen */
        const img = plateImg[k]; if (!img) continue;
        img.removeAttribute('src');
        const p = plates[k];
        if (p.dataset.bg) p.style.setProperty('--al-bg', 'none');
        held.delete(k);
      }
    }

    /* Only the handful of elements whose state actually changes gets touched.
       This used to walk all 54 plates and all 54 rows on every artist change, setting or
       removing data-on and data-near on each — 162 attribute writes, and during a fling the
       roll advances about once a frame, so that ran at frame rate. Every one of those writes
       invalidates that element's style whether or not the value moved, and the recalc was
       ~800 elements a pass, a fifth of the document, every frame. Advancing by one artist
       genuinely changes six elements. */
    function select(i) {
      if (i === cur) return;
      const prev = cur;
      cur = i;
      if (prev >= 0) {
        plates[prev]?.removeAttribute('data-on');
        rows[prev]?.removeAttribute('data-on');
        rows[prev - 1]?.removeAttribute('data-near');
        rows[prev + 1]?.removeAttribute('data-near');
      } else {
        /* first selection: clear whatever the markup shipped with */
        plates.forEach((p, k) => { if (k !== i) p.removeAttribute('data-on'); });
        rows.forEach((r) => { r.removeAttribute('data-on'); r.removeAttribute('data-near'); });
      }
      plates[i]?.setAttribute('data-on', '1');
      rows[i]?.setAttribute('data-on', '1');
      rows[i - 1]?.setAttribute('data-near', '1');
      rows[i + 1]?.setAttribute('data-near', '1');
      numEl.textContent = String(i + 1).padStart(2, '0');
      scramble(nameEl, names[i]);
      wave?.reseed(names[i]);
      warm(i);
      poke();
    }

    /* Scramble-decode, the one idea worth taking from 21st.dev's "Music Portfolio" (which
       does it with GSAP's ScrambleTextPlugin). Hand-rolled so this page keeps zero
       dependencies, and it resolves left to right so the name is never unreadable for long.
       Icelandic characters are in the noise pool, or the decode reads as English. */
    const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÐÉÍÓÚÝÞÆÖ0123456789';
    let scRaf = 0;
    function scramble(el, text) {
      if (reduce.matches) { el.textContent = text; return; }
      cancelAnimationFrame(scRaf);
      const chars = [...text];
      const t0 = performance.now();
      const dur = 460;
      const step = (now) => {
        const p = clamp((now - t0) / dur);
        const shown = Math.floor(p * chars.length * 1.35);
        el.textContent = chars
          .map((c, k) => (k < shown || c === ' ' ? c
            : POOL[(Math.floor(now / 45) + k * 7) % POOL.length]))
          .join('');
        if (p < 1) scRaf = requestAnimationFrame(step);
        else el.textContent = text;
      };
      scRaf = requestAnimationFrame(step);
    }

    /* Idle ripple: after a few quiet seconds a dim wave runs down the names. Same purpose
       as the reference's idle animation, done with one custom property per row so it costs
       nothing per frame. */
    let idleT = 0, rippleT = 0, rippling = false, seen = true;
    function idleStop() {
      clearTimeout(idleT); clearTimeout(rippleT);
      /* This runs on every scroll frame. Clearing 54 inline properties each time cost 37
         long tasks and dropped the sweep to 45fps; the reset only has to happen when a
         ripple is actually on. */
      if (!rippling) return;
      rippling = false;
      root.removeAttribute('data-idle');
      rows.forEach((r) => r.style.removeProperty('--dim'));
    }
    function poke() {
      idleStop();
      if (reduce.matches || !seen) return;
      idleT = setTimeout(ripple, 3800);
    }
    function ripple() {
      rippling = true;
      root.setAttribute('data-idle', '1');
      rows.forEach((r, k) => {
        setTimeout(() => { r.style.setProperty('--dim', '.14'); }, k * 26);
        setTimeout(() => { r.style.setProperty('--dim', '1'); }, k * 26 + 420);
      });
      rippleT = setTimeout(ripple, rows.length * 26 + 2600);
    }

    /* The ripple re-armed itself forever. Its whole job is to tell someone LOOKING at the
       column that the column is alive, and it was doing that from the moment the page loaded
       until the tab closed — 108 timers and up to 54 concurrent opacity transitions every four
       seconds while the reader was at the hero, or the footer, or making coffee. Every one of
       those transitions is a style recalc per frame on a list of 54 large text-shadowed rows.
       It costs nothing to run it only when the roster is on screen, which is the only time it
       means anything. */
    new IntersectionObserver((es) => {
      es.forEach((e) => {
        seen = e.isIntersecting;
        if (seen) poke();
        else idleStop();
      });
    }).observe(root);

    function update(top, height, vh) {
      if (warmSpan === 1 && top < vh) { warmSpan = 3; warm(cur < 0 ? 0 : cur); }
      const total = height - vh;
      const p = total > 0 ? clamp(-top / total) : 0;
      setT(chRoll, p * travel);
      const i = Math.round(p * (n - 1));
      select(i);
    }

    rows.forEach((r, i) => {
      r.querySelector('[data-goto]').addEventListener('click', () => {
        /* reduced motion has no scroll travel: the click selects directly */
        if (reduce.matches) { select(i); return; }
        const total = spacer.offsetHeight - innerHeight;
        const y = spacer.getBoundingClientRect().top + scrollY + (i / Math.max(1, n - 1)) * total;
        scrollTo({ top: y, behavior: 'smooth' });
      });
    });

    measure();
    select(0);
    poke();
    addEventListener('resize', measure, { passive: true });
    return { update, spacer, measure, poke };
  }


  /* ================= the scroll system =================
   * Rebuilt from houseofyellow.nl, read at source level. Four devices there, four here:
   *
   *  1. [data-letters]  text split into rows of characters; on entry each character rises
   *                     from a masked line with a per-index delay (theirs: y→0, .45s,
   *                     power1.out, fired at "top 90%").
   *  2. .scrollLine     a hairline under each line whose WIDTH tracks that line's own share
   *                     of the block's scroll progress, so the rails fill line by line.
   *  3. .amountWrapper  a QUANTISED odometer: the wrapper is one item tall, the inner strip
   *                     sits at y = -index * itemHeight, index = floor(progress / step).
   *                     It steps between values rather than sliding through them.
   *  4. scrubbed x/rotate over an element's full pass through the viewport
   *                     (start "top bottom" → end "bottom top").
   *
   * Theirs runs on GSAP + ScrollTrigger + SplitText + Lenis. This is the same behaviour on
   * the damped rAF engine already in this file, so the page keeps zero dependencies.
   * Text entrances stay TIME-based (a scrubbed entrance would destroy the stagger); the
   * rails, rotations and odometer are POSITION-based and therefore reversible.
   */

  /* ---- 1 + 2. split text, masked rows, per-character rise, per-line rails ---- */
  const splits = [];

  function splitText(el, opts = {}) {
    const text = el.dataset.splitText || el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    el.dataset.splitText = text;

    /* Lines are MEASURED, never guessed: wrap every word, read its offsetTop, group. */
    el.textContent = '';
    const probe = document.createElement('span');
    probe.className = 'al-probe';
    const words = text.split(' ');
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'al-w';
      s.textContent = w;
      probe.appendChild(s);
      if (i < words.length - 1) probe.appendChild(document.createTextNode(' '));
    });
    el.appendChild(probe);

    const tops = [...probe.querySelectorAll('.al-w')].map((s) => Math.round(s.offsetTop));
    const rows = [];
    tops.forEach((t, i) => {
      const last = rows[rows.length - 1];
      if (!last || last.top !== t) rows.push({ top: t, words: [words[i]] });
      else last.words.push(words[i]);
    });
    el.removeChild(probe);

    /* No duplicate copy of the text. Characters are emitted in order with real space text
       nodes between words, so the split content's own textContent is byte-identical to the
       original: adding an sr-only twin on top of that is what produced "PlöturPlötur" for
       crawlers. Headings additionally carry aria-label and hide the glyphs from the a11y
       tree, so a screen reader gets one clean string instead of per-character spans.
       Paragraphs do NOT, because aria-label on a <p> is ignored by much of AT. */
    const wrap = document.createElement('span');
    wrap.className = 'al-split';
    if (opts.label) {
      el.setAttribute('aria-label', text);
      wrap.setAttribute('aria-hidden', 'true');
    }

    let ci = 0;
    rows.forEach((row, ri) => {
      const rowEl = document.createElement('span');
      rowEl.className = 'al-row';
      const inner = document.createElement('span');
      inner.className = 'al-row-i';
      const line = row.words.join(' ');
      [...line].forEach((ch) => {
        if (ch === ' ') {
          inner.appendChild(document.createTextNode(' '));
          return;
        }
        const c = document.createElement('span');
        c.className = 'al-ch';
        c.style.setProperty('--i', ci++);
        c.textContent = ch;
        inner.appendChild(c);
      });
      rowEl.appendChild(inner);

      if (opts.rails) {
        const rail = document.createElement('span');
        rail.className = 'al-row-rail';
        rail.style.setProperty('--r', ri);
        rail.innerHTML = '<i></i>';
        rowEl.appendChild(rail);
      }
      wrap.appendChild(rowEl);
      /* a collapsing space between block rows keeps the decorative copy's own text sane */
      wrap.appendChild(document.createTextNode(' '));
    });
    el.appendChild(wrap);
    el.classList.add('al-is-split');

    const rec = { el, rows: [...wrap.querySelectorAll('.al-row')], rails: opts.rails, top: 0, h: 0 };
    splits.push(rec);
    return rec;
  }

  function buildSplits() {
    /* rebuild from scratch on resize: a line break at 1440px is not a line break at 900 */
    splits.length = 0;
    document.querySelectorAll('[data-split]').forEach((el) => {
      el.classList.remove('al-is-split', 'is-in');
      el.querySelectorAll('.al-split').forEach((n) => n.remove());
      el.removeAttribute('aria-label');
      if (el.dataset.splitText) el.textContent = el.dataset.splitText;
      splitText(el, {
        rails: el.hasAttribute('data-split-rails'),
        /* a heading is a name; a paragraph is prose */
        label: /^H[1-6]$/.test(el.tagName),
      });
    });
    measureSplits();
    /* anything already on screen at build time plays immediately */
    const vh = innerHeight;
    for (const s of splits) if (s.top - scrollY < vh * 0.92) s.el.classList.add('is-in');
  }

  function measureSplits() {
    for (const s of splits) { s.top = absTop(s.el); s.h = s.el.offsetHeight; }
  }


  /* ---- 3. the quantised odometer (their .amountWrapper) ---- */
  /* The wrapper is exactly one item tall and the strip sits at y = -index * itemHeight,
     with index = floor(progress / step). It STEPS between values instead of sliding through
     them, which is what makes it read as a counter rather than a scroll. */
  function makeOdometer(root) {
    if (!root) return null;
    const strip = root.querySelector('[data-odo-strip]');
    const items = [...root.querySelectorAll('[data-odo-item]')];
    if (!strip || items.length < 2) return null;
    let itemH = 0, index = -1;
    const ch = chan(0.11, (v) => { strip.style.transform = `translate3d(0,${-v.toFixed(2)}px,0)`; });

    function measure() {
      itemH = items[0].offsetHeight;
      root.style.height = `${itemH}px`;
      apply(true);
    }
    function apply(force) {
      const y = index * itemH;
      if (force) { ch.cur = y; ch.tgt = y; ch.settled = true; strip.style.transform = `translate3d(0,${-y}px,0)`; }
      else setT(ch, y);
    }
    function update(progress) {
      const step = 1 / items.length;
      const i = Math.min(items.length - 1, Math.max(0, Math.floor(progress / step)));
      if (i === index) return;
      index = i;
      items.forEach((it, k) => (k === i ? it.setAttribute('data-on', '1') : it.removeAttribute('data-on')));
      root.dispatchEvent(new CustomEvent('odo', { detail: { index: i } }));
      apply(false);
    }
    measure();
    index = 0; apply(true);
    addEventListener('resize', measure, { passive: true });
    return { update, measure, get index() { return index; } };
  }

  /* ---------------- the wordmark: a window onto the film ---------------- */
  /* ALDA / MUSIC is painted into a canvas, and the wave is composited INSIDE the glyphs
     with source-in. Two reasons it is canvas and not CSS: background-clip: text cannot
     take a <video>, and a mix-blend-mode over a hardware-composited video is silently
     ignored on WebKit (that one has bitten this project before). Canvas is deterministic
     on every engine and lets the opening sequence drive the reveal per pixel. */
  function makeMark(canvas, video) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const LINES = ['ALDA', 'MUSIC'];
    const st = {
      w: 0, h: 0, dpr: 1, sizes: [0, 0], top: 0, lineH: 0, ready: false,
      /* intro: 0 = nothing drawn, 1 = resolved */
      intro: reduce.matches ? 1 : 0,
      px: 0, py: 0,          /* pointer, -1..1, drifts the film inside the letters */
      live: false, t: 0,
    };

    const font = (px) => `500 ${px}px Humane, "Archivo Narrow", sans-serif`;

    function layout() {
      const r = canvas.getBoundingClientRect();
      st.dpr = Math.min(devicePixelRatio || 1, 2);
      st.w = Math.max(1, Math.round(r.width));
      st.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(st.w * st.dpr);
      canvas.height = Math.round(st.h * st.dpr);
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);

      /* Fit each line to the same target width so the block is flush on both edges, then
         clamp the stack by height. Measured with measureText at a reference size and scaled
         by the ratio: a rect height would be the line box, not the glyph box. */
      const wide = st.w >= 1024;
      const target = st.w * (wide ? 0.72 : 0.98);
      const REF = 200;
      ctx.font = font(REF);
      const raw = LINES.map((l) => {
        const m = ctx.measureText(l).width;
        return m ? (REF * target) / m : 0;
      });
      /* Humane's cap height is 0.7em. The stack is cap + a hairline of leading + cap, and
         nothing else: the previous version added cap0 into lineH and THEN added cap1 when
         placing line 2, which inserted a whole empty cap height between the words. */
      const capOf = (px) => px * 0.7;
      const leadOf = (px) => px * 0.015;
      let blockH = capOf(raw[0]) + leadOf(raw[0]) + capOf(raw[1]);
      const budget = st.h * (wide ? 0.62 : 0.5);
      const k = blockH > budget ? budget / blockH : 1;
      st.sizes = raw.map((v) => v * k);
      st.lead = leadOf(st.sizes[0]);
      blockH = capOf(st.sizes[0]) + st.lead + capOf(st.sizes[1]);
      st.top = (st.h - blockH) / 2 + capOf(st.sizes[0]);   /* baseline of line 1 */
      /* both lines were fitted to `target`, so after the height clamp they are target*k wide */
      st.tw = target * k;
      st.ready = st.sizes.every((v) => v > 0);
    }

    /* ---- the graded film ----
       The grade is brightness · contrast · saturate: three PER-PIXEL AFFINE maps, so their
       composition is affine, and an affine map commutes with the bilinear interpolation of a
       scale — A(Σwᵢcᵢ) = ΣwᵢA(cᵢ) when Σwᵢ = 1. Grading before the upscale is therefore the
       same picture. It used to run after it, filtering the 4.65MP of upscaled frame needed to
       cover the canvas to recover the 0.91MP of information the film actually carries; that
       one call measured 56.5ms, against 15.4ms for this order. The only divergence is where
       brightness(2.15) clips: the old order interpolated and then clipped, this one clips at
       source. Mean channel difference 0.5/255. */
    const GRADE = 'brightness(2.15) contrast(1.28) saturate(0)';
    let film = null, filmCtx = null, filmReady = false;

    function grade() {
      if (!video || video.readyState < 2) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      if (!film) { film = document.createElement('canvas'); filmCtx = film.getContext('2d'); }
      if (film.width !== vw || film.height !== vh) { film.width = vw; film.height = vh; }
      filmCtx.filter = GRADE;
      filmCtx.drawImage(video, 0, 0, vw, vh);
      filmCtx.filter = 'none';
      filmReady = true;
    }

    /* Re-grade on the FILM's clock, not the display's. The loop was regrading 60 times a
       second for a source that presents about 25 new frames in that second. */
    let lastVt = -1;
    function pollFilm() {
      if (!video || video.readyState < 2) return;
      if (video.currentTime === lastVt) return;
      lastVt = video.currentTime;
      grade();
    }
    /* The film is WORK, and it was running for the whole session.
       This callback used to re-arm itself unconditionally, so a 1280x714 video kept decoding
       and kept being blitted through a filter twenty times a second while the hero was ten
       screens away and its canvas was not even being drawn. On a phone that is a GPU->CPU
       texture readback per frame that never lets up: the thing that makes the tab hot, and
       then makes it die. Both the decode and the grade now belong to the canvas's own
       visibility, exactly like the draw loop. */
    let vfc = 0;
    function onFrame() {
      vfc = 0;
      grade();
      if (st.live && video.requestVideoFrameCallback) vfc = video.requestVideoFrameCallback(onFrame);
    }
    function filmStart() {
      if (!video || reduce.matches) return;
      if (video.paused) video.play().catch(() => {});
      if (video.requestVideoFrameCallback && !vfc) vfc = video.requestVideoFrameCallback(onFrame);
    }
    function filmStop() {
      if (!video) return;
      if (vfc && video.cancelVideoFrameCallback) { video.cancelVideoFrameCallback(vfc); vfc = 0; }
      if (!video.paused) video.pause();
    }

    /* The ink box: the film, the chalk and the floor are all masked to the glyphs, so there
       is no reason to rasterise them across the whole frame. Derived from the same metrics
       that place the type, widened by `part` because the two lines separate on scroll. */
    function inkBox(part) {
      const pad = Math.max(6, st.sizes[0] * 0.06);
      const capA = st.sizes[0] * 0.7;
      const y1 = st.top, y2 = y1 + st.lead + st.sizes[1] * 0.7;
      const x0 = Math.max(0, (st.w - st.tw) / 2 - pad);
      const y0 = Math.max(0, y1 - capA - part - pad);
      return [x0, y0, Math.min(st.w - x0, st.tw + pad * 2), Math.min(st.h - y0, (y2 + part + pad) - y0)];
    }

    /* Paint the glyphs of one line directly.
       These two fillText calls are the most expensive thing in the frame, and caching them
       into an offscreen bitmap and blitting it works — the raster comes out to within one
       pixel in 357,000, verified. It is still not here, because it cost the canvas its
       compositing: with the mask arriving as a canvas-to-canvas drawImage, the wordmark
       reproducibly failed to appear in Chrome's un-clipped screenshot path even though
       getImageData proved the right pixels were in the canvas. Correct pixels that a
       compositor may decline to show are not worth a saving on a hero that is the whole
       page. Kept as text. */
    function glyphs(i, y, size) {
      ctx.font = font(size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(LINES[i], st.w / 2, y);
    }

    function draw() {
      if (!st.ready) return;
      const { w, h } = st;
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const hx = chHero.cur;
      const intro = st.intro;
      const y1 = st.top;
      /* line 2's cap top sits one hairline of leading under line 1's baseline */
      const y2 = y1 + st.lead + st.sizes[1] * 0.7;

      /* the two halves part as the hero is scrolled away */
      const part = hx * st.sizes[0] * 0.5;

      /* ---- 1. the glyph shapes ---- */
      ctx.save();
      /* the opening sequence reveals each line from its own baseline upward */
      const rev = (a, b) => clamp((intro - a) / (b - a));
      const r1 = rev(0.14, 0.62);
      const r2 = rev(0.24, 0.74);
      if (r1 > 0) {
        ctx.save();
        const cap = st.sizes[0] * 0.7;
        ctx.beginPath();
        ctx.rect(0, y1 - cap * r1, w, cap * r1 + 2);
        ctx.clip();
        ctx.fillStyle = '#fff';
        glyphs(0, y1 - part, st.sizes[0]);
        ctx.restore();
      }
      if (r2 > 0) {
        ctx.save();
        const cap = st.sizes[1] * 0.7;
        ctx.beginPath();
        ctx.rect(0, y2 - cap * r2, w, cap * r2 + 2);
        ctx.clip();
        ctx.fillStyle = '#fff';
        glyphs(1, y2 + part, st.sizes[1]);
        ctx.restore();
      }
      ctx.restore();

      /* ---- 2. the glyphs become chalk, then the film rides inside them ----
         Everything below is masked to the type by source-in / source-atop, so it is painted
         over the ink box rather than the whole frame. Same pixels, a fraction of the raster. */
      const box = inkBox(part);
      ctx.save();
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#F6F4F1';
      ctx.fillRect(box[0], box[1], box[2], box[3]);
      ctx.restore();

      const filmIn = clamp((intro - 0.3) / 0.45);
      if (filmReady && filmIn > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box[0], box[1], box[2], box[3]);
        ctx.clip();
        /* source-atop: only where the destination is already opaque */
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = filmIn * 0.9;
        /* The film is a night sea, and it arrives here already graded up to a bright silver
           texture — see GRADE above for why that happens at the film's own resolution.
           Cover-fit the frame, with a little pointer drift so the letters read as windows
           onto something moving behind the page rather than as filled type. */
        const vw = film.width, vh = film.height;
        const scale = Math.max(w / vw, h / vh) * 1.16;
        const dw = vw * scale, dh = vh * scale;
        const dx = (w - dw) / 2 - st.px * dw * 0.03;
        const dy = (h - dh) / 2 - st.py * dh * 0.03;
        ctx.drawImage(film, dx, dy, dw, dh);
        ctx.restore();
        /* A floor inside the glyphs. The two lines sample different bands of the film, and
           MUSIC lands on open water that is genuinely almost black, so without this lift the
           second line reads several stops darker than the first. */
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.3 * filmIn;
        ctx.fillStyle = '#F6F4F1';
        ctx.fillRect(box[0], box[1], box[2], box[3]);
        ctx.restore();
      }

    }

    /* the canvas only needs a frame loop while the film is playing or the intro is running */
    /* This draws EVERY frame, deliberately.
       It is tempting to skip frames whose inputs have not changed, and an earlier version of
       this did: a canvas keeps its last painting, so the screen looks the same. But a skip is
       only sound if the signature covers every input, and geometry is an input. A screenshot
       or a device-metrics change can fire a resize while the canvas rect is momentarily
       degenerate; layout() then bakes a garbage raster, and if no further change is signalled
       the canvas holds that garbage FOREVER. Drawing unconditionally self-heals in one frame.
       The expensive part is gone regardless: the grade happens once per film frame, at the
       film's own resolution, only while the hero is on screen. What is left is two fillText
       calls in a clipped box, which is cheap enough not to trade correctness for. */
    let mraf = 0;
    function loop() {
      mraf = 0;
      if (!(video && video.requestVideoFrameCallback)) pollFilm();
      draw();
      if (st.live) mraf = requestAnimationFrame(loop);
    }
    function start() { st.live = true; filmStart(); if (!mraf) mraf = requestAnimationFrame(loop); }
    function stop() { st.live = false; filmStop(); if (mraf) cancelAnimationFrame(mraf); mraf = 0; }

    layout();
    draw();

    new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting && !reduce.matches ? start() : stop()));
    }, { rootMargin: '5% 0px' }).observe(canvas);

    return {
      relayout() { layout(); draw(); },
      /* the GLYPH band in canvas space: cap top of line 1 to baseline of line 2. The lattice
         needs this, and it must not fall back to the canvas box, which is the whole frame. */
      band() {
        if (!st.ready) return null;
        return [st.top - st.sizes[0] * 0.7, st.top + st.lead + st.sizes[1] * 0.7];
      },
      pointer(x, y) { st.px = x; st.py = y; },
      setIntro(v) { st.intro = v; if (!st.live) draw(); },
      draw,
      start,
    };
  }



  /* ---------------- the lattice ----------------
   * A faithful port of the 21st.dev "mechanical-waves" component (registry:
   * designali-in/mechanical-waves, original kept at src/vendor/ for reference). It is React,
   * this page has no dependencies, so the mechanism is reimplemented rather than vendored.
   *
   * The mechanism, which is the whole point of it:
   *   - a DENSE field of horizontal node lines (8px pitch, 10px node pitch) that CONVEYS:
   *     baselineOffset advances every frame and the line buffer rotates every LINE_SPACING
   *     frames, so lines continuously travel upward and are recycled at the top
   *   - 3D simplex noise wobbles every node
   *   - a disturbance is seeded on the line under the pointer, and its gaussian is evaluated
   *     in the TIME domain: one axis is the peak's own AGE against PEAK_AGE, the other is
   *     distance along the line. Past its peak the sigmas change (DECAY_LENGTH_FACTOR
   *     stretches it, DECAY_WIDTH_FACTOR widens it), so a ripple is born sharp and then
   *     disperses while the conveyor carries it away. That wake is the signature.
   *   - each line is filled as well as stroked, so nearer lines occlude the ones behind
   *
   * Two deliberate departures, both to fit this hero rather than to change the effect:
   * the fill is a LOW-ALPHA ink rather than opaque, so the film behind still reads; and the
   * band the wordmark occupies is punched out of the finished frame.
   *
   * One optimisation: the original evaluates every node against every possible peak slot,
   * which is O(nodes²) per line per frame (~2M gaussians per frame at this size). Active
   * peaks are tracked in a list instead. Same arithmetic, same output, far fewer evaluations.
   */

  /* 3D simplex noise (Gustavson's standard construction), needed for the node wobble. */
  function makeSimplex(seed) {
    const p = new Uint8Array(256);
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    /* seeded so the field is the same field on every visit */
    let s = seed || 0x2545f491;
    const rnd = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 256; i++) p[i] = Math.floor(rnd() * 256);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
    const grad3 = new Float32Array([
      1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
      0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
    ]);
    const F3 = 1 / 3, G3 = 1 / 6;
    return function noise3D(xin, yin, zin) {
      const t0s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + t0s), j = Math.floor(yin + t0s), k = Math.floor(zin + t0s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else if (z0 > y0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (z0 > x0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
      let a0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (a0 > 0) {
        const g = (permMod12[ii + perm[jj + perm[kk]]] * 3) % 12;
        a0 *= a0; n0 = a0 * a0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0);
      }
      let a1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (a1 > 0) {
        const g = (permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3) % 12;
        a1 *= a1; n1 = a1 * a1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1);
      }
      let a2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (a2 > 0) {
        const g = (permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3) % 12;
        a2 *= a2; n2 = a2 * a2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2);
      }
      let a3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (a3 > 0) {
        const g = (permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3) % 12;
        a3 *= a3; n3 = a3 * a3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3);
      }
      return 32 * (n0 + n1 + n2 + n3);
    };
  }

  function makeLattice(canvas, opts = {}) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    /* the original's constants, unchanged */
    const PEAK_AGE = 20;
    const DECAY_LENGTH_FACTOR = 20;
    const DECAY_WIDTH_FACTOR = 1 / 25;
    const WOBBLE_SPEED = 1 / 300;
    const LINE_SPACING = 8;
    const NODE_SPACING = 10;
    const NEIGHBOR_GAP = 3;
    const SPEED = opts.speed ?? 1;
    /* The original advances the conveyor one pixel PER FRAME, which is ~60px/s on a 60Hz
       display and ~120px/s on a 120Hz one. Both too fast for a background here, and the
       second is a portability bug: everything below is driven from elapsed TIME instead. */
    const FLOW_PX_S = opts.flow ?? 13;          /* conveyor travel */
    const NOISE_RATE = opts.noiseRate ?? 7;     /* wobble advance, in original-frame units */
    const AGE_RATE = opts.ageRate ?? 26;        /* ripple maturation, same units */
    const AMPLITUDE = opts.amplitude ?? 1.6;    /* their default is 0, i.e. flat when idle */
    const PEAK_HEIGHT = opts.peakHeight ?? 40;

    const noise3D = makeSimplex(0x51ed270b);
    const st = {
      w: 0, h: 0, dpr: 1, numNodes: 0, numLines: 0, hTotal: 0,
      lines: [], peaks: [],            /* peaks[line] = Map(nodeIndex -> age) */
      t: 0, flow: 0, phase: 0, travel: 0,
      peak: { x: -1e4, y: -1e4 },
      live: false, intro: 0, dip: null,
    };
    const mod = (a, b) => ((a % b) + b) % b;
    const gaussian2d = (a, x, y, x0, y0, sigmaX, sigmaY) => a * Math.exp(
      -((x - x0) ** 2) / (2 * sigmaX ** 2) - ((y - y0) ** 2) / (2 * sigmaY ** 2)
    );

    function size() {
      const r = canvas.getBoundingClientRect();
      st.dpr = Math.min(devicePixelRatio || 1, 2);
      st.w = Math.max(1, Math.round(r.width));
      st.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(st.w * st.dpr);
      canvas.height = Math.round(st.h * st.dpr);
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      st.numNodes = Math.floor(st.w / NODE_SPACING) + 1;
      st.numLines = Math.floor(st.h / LINE_SPACING) + 1 + Math.ceil(PEAK_HEIGHT / LINE_SPACING);
      st.hTotal = st.numLines * LINE_SPACING;
      st.lines = Array.from({ length: st.numLines }, () => new Float32Array(st.numNodes));
      st.peaks = Array.from({ length: st.numLines }, () => new Map());
      st.dip = opts.band?.() || null;
    }

    function draw(dt) {
      const { w, h, numNodes, numLines } = st;
      ctx.clearRect(0, 0, w, h);
      const fade = clamp((st.intro - 0.2) / 0.55);
      if (fade <= 0 || !numLines) return;

      /* the conveyor: lines travel up, and the buffer recycles one every LINE_SPACING of
         travel. Accumulated in PIXELS over elapsed time, so the speed is the same on any
         refresh rate, and a dropped frame does not skip a rotation. */
      st.flow += dt * FLOW_PX_S;
      st.travel += dt * FLOW_PX_S;
      /* An 8px-periodic field defeats cross-correlation: every candidate shift aliases, so a
         2s sample read 43px/s for a 13px/s conveyor. The true cumulative travel is published
         for the harness only when it asks, so the speed can be asserted rather than inferred. */
      if (doc.hasAttribute('data-qa')) canvas.dataset.travel = st.travel.toFixed(1);
      while (st.flow >= LINE_SPACING) {
        st.flow -= LINE_SPACING;
        st.lines.unshift(st.lines.pop());
        st.phase = mod(st.phase + 1, numLines);
        st.peaks[st.phase].clear();
      }
      st.t += dt * NOISE_RATE;

      const peakNode = {
        x: mod(Math.ceil(st.peak.x / NODE_SPACING), numNodes),
        y: mod(Math.ceil(st.peak.y / LINE_SPACING) + 1, numLines),
      };
      const pointerOn = st.peak.x > -1e3;

      for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
        const adj = mod(lineIdx + st.phase, numLines);
        const nodes = st.lines[adj];
        const peaks = st.peaks[adj];

        /* seed a disturbance on the line under the pointer, no closer than NEIGHBOR_GAP
           to one already there */
        if (pointerOn && peakNode.y === lineIdx && !peaks.has(peakNode.x)) {
          let free = true;
          for (let i = peakNode.x - NEIGHBOR_GAP; i < peakNode.x + NEIGHBOR_GAP; i++) {
            if (peaks.has(i)) { free = false; break; }
          }
          if (free) peaks.set(peakNode.x, 1);
        }

        const active = peaks.size ? [...peaks.entries()] : null;

        for (let nodeIdx = 0; nodeIdx < numNodes; nodeIdx++) {
          const noise = noise3D(adj, nodeIdx, st.t * SPEED * WOBBLE_SPEED);
          let peaksValue = 0;
          if (active) {
            for (let a = 0; a < active.length; a++) {
              const [peakNodeIdx, rawAge] = active[a];
              const age = rawAge * SPEED;
              const ageDiff = age - PEAK_AGE;
              const rising = ageDiff <= 0;
              peaksValue += ((noise + 1) / 2) * gaussian2d(
                PEAK_HEIGHT,
                age,
                nodeIdx - peakNodeIdx,
                PEAK_AGE,
                0,
                10 * SPEED * (rising ? 1 : 1 + DECAY_LENGTH_FACTOR),
                (0.5 / SPEED) * (rising ? 1 : 1 + ageDiff * DECAY_WIDTH_FACTOR * 2)
              );
            }
          }
          peaksValue = Math.max(Math.min(peaksValue, PEAK_HEIGHT * 3), 0);
          nodes[nodeIdx] = noise * AMPLITUDE + peaksValue;
        }

        const baseline = mod(lineIdx * LINE_SPACING - st.flow, st.hTotal);

        /* The wordmark's own air. This has to RAMP: a binary in-band test put a hard
           horizontal edge across the whole frame where the lines resumed, which read as the
           field cutting off. smoothstep over a generous pad, so the field thins toward the
           type and thickens away from it with no boundary to see. */
        let vis = 1;
        if (st.dip) {
          const [d0, d1] = st.dip;
          const RAMP = 150;
          /* 0 at the band, 1 once RAMP away from it */
          const outside = Math.max(d0 - baseline, baseline - d1);
          const u = clamp(outside / RAMP);
          vis = 0.06 + 0.94 * (u * u * (3 - 2 * u));
        }
        /* and a true fade at the frame's own edges, with no floor holding it up */
        vis *= Math.sin(Math.PI * clamp(baseline / h)) ** 0.7;
        if (vis < 0.015) continue;

        ctx.beginPath();
        ctx.moveTo(0, baseline);
        ctx.lineTo(0, baseline - nodes[0]);
        for (let x = 1; x < numNodes - 1; x++) {
          const y = nodes[x];
          const midY = (y + nodes[x + 1]) / 2;
          ctx.quadraticCurveTo(x * NODE_SPACING, baseline - y, (x + 0.5) * NODE_SPACING, baseline - midY);
        }
        ctx.lineTo(w, baseline);
        /* a low-alpha ink fill keeps the original's occlusion between lines while letting the
           film behind the hero still read; an opaque fill would bury it */
        ctx.fillStyle = `rgba(10,10,11,${(0.2 * fade).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(246,244,241,${(0.135 * vis * fade).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        /* age every live peak, and retire the ones that can no longer contribute */
        if (active) {
          for (let a = 0; a < active.length; a++) {
            const [idx, age] = active[a];
            if (age > PEAK_AGE + 260) peaks.delete(idx);
            else peaks.set(idx, age + dt * AGE_RATE);
          }
        }
      }
    }

    /* The field's own clock. Rasterising 118 filled-and-stroked paths across the frame is
       ~15ms of the browser's time, and at 60Hz it was being spent to advance a conveyor that
       travels 13 PIXELS A SECOND — a fifth of a pixel per frame. Redrawn on a fixed 33ms
       cadence the motion is identical to the eye (the fastest thing in the field, a ripple,
       still gets ~45 samples over its life) and the canvas simply keeps its last frame in
       between, so nothing is dropped, only not repeated. dt is real elapsed time, so the
       travel speed is unchanged. */
    const LAT_STEP = 1 / 30;
    let lraf = 0, llast = 0, lacc = 0;
    function loop(now) {
      lraf = 0;
      const dt = llast ? Math.min((now - llast) / 1000, 0.05) : 0.016;
      llast = now;
      lacc += dt;
      if (lacc >= LAT_STEP) { draw(lacc); lacc = 0; }
      if (st.live) lraf = requestAnimationFrame(loop);
      else { llast = 0; lacc = 0; }
    }
    function start() { if (st.live || reduce.matches) return; st.live = true; if (!lraf) lraf = requestAnimationFrame(loop); }
    function stop() { st.live = false; if (lraf) cancelAnimationFrame(lraf); lraf = 0; llast = 0; }

    size();
    new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? start() : stop()));
    }, { rootMargin: '5% 0px' }).observe(canvas);

    /* the field is never dead: an ambient disturbance wanders even with no pointer */
    let amb = 0;
    (function ambient() {
      amb = setTimeout(() => {
        if (st.live && st.peak.x < -1e3) {
          const n = noise3D(st.t * 0.01, 7, 0.5);
          const m = noise3D(3, st.t * 0.01, 1.5);
          st.peak = { x: st.w * (0.5 + n * 0.42), y: st.h * (0.5 + m * 0.45) };
          setTimeout(() => { if (st.peak.x >= -1e3 && !st.pointerHeld) st.peak = { x: -1e4, y: -1e4 }; }, 260);
        }
        ambient();
      }, 2200);
    })();

    return {
      relayout() { size(); },
      setIntro(v) { st.intro = v; },
      pointer(x, y) { st.pointerHeld = true; st.peak = { x, y }; },
      leave() { st.pointerHeld = false; st.peak = { x: -1e4, y: -1e4 }; },
    };
  }

  /* ---------------- the loader ---------------- */
  /* Their own wordmark, painted in block by block, then flown to the header. The dissolve
     order is SEEDED, not random: the same visit-to-visit reveal is a brand behaviour, and a
     fresh random pattern each load reads as noise. The flight is exact because the loader
     and the header render the identical path at different widths, so it is a pure scale plus
     translate — no metric matching, nothing to drift (deriving a scale from a rect HEIGHT
     rather than the artwork's own width is what has gone wrong on this kind of move before). */
  function runLoader(done) {
    const load = document.querySelector('[data-load]');
    const lock = document.querySelector('[data-load-lock]');
    const grid = document.querySelector('[data-load-grid]');
    const bar = document.querySelector('[data-load-bar]');
    const hdLogo = document.querySelector('[data-hd-lock]');
    if (!load || !grid || reduce.matches) { load?.setAttribute('data-done', '1'); done(); return; }

    document.body.classList.add('al-loading');

    /* cells sized off the lockup's own 264:36 proportion so they read as square pixels */
    const cols = innerWidth < 720 ? 26 : 44;
    const rows = Math.max(3, Math.round((cols * 36) / 264));
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', rows);

    const total = cols * rows;
    const order = [];
    for (let i = 0; i < total; i++) order.push(i);
    /* deterministic shuffle from a fixed seed */
    let h = 0x9e3779b9;
    for (let i = total - 1; i > 0; i--) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
      const j = h % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }

    const cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const c = document.createElement('i');
      frag.appendChild(c);
      cells.push(c);
    }
    grid.appendChild(frag);
    /* the delay carries the sweep: reveal order, not per-cell timers */
    const SWEEP = 1000;
    order.forEach((cellIndex, k) => {
      cells[cellIndex].style.setProperty('--d', `${((k / total) * SWEEP).toFixed(0)}ms`);
    });

    hdLogo?.setAttribute('data-waiting', '1');

    requestAnimationFrame(() => {
      cells.forEach((c) => c.setAttribute('data-off', '1'));
      const t0 = performance.now();
      const tick = (now) => {
        const p = clamp((now - t0) / (SWEEP + 320));
        bar?.style.setProperty('--p', p.toFixed(3));
        if (p < 1) requestAnimationFrame(tick);
        else fly();
      };
      requestAnimationFrame(tick);
    });

    function fly() {
      /* Measure the ARTWORK on both sides, never its container. The header lockup sits in a
         link that carries 14px of vertical padding so it clears a 44px tap target, so the
         link's box is 28px taller than the SVG inside it: targeting the link landed the mark
         14px high. Both sides are the same path at different widths, so comparing the two
         <svg> boxes makes the flight exact. */
      const fromEl = lock.querySelector('.al-lock');
      const toEl = hdLogo?.querySelector('.al-lock');
      if (!fromEl || !toEl) { land(); return; }
      const from = fromEl.getBoundingClientRect();
      const to = toEl.getBoundingClientRect();
      if (!to.width || !from.width) { land(); return; }
      /* scale off WIDTH, not height: height is subject to the SVG's own aspect rounding */
      const k = to.width / from.width;
      /* the transform lands on `lock`, whose origin is 0 0, so the offset of the svg inside
         it is carried through the scale unchanged */
      const ox = from.left - lock.getBoundingClientRect().left;
      const oy = from.top - lock.getBoundingClientRect().top;
      lock.style.transition = 'transform .82s cubic-bezier(.7,0,.2,1)';
      lock.style.transform = `translate(${(to.left - from.left + ox * (1 - k)).toFixed(2)}px,`
        + `${(to.top - from.top + oy * (1 - k)).toFixed(2)}px) scale(${k.toFixed(4)})`;
      setTimeout(land, 700);
    }

    function land() {
      hdLogo?.removeAttribute('data-waiting');
      load.setAttribute('data-done', '1');
      document.body.classList.remove('al-loading');
      setTimeout(() => load.remove(), 900);
      done();
    }
  }

  /* ---------------- the opening sequence ---------------- */
  /* One timeline: the groove draws, the name opens from its own baseline, the wave ignites
     inside the letters, then the frame and the chrome arrive. Skippable on any input, and
     under prefers-reduced-motion it never runs at all. */
  function runIntro(mark) {
    const DUR = 1900;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      mark?.setIntro(1);
      lattice?.setIntro(1);
      document.body.classList.remove('al-intro');
      removeEventListener('pointerdown', finish);
      removeEventListener('keydown', finish);
      removeEventListener('wheel', finish);
      mark?.start();
      onScroll();
    };
    if (reduce.matches) { finish(); return; }

    document.body.classList.add('al-intro');
    addEventListener('pointerdown', finish, { once: true });
    addEventListener('keydown', finish, { once: true });
    addEventListener('wheel', finish, { once: true, passive: true });

    const t0 = performance.now();
    let chromeIn = false;
    const step = (now) => {
      const p = clamp((now - t0) / DUR);
      /* ease out cubic: the sequence lands rather than stopping */
      const e = 1 - (1 - p) ** 3;
      mark?.setIntro(e);
      lattice?.setIntro(e);
      /* the header, lead and ticker come in while the letters are still settling, so the
         frame is never just an empty black plate waiting for the end of a timeline */
      if (!chromeIn && p > 0.42) {
        chromeIn = true;
        document.body.classList.remove('al-intro');
      }
      if (p < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
  }

  /* ---------------- boot ---------------- */
  markReveals();

  /* `animation: … infinite` means infinite, including the hours it spends off screen.
     The scroll cue, the ticker and the drag hint each kept the animation timeline hot for the
     whole session: a style-recalc mark every frame per animated element, and a compositor that
     never gets to go quiet. They are cheap individually and permanent collectively, which is
     the profile of the thing that flattens a phone battery. Pause them when they are not
     being looked at; the browser keeps the animation's position, so nothing restarts. */
  const paced = [...document.querySelectorAll('.al-hero-scroll-r, .al-tk-track, .al-rail-hint')];
  if (paced.length && !reduce.matches) {
    const pacer = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) e.target.removeAttribute('data-anim');
        else e.target.setAttribute('data-anim', 'off');
      });
    }, { rootMargin: '10% 0px' });
    paced.forEach((el) => pacer.observe(el));
  }

  /* backgrounded tabs pause video-only autoplay; poke it and fall back to the poster */
  const film = document.querySelector('.al-hero-video');
  if (film && !reduce.matches) { film.muted = true; film.play().catch(() => {}); }

  const heroMark = makeMark(document.querySelector('[data-markc]'), film);
  const lattice = makeLattice(document.querySelector('[data-lattice]'), {
    band: () => heroMark?.band(),
  });
  const hero = document.querySelector('[data-hero]');
  if (hero && heroMark) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      heroMark.pointer(
        ((e.clientX - r.left) / r.width - 0.5) * 2,
        ((e.clientY - r.top) / r.height - 0.5) * 2
      );
      /* the lattice takes real canvas coordinates: the peak has to land under the cursor */
      lattice?.pointer(e.clientX - r.left, e.clientY - r.top);
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { heroMark.pointer(0, 0); lattice?.leave(); });
  }

  const odo = makeOdometer(document.querySelector('[data-odo]'));
  const rail = makeRail(document.querySelector('[data-rail]'), {
    /* the release rail carries itself: a shop window keeps turning whether or not the
       reader is scrolling. The timeline stays scroll-read, because a timeline is a
       reading order and its year odometer has to agree with it. */
    trackSel: '[data-rail-track]', itemSel: '.al-rel', prop: '--al-rail', drift: 42,
  });
  const tl = makeRail(document.querySelector('[data-tl]'), {
    trackSel: '[data-tl-track]', itemSel: '.al-era', prop: '--al-tl', drift: 52,
    onMove: (x, span) => {
      const t = span ? x / span : 0;
      document.querySelector('[data-tl]')?.style.setProperty('--al-tl-fill', t.toFixed(4));
      const eras = document.querySelectorAll('[data-era]');
      const i = Math.round(t * (eras.length - 1));
      eras.forEach((e, k) => (k === i ? e.setAttribute('data-on', '1') : e.removeAttribute('data-on')));
      /* the big year is driven by the RAIL, not by raw scroll, so dragging the timeline and
         scrolling the page can never disagree about which era is showing */
      odo?.update(t * 0.999);
    },
  });
  const roll = makeRoll();

  /* one scroll pass, zero layout reads: every position is cached here and refreshed on
     resize / fonts-ready / load */
  /* The shop rule's position DRIVES the channel; every rule on the page RECEIVES it. Those
     were the same list back when the value lived on the root and simply inherited everywhere
     — the footer rule was riding on the shop rule's inheritance. Writing per element makes
     the distinction load-bearing, so it is spelled out. */
  const ruleDrivers = [...document.querySelectorAll('.al-shop .al-rule')];
  ruleEls = [...document.querySelectorAll('.al-rule')];
  const bandEls = [...document.querySelectorAll('[data-theme]')];
  let ruleBoxes = [], bandBoxes = [], rollBox = null, shopBox = null, histBox = null;
  /* every full-width band takes part in the stack choreography */
  const panels = [...document.querySelectorAll('.al-shop, .al-roll, .al-hist, .al-parent, .al-cta, .al-ft')];
  let panelBoxes = [];
  const shopEl = document.querySelector('.al-shop');
  const histEl = document.querySelector('.al-hist');

  function measureBoxes() {
    measureReveals();
    measureSplits();
    /* the write-guards above cache the last value written to each element. A re-measure moves
       the geometry under them, and an element whose inline style was cleared by anything else
       would never be written again, so the caches die with the boxes that produced them. */
    revealed.forEach((r) => { r.rv = undefined; });
    splits.forEach((s) => { s.railV = null; });
    panelBoxes = panels.map((el) => ({ el, top: absTop(el), h: el.offsetHeight }));
    shopBox = shopEl ? { top: absTop(shopEl), h: shopEl.offsetHeight } : null;
    histBox = histEl ? { top: absTop(histEl), h: histEl.offsetHeight } : null;
    ruleBoxes = ruleDrivers.map((el) => ({ top: absTop(el), h: el.offsetHeight }));
    bandBoxes = bandEls.map((el) => ({ top: absTop(el), h: el.offsetHeight, theme: el.dataset.theme }));
    rollBox = roll ? { top: absTop(roll.spacer), h: roll.spacer.offsetHeight } : null;
  }
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = scrollY;
      const vh = innerHeight;
      const dh = doc.scrollHeight - vh;

      /* READS — all layout positions, cached at measure time; nothing here forces a
         reflow, which is why 45 driven elements hold 60fps */
      const hdMid = hd ? hd.offsetHeight * 0.5 : 30;
      let theme = 'dark';
      for (const b of bandBoxes) {
        if (b.top - y <= hdMid && b.top + b.h - y > hdMid) theme = b.theme;
      }

      /* WRITES */
      setT(chPage, dh > 0 ? clamp(y / dh) : 0);
      setT(chHero, clamp(y / (vh * 0.85)));
      const dy = y - lastY;
      setT(chVel, clamp(dy / 90, -1, 1));
      /* Velocity is only written when a scroll event fires, so when scrolling STOPS the
         last value sticks and anything coupled to it (the marquee) keeps running at speed
         forever. Measured: bands travelling ~400px/s at rest instead of 46. Zero it on a
         short timer after the last event. */
      clearTimeout(velT);
      velT = setTimeout(() => setT(chVel, 0), 120);
      lastY = y;

      if (hd) {
        hd.setAttribute('data-hidden', dy > 6 && y > vh * 0.8 ? '1' : '0');
        if (hd.dataset.theme !== theme) hd.dataset.theme = theme;
      }

      /* Every write below is guarded by "would this actually change anything".
         53 reveal elements, 5 panels and the rails were being written on every scroll frame
         whether or not their value had moved, and a custom-property write invalidates that
         element's style whatever it is set to. At any scroll position nearly all of them are
         pinned at 0 or 1, outside their own window: 47 writes a frame, of which a handful
         mattered. Skipping a write that would set the identical value is invisible by
         construction — unlike skipping a whole redraw, there is no hidden input, because the
         comparison IS the value being written. Caches are cleared in measureBoxes(), so a
         relayout cannot leave a stale one behind. */
      const start = vh * 0.94, end = vh * 0.42;
      for (const r of revealed) {
        const top = r.top - y;
        const v = Math.round(clamp((start - top) / Math.max(1, start - end)) * 1e4) / 1e4;
        if (v !== r.rv) { r.rv = v; r.el.style.setProperty('--rv', v.toFixed(4)); }
      }

      for (const r of ruleBoxes) {
        setT(chRule, clamp((vh * 0.92 - (r.top - y)) / (vh * 0.5)));
      }

      /* 1. text entrances: one-shot, fired when the block's top crosses 92% of the
         viewport, exactly like theirs. Time-based on purpose — scrubbing an entrance would
         flatten the per-character stagger into a single smear. */
      for (const s of splits) {
        if (s.done) continue;
        if (s.top - y < vh * 0.92) { s.el.classList.add('is-in'); s.done = true; }
      }

      /* 2. per-line rails: each line's rail carries that line's share of the block's own
         progress, so they fill one after another as the block is read. Position-based,
         therefore reversible. */
      for (const s of splits) {
        if (!s.rails) continue;
        const p = clamp((vh * 0.9 - (s.top - y)) / (vh * 0.62));
        const n = s.rows.length;
        /* the rail elements were being looked up by selector per row PER FRAME. They are
           rebuilt only by buildSplits(), which makes new split objects, so this cannot go
           stale. */
        if (!s.railEls) s.railEls = s.rows.map((row) => row.querySelector('.al-row-rail > i'));
        if (!s.railV) s.railV = new Array(n).fill(-1);
        for (let ri = 0; ri < n; ri++) {
          const rail = s.railEls[ri];
          if (!rail) continue;
          const v = Math.round(clamp(p * n - ri) * 1e4) / 1e4;
          if (v !== s.railV[ri]) { s.railV[ri] = v; rail.style.transform = `scaleX(${v.toFixed(4)})`; }
        }
      }

      /* 5. THE STACK. Sections used to hard-cut into one another. Now the panel being
         left behind recedes (scales toward the top edge, lifts and dims) while the panel
         arriving lags below its layout position and catches up, so the two slide over each
         other like stacked plates. Pure transform and opacity on elements that are already
         there: no sticky nesting, no layout change, and every value is a pure function of
         scroll position, so the whole thing is reversible. */
      for (const p of panelBoxes) {
        const top = p.top - y;
        const exit = Math.round(clamp((-top) / (p.h * 0.55 + vh * 0.5)) * 1e4) / 1e4;
        const enter = Math.round(clamp((top - vh * 0.1) / (vh * 0.7)) * 1e4) / 1e4;
        if (exit !== p.exit) { p.exit = exit; p.el.style.setProperty('--al-exit', exit.toFixed(4)); }
        if (enter !== p.enter) { p.enter = enter; p.el.style.setProperty('--al-enter', enter.toFixed(4)); }
      }

      /* 6. the release cards ride their own depth: each one lags a little more than its
         neighbour as the rail passes, so the row has thickness instead of being a flat strip */
      if (shopBox) {
        const pass = Math.round((clamp((y + vh - shopBox.top) / (shopBox.h + vh)) * 2 - 1) * 1e4) / 1e4;
        if (pass !== shopBox.cardp) { shopBox.cardp = pass; shopEl.style.setProperty('--al-cardp', pass.toFixed(4)); }
      }

      /* 4. scrubbed travel and rotation over each element's full pass through the
         viewport (their "top bottom" → "bottom top" window) */
      if (shopBox) {
        const spin = Math.round(clamp((y + vh - shopBox.top) / (shopBox.h + vh)) * 660 * 100) / 100;
        if (spin !== shopBox.spin) { shopBox.spin = spin; shopEl.style.setProperty('--al-spin', `${spin.toFixed(2)}deg`); }
      }


      if (rollBox) {
        roll.update(rollBox.top - y, rollBox.h, vh);
        if (Math.abs(dy) > 2) roll.poke();
      }
    });
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  /* the traverse of both rails depends on fonts and images being final */
  function relayout() {
    rail?.measure(); rail?.run();
    tl?.measure();
    roll?.measure();
    odo?.measure();
    buildSplits();
    heroMark?.relayout();
    lattice?.relayout();
    measureBoxes();
    onScroll();
  }
  addEventListener('resize', relayout, { passive: true });
  addEventListener('load', relayout);
  measureBoxes();
  onScroll();

  /* The sequence cannot start before Humane is resolved: the wordmark is measured with
     measureText, and a fallback face would fit the lines to the wrong size and then jump. */
  const startIntro = () => {
    relayout();
    /* the loader hands off to the hero sequence, so the two never overlap */
    runLoader(() => runIntro(heroMark));
  };
  if (document.fonts) {
    document.fonts.load('500 200px Humane').then(startIntro).catch(startIntro);
  } else startIntro();

  /* ---------------- menu ---------------- */
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (burger && menu) {
    let open = false;
    const set = (v) => {
      open = v;
      burger.setAttribute('aria-expanded', String(v));
      if (v) {
        menu.hidden = false;
        requestAnimationFrame(() => menu.setAttribute('data-open', '1'));
      } else {
        menu.removeAttribute('data-open');
        setTimeout(() => { if (!open) menu.hidden = true; }, 520);
      }
      document.body.style.overflow = v ? 'hidden' : '';
    };
    burger.addEventListener('click', () => set(!open));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { set(false); burger.focus(); } });
  }

  /* reduced-motion can be toggled while the page is open */
  reduce.addEventListener?.('change', () => location.reload());
})();
