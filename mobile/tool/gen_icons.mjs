/**
 * 브랜드 아이콘 생성 (Android mipmap / iOS AppIcon / 관리자 파비콘)
 * 실행: node tool/gen_icons.mjs
 */
import sharp from '../../node_modules/sharp/lib/index.js';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const root = resolve(process.cwd());
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF8A65"/>
      <stop offset="1" stop-color="#E2543A"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <path d="M262 300h500c44 0 80 36 80 80v236c0 44-36 80-80 80H540l-150 128V696h-128c-44 0-80-36-80-80V380c0-44 36-80 80-80z" fill="#FFFFFF"/>
  <circle cx="418" cy="498" r="34" fill="#FF6B4A"/>
  <circle cx="606" cy="498" r="34" fill="#FF6B4A"/>
  <rect x="418" y="580" width="188" height="26" rx="13" fill="#FFD166"/>
</svg>`;

const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <path d="M300 330h424c40 0 72 32 72 72v196c0 40-32 72-72 72H560l-128 110V670h-132c-40 0-72-32-72-72V402c0-40 32-72 72-72z" fill="#FFFFFF"/>
  <circle cx="432" cy="502" r="30" fill="#FF6B4A"/>
  <circle cx="592" cy="502" r="30" fill="#FF6B4A"/>
</svg>`;

async function write(path, size, svgSource) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  await sharp(Buffer.from(svgSource)).resize(size, size).png().toFile(target);
  console.log(`  ${path} (${size}px)`);
}

const android = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ios = {
  'Icon-App-20x20@2x.png': 40,
  'Icon-App-20x20@3x.png': 60,
  'Icon-App-29x29@2x.png': 58,
  'Icon-App-29x29@3x.png': 87,
  'Icon-App-40x40@2x.png': 80,
  'Icon-App-40x40@3x.png': 120,
  'Icon-App-60x60@2x.png': 120,
  'Icon-App-60x60@3x.png': 180,
  'Icon-App-76x76@2x.png': 152,
  'Icon-App-83.5x83.5@2x.png': 167,
  'Icon-App-1024x1024.png': 1024,
};

console.log('[icons] 생성 시작');
await write('assets/brand/app_icon.png', 1024, svg(1024));
await write('assets/brand/app_icon_foreground.png', 1024, foreground);
await write('assets/brand/favicon.png', 64, svg(64));
for (const [density, size] of Object.entries(android)) {
  await write(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size, svg(size));
}
for (const [name, size] of Object.entries(ios)) {
  await write(`ios/Runner/Assets.xcassets/AppIcon.appiconset/${name}`, size, svg(size));
}
await write('../admin/public/favicon.png', 64, svg(64));
await write('../admin/public/app-icon.png', 512, svg(512));
console.log('[icons] 완료');
