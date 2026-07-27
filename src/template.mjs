import {
  META, NAV, HERO, SHOP, ROSTER, HISTORY, PARENT, CTA, FOOTER,
  ARTISTS, RELEASES,
} from './content.mjs';
import { LOCKUP_PATH, LOCKUP_VIEWBOX } from './brand.mjs';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isk = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kr`;

/* Their lockup, straight from the SVG they serve: the 8-bit mark and the wordmark in one
   path, taking currentColor. The pixel staircase is theirs, and it is also why the spec
   voice on this page is a pixel mono. */
const brandLockup = (id, cls = 'al-lock') => `
<svg class="${cls}" viewBox="${LOCKUP_VIEWBOX}" role="img" aria-labelledby="${id}" focusable="false">
  <title id="${id}">Alda Music</title>
  <path fill="currentColor" fill-rule="evenodd" d="${LOCKUP_PATH}"/>
</svg>`;

/* A tall thin waveform glyph used as the section rule. Drawn, not an image, so it inherits
   the band's ink and costs nothing. */
const waveRule = () => `
<svg class="al-rule" viewBox="0 0 1200 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path d="M0 12h84l10-7 9 14 10-19 9 24 10-14 9 9 11-5h96l10-9 9 18 10-24 9 30 10-18 9 11 11-8h96l10-6 9 12 10-16 9 20 10-12 9 8 11-6h96l10-11 9 22 10-28 9 34 10-20 9 13 11-10h96l10-5 9 10 10-14 9 18 10-10 9 7 11-6h96l10-8 9 16 10-20 9 24 10-14 9 9 11-7h96" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

const sleeve = (r, i) => `
<article class="al-rel" data-rel="${i}" style="--n:${i % 8}">
  <a class="al-rel-link" href="${esc(r.url)}" target="_blank" rel="noopener">
    <span class="al-rel-frame">
      <span class="al-rel-disc" aria-hidden="true"><span class="al-rel-disc-i"></span></span>
      <img class="al-rel-img" src="img/shop/${esc(r.slug)}.webp" width="${r.w}" height="${r.h}"
           alt="Umslag: ${esc(r.artist)}, ${esc(r.title)}" loading="lazy" decoding="async">
    </span>
    <span class="al-rel-meta">
      <span class="al-rel-fmt">${esc(r.format)}</span>
      <span class="al-rel-artist">${esc(r.artist)}</span>
      <span class="al-rel-title">${esc(r.title)}</span>
      <span class="al-rel-price">${esc(isk(r.price))}</span>
    </span>
  </a>
</article>`;

const rosterRow = (a, i) => `
<li class="al-name" data-i="${i}">
  <button type="button" class="al-name-b" data-goto="${i}" aria-label="Sýna ${esc(a.name)}">
    <span class="al-name-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
    <span class="al-name-t">${esc(a.name)}</span>
  </button>
</li>`;

/* Six of the roster photographs are small originals (Elly Vilhjálms is 342px, and that IS
   the source: asking Prismic for more just upscales). Full-bleed cover blew one of them up
   4.4x. Those render as a CONTAINED plate at roughly their own pixels over a deliberately
   out-of-focus wash of themselves, which reads as archive material instead of as a blurry
   blow-up. The threshold is measured, not guessed: 800px is where cover on a 1440 viewport
   stops being honest. */
const plate = (a, i) => {
  const archive = a.w < 800;
  return `
<figure class="al-plate" data-plate="${i}" ${i === 0 ? 'data-on="1"' : ''}${archive ? ' data-archive="1"' : ''}
        ${archive ? `style="--al-bg:url('img/artists/${esc(a.slug)}.webp')"` : ''}>
  <img src="img/artists/${esc(a.slug)}.webp" width="${a.w}" height="${a.h}"
       alt="${esc(a.name)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"
       style="--al-natw:${a.w}px">
</figure>`;
};

const era = (h, i) => `
<article class="al-era" data-era="${i}">
  <span class="al-era-y">${esc(h.year)}</span>
  <span class="al-era-tag">${esc(h.tag)}</span>
  <h3 class="al-era-h">${esc(h.head)}</h3>
  <p class="al-era-b">${esc(h.body)}</p>
</article>`;

