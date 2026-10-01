/**
 * Verifies public/og.png actually contains a rendered share card.
 *
 * The failure this guards is specific and quiet: librsvg silently drops a font
 * family it cannot resolve, or text set in a size/position that falls outside
 * the viewBox. Either way sharp still writes a valid 1200x630 PNG — it is just a
 * rectangle of background — and the share card looks fine to every check that
 * does not measure pixels.
 *
 * So this measures ink density in the regions where text is expected, and
 * compares them against a region that is deliberately empty. An all-background
 * image, or one missing its text, fails.
 */
import sharp from "sharp";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

type Region = { name: string; left: number; top: number; width: number; height: number };

const IMAGE = resolve(process.cwd(), "public", "og.png");

/**
 * Regions matching the SVG's text positions, plus a control.
 *
 * The control is the band between the accent rule and the subtitle, which the
 * SVG leaves empty. It establishes what "no ink" measures for this image, so the
 * thresholds below are relative rather than guessed.
 */
const REGIONS: Region[] = [
  { name: "title (y=150)", left: 80, top: 100, width: 700, height: 70 },
  { name: "subtitle (y=290)", left: 80, top: 258, width: 800, height: 50 },
  { name: "body line 1 (y=366)", left: 80, top: 340, width: 760, height: 40 },
  { name: "body line 2 (y=406)", left: 80, top: 380, width: 760, height: 40 },
  { name: "footer (y=524)", left: 80, top: 500, width: 1040, height: 44 },
  { name: "CONTROL empty band", left: 80, top: 440, width: 760, height: 24 },
];

/**
 * Fraction of pixels differing noticeably from the crop's own median colour.
 *
 * A crop of solid background scores ~0. A crop with text scores high, because
 * antialiased glyph edges alone produce a wide spread of values. Comparing
 * against the median rather than a fixed colour keeps this independent of the
 * palette.
 */
async function inkFraction(file: string, region: Region): Promise<number> {
  const { data, info } = await sharp(file)
    .extract(region)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = info.width * info.height;

  // Per-channel medians, so the background is whatever it is.
  const samples: number[][] = Array.from({ length: channels }, () => []);
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < channels; c++) samples[c].push(data[i * channels + c]);
  }
  const medians = samples.map((s) => {
    s.sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  });

  let off = 0;
  for (let i = 0; i < pixels; i++) {
    let differs = false;
    for (let c = 0; c < channels; c++) {
      if (Math.abs(data[i * channels + c] - medians[c]) > 24) {
        differs = true;
        break;
      }
    }
    if (differs) off++;
  }

  return off / pixels;
}

async function main() {
  if (!existsSync(IMAGE)) {
    console.error(`Missing ${IMAGE}. Run: npm run og:image`);
    process.exit(1);
  }

  const meta = await sharp(IMAGE).metadata();
  const failures: string[] = [];

  console.log(`Open Graph image: ${IMAGE}`);
  console.log(`  ${meta.width}x${meta.height} ${meta.format} ${meta.channels} channels`);
  console.log("");

  // 1200x630 is the size the root layout advertises. Anything else and the card
  // is letterboxed or cropped by every platform that renders it.
  if (meta.width !== 1200 || meta.height !== 630) {
    failures.push(`expected 1200x630, got ${meta.width}x${meta.height}`);
    console.log(`  [FAIL] dimensions - expected 1200x630, got ${meta.width}x${meta.height}`);
  } else {
    console.log(`  [pass] dimensions match the metadata in layout.tsx`);
  }

  const scores: Array<{ name: string; score: number }> = [];
  for (const region of REGIONS) {
    scores.push({ name: region.name, score: await inkFraction(IMAGE, region) });
  }

  const control = scores.find((s) => s.name.startsWith("CONTROL"))?.score ?? 0;

  console.log("");
  for (const { name, score } of scores) {
    const isControl = name.startsWith("CONTROL");
    const pct = (score * 100).toFixed(1).padStart(5);
    console.log(`  ${isControl ? "ctrl" : "text"}  ${pct}%  ${name}`);
  }

  console.log("");

  // The empty band must stay near zero. If it does not, the background is not
  // flat and the comparison below would be meaningless.
  if (control > 0.02) {
    failures.push(
      `control band is not empty (${(control * 100).toFixed(1)}% ink); the measurement is unreliable`
    );
    console.log(`  [FAIL] control band is not empty - measurement unreliable`);
  }

  for (const { name, score } of scores) {
    if (name.startsWith("CONTROL")) continue;
    // Well above the control, but not so high it indicates the crop is solid
    // colour rather than text over background.
    if (score <= Math.max(control * 3, 0.005)) {
      failures.push(`${name} has no detectable ink`);
      console.log(`  [FAIL] ${name} - no detectable ink (${(score * 100).toFixed(2)}%)`);
    } else if (score > 0.75) {
      failures.push(`${name} is solid, not text`);
      console.log(`  [FAIL] ${name} - solid fill, expected text`);
    } else {
      console.log(`  [pass] ${name}`);
    }
  }

  console.log("");
  if (failures.length) {
    console.error(`Share card verification FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }

  console.log("Share card verified: dimensions correct and every text region rendered.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});