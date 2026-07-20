import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const svgPath = join(process.cwd(), 'public', 'ico.svg');
const svg = readFileSync(svgPath);
const sizes = [16, 32, 48, 72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const out = join(process.cwd(), 'public', `favicon-${size}x${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`Created ${size}x${size}`);
}

await sharp(svg).resize(192, 192).png().toFile(join(process.cwd(), 'public', 'apple-touch-icon.png'));
console.log('Created apple-touch-icon.png');
