// Render brand SVGs to PNG with Playwright's Chromium. Called by generate.py:
//   node render.cjs jobs.json   where jobs.json is [{svg, out, w, h}, ...]
// Each SVG is drawn as an <img> at exactly w x h CSS px on a transparent page.
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    const url = 'data:image/svg+xml;base64,' + fs.readFileSync(j.svg).toString('base64');
    await page.setViewportSize({ width: j.w, height: j.h });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img id="i" src="${url}" width="${j.w}" height="${j.h}" style="display:block"></body></html>`);
    await page.waitForFunction(() => document.getElementById('i').complete);
    await page.screenshot({ path: j.out, omitBackground: true, clip: { x: 0, y: 0, width: j.w, height: j.h } });
  }
  await browser.close();
})();
