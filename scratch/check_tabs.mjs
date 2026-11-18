import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
for (const p of pages) {
  console.log('TAB:', p.url());
}
await browser.disconnect();
process.exit(0);
