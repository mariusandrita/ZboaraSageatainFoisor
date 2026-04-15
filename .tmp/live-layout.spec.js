const { test } = require('playwright/test');

test('capture live layout', async ({ page }) => {
  await page.goto('http://192.168.0.69/tv', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body && document.body.innerText.includes('Scor live'), { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/Users/mariusandrita/Dockers/DartsLeague/.tmp/live-layout-check-scripted.png' });
});
