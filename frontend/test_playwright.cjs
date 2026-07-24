const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  await page.goto('http://172.17.0.2:5173/admin', { waitUntil: 'networkidle' }).catch(e => console.log(e));
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
