import sharp from 'sharp';
import { join } from 'path';

const heroBg = join(process.cwd(), 'public', 'assets', 'warrior_girl_e29532086b-40.webp');

// 1200x630 OG image
const heroResized = await sharp(heroBg)
  .resize(1200, 630, { fit: 'cover', position: 'center' })
  .toBuffer();

const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="side" x1="0" y1="0" x2="0.4" y2="0">
      <stop offset="0" stop-color="#0A0A0F" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#0A0A0F" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="0.65" x2="0" y2="1">
      <stop offset="0" stop-color="#0A0A0F" stop-opacity="0"/>
      <stop offset="1" stop-color="#0A0A0F" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C41053"/>
      <stop offset="0.5" stop-color="#FF1B6B"/>
      <stop offset="1" stop-color="#FFC4DD"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#side)"/>
  <rect width="1200" height="630" fill="url(#bottom)"/>
  <rect x="80" y="440" width="120" height="3" fill="url(#accent)"/>
  <text x="80" y="490" font-family="system-ui, -apple-system, Helvetica Neue, sans-serif" font-size="72" font-weight="800" fill="#F2F2F7" letter-spacing="-3">Helmies</text>
  <text x="80" y="540" font-family="system-ui, -apple-system, Helvetica Neue, sans-serif" font-size="72" font-weight="800" fill="#FF1B6B" letter-spacing="-3">Studio</text>
  <text x="80" y="580" font-family="system-ui, -apple-system, Helvetica Neue, sans-serif" font-size="20" fill="#F2F2F7" opacity="0.6" letter-spacing="4">200+ AI MODELS · IMAGE · VIDEO · LIP-SYNC</text>
</svg>`;

await sharp(heroResized)
  .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
  .png()
  .toFile(join(process.cwd(), 'public', 'og-image.png'));
console.log('Created og-image.png (1200x630)');

// Twitter 800x418
const heroTw = await sharp(heroBg)
  .resize(800, 418, { fit: 'cover', position: 'center' })
  .toBuffer();

const twSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="418" viewBox="0 0 800 418">
  <defs>
    <linearGradient id="side" x1="0" y1="0" x2="0.4" y2="0">
      <stop offset="0" stop-color="#0A0A0F" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#0A0A0F" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="0.6" x2="0" y2="1">
      <stop offset="0" stop-color="#0A0A0F" stop-opacity="0"/>
      <stop offset="1" stop-color="#0A0A0F" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C41053"/>
      <stop offset="0.5" stop-color="#FF1B6B"/>
      <stop offset="1" stop-color="#FFC4DD"/>
    </linearGradient>
  </defs>
  <rect width="800" height="418" fill="url(#side)"/>
  <rect width="800" height="418" fill="url(#bottom)"/>
  <rect x="50" y="290" width="80" height="3" fill="url(#accent)"/>
  <text x="50" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="#F2F2F7" letter-spacing="-2">Helmies</text>
  <text x="50" y="370" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="#FF1B6B" letter-spacing="-2">Studio</text>
  <text x="50" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#F2F2F7" opacity="0.6" letter-spacing="3">200+ AI MODELS · IMAGE · VIDEO · LIP-SYNC</text>
</svg>`;

await sharp(heroTw)
  .composite([{ input: Buffer.from(twSvg), top: 0, left: 0 }])
  .png()
  .toFile(join(process.cwd(), 'public', 'og-image-twitter.png'));
console.log('Created og-image-twitter.png (800x418)');
