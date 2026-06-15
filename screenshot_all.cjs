const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  // Landing page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/view_landing.png' });
  console.log('landing ok');

  // Demo / SearchPage
  await page.goto('http://localhost:3000?demo', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/view_search.png' });
  console.log('search ok');

  // Success page
  await page.goto('http://localhost:3000?success&plan=agence', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/view_success.png' });
  console.log('success ok');

  await browser.close();
})();
