/**
 * Trophē PWA Icon Generator
 * Generates all required PWA icons from an SVG source using sharp.
 * Run: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const iconsDir = join(projectRoot, 'public', 'icons');

mkdirSync(iconsDir, { recursive: true });

// Premium dark + gold SVG icon — τ (tau) mark on #0a0a0a
// The τ is the first letter of τροφή (trophē) — the brand mark
const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background: premium near-black -->
  <rect width="512" height="512" rx="96" fill="#0a0a0a"/>

  <!-- Subtle radial glow behind mark -->
  <radialGradient id="glow" cx="50%" cy="50%" r="45%">
    <stop offset="0%" stop-color="#D4A853" stop-opacity="0.12"/>
    <stop offset="100%" stop-color="#D4A853" stop-opacity="0"/>
  </radialGradient>
  <rect width="512" height="512" rx="96" fill="url(#glow)"/>

  <!-- Gold ring accent — premium bezel -->
  <rect x="20" y="20" width="472" height="472" rx="80" fill="none" stroke="#D4A853" stroke-width="1.5" stroke-opacity="0.18"/>

  <!-- τ (tau) letterform — the Trophē brand mark -->
  <!-- Horizontal bar of τ -->
  <rect x="128" y="158" width="256" height="32" rx="16" fill="#D4A853"/>
  <!-- Vertical stem of τ (centered) -->
  <rect x="224" y="158" width="64" height="212" rx="16" fill="#D4A853"/>

  <!-- Micro epsilon — tiny decorative tick at baseline, signals precision -->
  <rect x="224" y="346" width="40" height="6" rx="3" fill="#D4A853" fill-opacity="0.45"/>
</svg>`;

// Maskable variant: 20% safe-zone padding (icon fills only inner 60%)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Solid background — maskable icons must fill the entire area -->
  <rect width="512" height="512" fill="#0a0a0a"/>

  <!-- Subtle glow -->
  <radialGradient id="glow" cx="50%" cy="50%" r="40%">
    <stop offset="0%" stop-color="#D4A853" stop-opacity="0.10"/>
    <stop offset="100%" stop-color="#D4A853" stop-opacity="0"/>
  </radialGradient>
  <rect width="512" height="512" fill="url(#glow)"/>

  <!-- τ mark scaled to 60% and centered (20% padding each side = maskable safe zone) -->
  <!-- Horizontal bar of τ: original 128-384 → scaled to 179-333 -->
  <rect x="166" y="182" width="180" height="22" rx="11" fill="#D4A853"/>
  <!-- Vertical stem: original 224-288 centered → 234-278 at 60% -->
  <rect x="234" y="182" width="44" height="148" rx="11" fill="#D4A853"/>

  <!-- Baseline tick -->
  <rect x="234" y="306" width="28" height="4" rx="2" fill="#D4A853" fill-opacity="0.4"/>
</svg>`;

// Monochrome variant: white on transparent (used for notification icons)
const monochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="black"/>
  <!-- τ mark in white -->
  <rect x="128" y="158" width="256" height="32" rx="16" fill="white"/>
  <rect x="224" y="158" width="64" height="212" rx="16" fill="white"/>
  <rect x="224" y="346" width="40" height="6" rx="3" fill="white" fill-opacity="0.5"/>
</svg>`;

async function svgToPng(svgString, outputPath, size) {
  const svgBuffer = Buffer.from(svgString);
  await sharp(svgBuffer)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.log(`✓ ${outputPath} (${size}x${size})`);
}

async function main() {
  console.log('Generating Trophē PWA icons...\n');

  // Standard icons (any purpose)
  await svgToPng(baseSvg, join(iconsDir, 'icon-192.png'), 192);
  await svgToPng(baseSvg, join(iconsDir, 'icon-512.png'), 512);

  // Maskable (safe-zone padding)
  await svgToPng(maskableSvg, join(iconsDir, 'icon-512-maskable.png'), 512);

  // Monochrome (for notification badges)
  await svgToPng(monochromeSvg, join(iconsDir, 'icon-monochrome.png'), 512);

  // Apple Touch Icon (180x180, must have opaque background)
  await svgToPng(baseSvg, join(join(projectRoot, 'public'), 'apple-touch-icon.png'), 180);

  console.log('\nAll icons generated successfully.');
  console.log('Files in public/icons/:');
  console.log('  icon-192.png, icon-512.png, icon-512-maskable.png, icon-monochrome.png');
  console.log('  public/apple-touch-icon.png');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
