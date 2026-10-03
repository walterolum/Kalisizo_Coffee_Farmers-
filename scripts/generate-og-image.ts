/**
 * Generates `public/og.png`, the social share preview.
 *
 * Every page inherits this image from the root layout's `openGraph.images`, so
 * while it was missing, every share link on the site — Facebook, LinkedIn,
 * Slack, iMessage, WhatsApp — rendered a broken or empty card. Nothing 404'd
 * visibly, because the reference was to a path rather than a broken link in the
 * markup, so the failure only appeared on someone else's platform.
 *
 * Generated from a script rather than committed as an opaque binary so the brand
 * colours are traceable to `globals.css` and the card can be regenerated when the
 * palette changes. It is a placeholder built from the site's own palette and
 * typography hierarchy; replace it with a designed asset by dropping a file at
 * this path and deleting this script.
 *
 *   npm run og:image
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Copied from the `--color-*` custom properties in `src/app/globals.css`.
 *
 * Duplicated rather than imported because globals.css cannot be read at build
 * time by a Node script, and a stale hard-coded value in a generator is a far
 * smaller problem than a build that depends on Tailwind being processed first.
 *
 * The colour contract is the same one the stylesheet documents: `goldLight` is
 * the only gold allowed to carry text (the raw `gold` reaches just 4.4:1 on
 * `forest`, under the 4.5:1 needed here), and `brand` appears solely as a
 * low-opacity decorative bloom.
 */
const PALETTE = {
  forest: "#2b4a2a",
  forestDeep: "#1f3a1f",
  brand: "#689d4b",
  gold: "#d9a441",
  goldLight: "#e8c06a",
  cream: "#faf6ee",
} as const;

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Text is rendered with generic families rather than Fraunces/Inter.
 *
 * The site loads those via `next/font`, which produces woff2 files only during a
 * Next.js build; a standalone script has no access to them, and librsvg will not
 * resolve them from a file path either. Naming the families keeps the intended
 * serif/sans contrast, which is the part that carries the brand, and lets the
 * platform substitute sensible fallbacks.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${PALETTE.forest}"/>
      <stop offset="100%" stop-color="${PALETTE.forestDeep}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${PALETTE.gold}"/>
      <stop offset="100%" stop-color="${PALETTE.goldLight}"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- Coffee-cherry motif: a loose scatter suggesting fruit, kept low-contrast so
       it reads as texture behind the text rather than competing with it. The two
       clusters use brand green and harvest gold, mirroring the pair of colour
       blooms behind the on-site hero. -->
  <g fill="${PALETTE.brand}" opacity="0.18">
    <circle cx="1046" cy="150" r="86"/>
    <circle cx="960" cy="252" r="54"/>
    <circle cx="1128" cy="278" r="38"/>
    <circle cx="1092" cy="96" r="26"/>
  </g>
  <g fill="${PALETTE.gold}" opacity="0.10">
    <circle cx="140" cy="540" r="70"/>
    <circle cx="252" cy="600" r="44"/>
  </g>

  <!-- Accent rule, echoing the gold underline treatment used on headings. -->
  <rect x="80" y="196" width="104" height="6" rx="3" fill="url(#accent)"/>

  <text x="80" y="150" font-family="Georgia, 'Times New Roman', serif" font-size="72"
        font-weight="700" fill="${PALETTE.cream}" letter-spacing="-0.5">Kalisizo Coffee</text>

  <text x="80" y="290" font-family="Helvetica, Arial, sans-serif" font-size="38"
        font-weight="600" fill="${PALETTE.goldLight}">Farmers Cooperative Society Ltd</text>

  <text x="80" y="366" font-family="Helvetica, Arial, sans-serif" font-size="27"
        fill="${PALETTE.cream}" opacity="0.82">Quality coffee, sustainable agriculture and</text>
  <text x="80" y="406" font-family="Helvetica, Arial, sans-serif" font-size="27"
        fill="${PALETTE.cream}" opacity="0.82">reliable financial services in Kyotera District.</text>

  <line x1="80" y1="474" x2="${WIDTH - 80}" y2="474" stroke="${PALETTE.gold}" stroke-opacity="0.28" stroke-width="1"/>

  <text x="80" y="524" font-family="Helvetica, Arial, sans-serif" font-size="24"
        font-weight="600" fill="${PALETTE.goldLight}">UGANDA</text>
  <text x="${WIDTH - 80}" y="524" text-anchor="end" font-family="Helvetica, Arial, sans-serif"
        font-size="24" fill="${PALETTE.cream}" opacity="0.8">kalisizo.coop</text>
</svg>`;

async function main() {
  const output = resolve(process.cwd(), "public", "og.png");

  const png = await sharp(Buffer.from(SVG), { density: 144 })
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, png);

  const meta = await sharp(png).metadata();
  console.log(`Wrote ${output}`);
  console.log(`  ${meta.width}x${meta.height} ${meta.format} ${(png.length / 1024).toFixed(1)} kB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});