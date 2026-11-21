// Draws the icon and launch marks from the SVGs in this folder:
//   node art/render.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const out = path.join(__dirname, '..', 'assets', 'images');
const jobs = [
  ['icon.svg', 'icon.png', 1024, false],
  ['icon.svg', 'favicon.png', 96, false],
  ['splash-mark.svg', 'splash-icon.png', 480, true],
  ['splash-mark-dark.svg', 'splash-icon-dark.png', 480, true],
];

(async () => {
  const browser = await chromium.launch();
  for (const [src, dest, size, clear] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.join(__dirname, src), 'utf8');
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`);
    await page.screenshot({ path: path.join(out, dest), omitBackground: clear });
    await page.close();
  }
  await browser.close();
  console.log('Drew', jobs.map((j) => j[1]).join(', '));
})();
