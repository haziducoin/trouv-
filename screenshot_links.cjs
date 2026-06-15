const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/trouv_full.png', fullPage: true });
  const links = await page.evaluate(() => 
    Array.from(document.querySelectorAll('a')).map(e => ({ href: e.href, text: e.innerText.trim() }))
  );
  console.log(JSON.stringify(links, null, 2));
  await browser.close();
})();