export function render({ noindex = false, previewOrigin = '' } = {}) {
  const canonical = previewOrigin || `https://${META.domain}/`;
  const ticker = RELEASES.slice(0, 8)
    .map((r) => `<span class="al-tk-i"><em>${esc(r.artist)}</em> ${esc(r.title)}<i aria-hidden="true">/</i></span>`)
    .join('');

  return `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(META.title)}</title>
<meta name="description" content="${esc(META.description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(META.title)}">
<meta property="og:description" content="${esc(META.description)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="is_IS">
<meta name="theme-color" content="#0A0A0B">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon-48.png" type="image/png" sizes="48x48">
<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preload" href="fonts/humane.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/archivo-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
</head>
<body class="al">

<!-- The loader is their own wordmark being painted in block by block. Their mark is 8-bit
     pixel art, so the reveal is a pixel dissolve rather than a fade: the lockup arrives the
     way a sprite arrives on an old machine. It then flies to the header, where the identical
     artwork is waiting. -->
<div class="al-load" data-load>
  <div class="al-load-in">
    <div class="al-load-lock" data-load-lock>
      ${brandLockup('load-mark', 'al-lock al-lock--load')}
      <div class="al-load-grid" data-load-grid aria-hidden="true"></div>
    </div>
    <div class="al-load-bar" aria-hidden="true"><i data-load-bar></i></div>
  </div>
</div>

<div class="al-grain" aria-hidden="true"></div>
<a class="al-skip" href="#plotur">Fara í innihald</a>

<header class="al-hd" data-hd>
  <a class="al-hd-logo" href="#top" aria-label="Alda Music, efst á síðu" data-hd-lock>
    ${brandLockup('hd-mark')}
  </a>
  <nav class="al-hd-nav" aria-label="Aðalvalmynd">
    ${NAV.map(([t, h]) => `<a class="al-hd-l" href="${esc(h)}"${h.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(t)}</a>`).join('')}
  </nav>
  <button type="button" class="al-burger" data-burger aria-expanded="false" aria-controls="al-menu">
    <span class="al-burger-l" aria-hidden="true"></span>
    <span class="al-burger-l" aria-hidden="true"></span>
    <span class="al-sr">Valmynd</span>
  </button>
</header>

<div class="al-menu" id="al-menu" data-menu hidden>
  <nav class="al-menu-nav" aria-label="Valmynd">
    ${NAV.map(([t, h], i) => `<a class="al-menu-l" style="--i:${i}" href="${esc(h)}"${h.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(t)}</a>`).join('')}
  </nav>
  <div class="al-menu-foot">
    <a href="tel:${esc(META.phoneHref)}">${esc(META.phone)}</a>
    <span>${esc(META.address)}</span>
  </div>
</div>

<main id="top">

  <section class="al-hero" data-hero data-theme="dark" aria-labelledby="al-h1">
    <div class="al-hero-frame">
      <!-- the film: a generated North Atlantic wave, monochrome, looped. The one asset on
           this page that is not the client's own; it is the brand word made literal. -->
      <div class="al-hero-film" aria-hidden="true">
        <video class="al-hero-video" muted loop playsinline autoplay
               poster="img/brand/wave-poster.webp" preload="metadata">
          <source src="img/brand/wave-loop.mp4" type="video/mp4">
        </video>
      </div>

      <p class="al-hero-eye">${esc(HERO.eyebrow)}</p>

      <!-- the lattice: mechanical waves travelling through a membrane of wires, above the
           film and below the letters -->
      <canvas class="al-lattice" data-lattice aria-hidden="true"></canvas>

      <!-- The name is a window: the film plays INSIDE the letters and nowhere else. Drawn
           in canvas rather than with mix-blend-mode, because a blend over a hardware
           composited <video> is silently ignored on WebKit. The h1 stays in the DOM as the
           real heading; the canvas is the picture of it. -->
      <div class="al-hero-stage">
        <h1 class="al-sr" id="al-h1">${esc(META.name)}</h1>
        <canvas class="al-markc" data-markc aria-hidden="true"></canvas>
      </div>

      <div class="al-hero-bot">
        <p class="al-hero-lead">${esc(HERO.lead)}</p>
      </div>

      <a class="al-hero-scroll" href="#plotur">
        <span class="al-hero-scroll-t">${esc(HERO.scroll)}</span>
        <span class="al-hero-scroll-r" aria-hidden="true"></span>
      </a>

      <div class="al-tk">
        <span class="al-tk-lab">${esc(HERO.tickerLabel)}</span>
        <div class="al-tk-win">
          <div class="al-tk-track" aria-hidden="true">${ticker}${ticker}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="al-shop" id="plotur" data-theme="light" aria-labelledby="al-shop-h">
    <div class="al-shop-head">
      <p class="al-eye">${esc(SHOP.eyebrow)}</p>
      <h2 class="al-h2" id="al-shop-h" data-split data-split-rails>${esc(SHOP.title)}</h2>
      <p class="al-lead" data-split>${esc(SHOP.lead)}</p>
    </div>

    <div class="al-rail" data-rail role="group" aria-label="Plötur í netverslun, dragðu til hliðar"
         tabindex="0">
      <div class="al-rail-track" data-rail-track>
        ${RELEASES.map(sleeve).join('')}
        <div class="al-rail-clone" aria-hidden="true">${RELEASES.map(sleeve).join('')}</div>
      </div>
      <p class="al-rail-hint" aria-hidden="true"><span>${esc(SHOP.drag)}</span></p>
    </div>

    <div class="al-shop-foot">
      <a class="al-btn" href="${esc(META.shop)}" target="_blank" rel="noopener">
        ${esc(SHOP.cta)}<span class="al-btn-a" aria-hidden="true"></span>
      </a>
      <p class="al-note">${esc(SHOP.priceNote)}</p>
    </div>
    ${waveRule()}
  </section>

  <section class="al-roll" id="listafolk" data-theme="dark" aria-labelledby="al-roll-h" data-roll>
    <div class="al-roll-spacer" data-roll-spacer>
      <div class="al-roll-vp">
        <!-- the current artist IS the section: full-bleed, sharp, edge to edge -->
        <div class="al-roll-stage" aria-hidden="true">
          ${ARTISTS.map(plate).join('')}
          <div class="al-roll-scrim"></div>
        </div>

        <div class="al-roll-in">
          <div class="al-roll-left">
            <p class="al-eye al-eye--dark">${esc(ROSTER.eyebrow)}</p>
            <h2 class="al-h2 al-h2--dark" id="al-roll-h" data-split>${esc(ROSTER.title)}</h2>

            <p class="al-roll-now" aria-live="polite">
              <span class="al-roll-now-n" data-roll-num>01</span>
              <span class="al-roll-now-l">${esc(ROSTER.countLabel)}</span>
              <span class="al-roll-now-t" data-roll-name>${esc(ARTISTS[0].name)}</span>
            </p>
            <canvas class="al-wave al-wave--roll" data-wave="roll" aria-hidden="true"></canvas>
          </div>

          <div class="al-roll-right">
            <div class="al-roll-mark" aria-hidden="true"></div>
            <ol class="al-roll-list" data-roll-list>
              ${ARTISTS.map(rosterRow).join('')}
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="al-hist" id="aldamot" data-theme="light" aria-labelledby="al-hist-h">
    <div class="al-hist-head">
      <p class="al-eye">${esc(HISTORY.eyebrow)}</p>
      <h2 class="al-h2" id="al-hist-h" data-split data-split-rails>${esc(HISTORY.title)}</h2>
      <p class="al-lead" data-split>${esc(HISTORY.lead)}</p>
    </div>

    <div class="al-odo" data-odo aria-hidden="true">
      <div class="al-odo-strip" data-odo-strip>
        ${HISTORY.items.map((h, i) => `<span class="al-odo-i" data-odo-item ${i === 0 ? 'data-on="1"' : ''}>${esc(h.year)}</span>`).join('')}
      </div>
    </div>

    <div class="al-tl" data-tl role="group" aria-label="Tímalína, dragðu til hliðar" tabindex="0">
      <div class="al-tl-line" aria-hidden="true"><span data-tl-fill></span></div>
      <div class="al-tl-track" data-tl-track>
        ${HISTORY.items.map(era).join('')}
        <!-- second pass of the ribbon so the rail can carry itself and wrap at exactly half
             its own width; aria-hidden so the eras are not announced twice -->
        <div class="al-rail-clone" aria-hidden="true">${HISTORY.items.map(era).join('')}</div>
      </div>
      <p class="al-rail-hint" aria-hidden="true"><span>${esc(HISTORY.drag)}</span></p>
    </div>
  </section>

  <section class="al-parent" data-theme="dark" aria-labelledby="al-parent-h">
    <p class="al-eye al-eye--dark">${esc(PARENT.eyebrow)}</p>
    <h2 class="al-parent-h" id="al-parent-h" data-split>${esc(PARENT.title)}</h2>
    <p class="al-parent-b" data-split>${esc(PARENT.body)}</p>
    <a class="al-parent-l" href="${esc(PARENT.link[1])}" target="_blank" rel="noopener">${esc(PARENT.link[0])}</a>
  </section>

  <section class="al-cta" data-theme="red" aria-labelledby="al-cta-h">
    <h2 class="al-cta-h" id="al-cta-h" data-split>${esc(CTA.head)}</h2>
    <p class="al-cta-b">${esc(CTA.body)}</p>
    <div class="al-cta-row">
      <a class="al-btn al-btn--ink" href="mailto:${esc(META.email)}?subject=${encodeURIComponent(CTA.subject)}">
        ${esc(CTA.action)}<span class="al-btn-a" aria-hidden="true"></span>
      </a>
      <a class="al-btn al-btn--ghost" href="#footer">${esc(CTA.secondary)}</a>
    </div>
  </section>

</main>

<footer class="al-ft" id="footer" data-theme="dark">
  <div class="al-ft-top">
    <a class="al-ft-logo" href="#top" aria-label="Alda Music, efst á síðu">
      ${brandLockup('ft-mark', 'al-lock al-lock--ft')}
    </a>
    ${waveRule()}
  </div>

  <div class="al-ft-cols">
    <div class="al-ft-col">
      <h3 class="al-ft-lab">${esc(FOOTER.shopLabel)}</h3>
      <p class="al-ft-addr">${esc(META.address)}</p>
      <a class="al-ft-big" href="${esc(META.shop)}" target="_blank" rel="noopener">Netverslun</a>
    </div>
    <div class="al-ft-col">
      <h3 class="al-ft-lab">${esc(FOOTER.hoursLabel)}</h3>
      <dl class="al-ft-hours">
        ${META.hours.map(([d, t]) => `<div><dt>${esc(d)}</dt><dd>${esc(t)}</dd></div>`).join('')}
      </dl>
    </div>
    <div class="al-ft-col">
      <h3 class="al-ft-lab">${esc(FOOTER.contactLabel)}</h3>
      <a class="al-ft-big" href="tel:${esc(META.phoneHref)}">${esc(META.phone)}</a>
      <a class="al-ft-mail" href="mailto:${esc(META.email)}">${esc(META.email)}</a>
    </div>
    <div class="al-ft-col">
      <h3 class="al-ft-lab">${esc(FOOTER.socialLabel)}</h3>
      <ul class="al-ft-soc">
        ${META.social.map(([t, h]) => `<li><a href="${esc(h)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}
      </ul>
    </div>
  </div>

  <div class="al-ft-base">
    <ul class="al-ft-legal">
      ${META.legal.map(([t, h]) => `<li><a href="${esc(h)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}
    </ul>
    <p class="al-ft-credit">${esc(FOOTER.credit)}</p>
  </div>
</footer>

<script src="app.js" defer></script>
</body>
</html>
`;
}
