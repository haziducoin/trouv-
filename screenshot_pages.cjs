const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  
  const pages = ['/search', '/dashboard', '/app', '/recherche', '/login'];
  for (const p of pages) {
    await page.goto('http://localhost:3000' + p, { waitUntil: 'networkidle', timeout: 8000 }).catch(() => {});
    const url = page.url();
    await page.screenshot({ path: `/tmp/trouv_${p.replace('/', '')}.png` });
    console.log(p, '->', url);
  }
  await browser.close();
})();
