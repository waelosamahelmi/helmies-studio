import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const heroBg = join(process.cwd(), 'public', 'assets', 'warrior_girl_e29532086b-40.webp');
const iconSvg = readFileSync(join(process.cwd(), 'public', 'ico.svg'));

// Render icon to PNG buffer at 80x80
const iconPng = await sharp(iconSvg).resize(80, 80).png().toBuffer();
const iconPngSm = await sharp(iconSvg).resize(60, 60).png().toBuffer();

// 1200x630 OG
const hero = await sharp(heroBg).resize(1200, 630, { fit: 'cover', position: 'center' }).toBuffer();

const overlay1200 = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
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
  <text x="175" y="500" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="68" font-weight="700" fill="#F2F2F7" letter-spacing="-1">Studio</text>
  <rect x="80" y="515" width="100" height="3" fill="url(#accent)"/>
  <text x="80" y="555" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="18" fill="#F2F2F7" opacity="0.55" letter-spacing="5" font-weight="400">200+ AI MODELS · IMAGE · VIDEO · LIP-SYNC</text>
</svg>`;

await sharp(hero)
  .composite([
    { input: iconPng, top: 412, left: 80 },
    { input: Buffer.from(overlay1200), top: 0, left: 0 },
  ])
  .png()
  .toFile(join(process.cwd(), 'public', 'og-image.png'));
console.log('Created og-image.png (1200x630)');

// 800x418 Twitter
const heroTw = await sharp(heroBg).resize(800, 418, { fit: 'cover', position: 'center' }).toBuffer();

const overlay800 = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="418" viewBox="0 0 800 418">
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
  <text x="120" y="340" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="50" font-weight="700" fill="#F2F2F7" letter-spacing="-1">Studio</text>
  <rect x="50" y="350" width="80" height="3" fill="url(#accent)"/>
  <text x="50" y="380" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="14" fill="#F2F2F7" opacity="0.55" letter-spacing="4" font-weight="400">200+ AI MODELS · IMAGE · VIDEO · LIP-SYNC</text>
</svg>`;

await sharp(heroTw)
  .composite([
    { input: iconPngSm, top: 280, left: 50 },
    { input: Buffer.from(overlay800), top: 0, left: 0 },
  ])
  .png()
  .toFile(join(process.cwd(), 'public', 'og-image-twitter.png'));
console.log('Created og-image-twitter.png (800x418)');
