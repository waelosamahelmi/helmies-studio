import sharp from 'sharp';
import { join } from 'path';

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0A0A0F"/>
      <stop offset="1" stop-color="#1A0A14"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C41053"/>
      <stop offset="0.5" stop-color="#FF1B6B"/>
      <stop offset="1" stop-color="#FFC4DD"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="580" width="1200" height="4" fill="url(#accent)"/>
  <rect x="0" y="600" width="1200" height="30" fill="#FF1B6B" opacity="0.08"/>
  <circle cx="600" cy="260" r="100" fill="none" stroke="url(#accent)" stroke-width="2" opacity="0.3"/>
  <circle cx="600" cy="260" r="60" fill="none" stroke="url(#accent)" stroke-width="1.5" opacity="0.2"/>
  <circle cx="600" cy="260" r="30" fill="url(#accent)" opacity="0.6"/>
  <text x="600" y="430" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="800" fill="#F2F2F7" letter-spacing="-2">Helmies Studio</text>
  <text x="600" y="490" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#FF1B6B" letter-spacing="6" font-weight="600">200+ AI MODELS</text>
  <text x="600" y="540" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="#F2F2F7" opacity="0.6">Image · Video · Lip-Sync · No Filters</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile(join(process.cwd(), 'public', 'og-image.png'));
console.log('Created og-image.png (1200x630)');

await sharp(Buffer.from(ogSvg)).resize(600, 315).png().toFile(join(process.cwd(), 'public', 'og-image-square.png'));
console.log('Created og-image-square.png (600x315)');
