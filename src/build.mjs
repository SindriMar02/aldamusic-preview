import { mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from './template.mjs';

/* A spec redesign published under a real business's brand sits on a URL that is not
   theirs. Without noindex + a canonical pointing at the preview itself, a full-fidelity
   mockup can be indexed as duplicate content and damage the prospect's own search
   presence, which is the opposite of the pitch. */
const PREVIEW_ORIGIN = process.env.PREVIEW_ORIGIN || '';
const isPreview = Boolean(PREVIEW_ORIGIN);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'public'), dist, { recursive: true });

/* Their own 8-bit mark, on the vinyl ground. A relative href, so the client's tab can
   never inherit another origin's icon. */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" fill="#0A0A0B"/>
<g transform="translate(14.5 15) scale(1.0)">
<path fill="#DF3F5C" fill-rule="evenodd" d="M14.05 3.38V6.75h-7.02v6.67l-3.38.13-3.38.14L.14 23.64 0 33.59h7.03v-6.71h7.02v-6.71h7.01v6.71h7.02v6.71h6.51V13.46h-6.44l-.15-3.23-.15-3.24-3.36-.14-3.36-.14-.15-3.22-.14-3.21-3.39-.14L14.05 0z"/>
</g>
</svg>`;
await writeFile(join(dist, 'favicon.svg'), favicon);

await writeFile(join(dist, 'index.html'), render({ noindex: isPreview, previewOrigin: PREVIEW_ORIGIN }));
if (isPreview) await writeFile(join(dist, '.nojekyll'), '');

await writeFile(
  join(dist, 'robots.txt'),
  isPreview ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n'
);

console.log(`built dist/index.html${isPreview ? ` [preview: noindex, ${PREVIEW_ORIGIN}]` : ''}`);
