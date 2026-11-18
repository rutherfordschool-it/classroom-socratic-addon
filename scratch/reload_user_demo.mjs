import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
const demo = pages.find(p => p.url().includes('wysiwyg-demo.html'));
if (demo) {
  await demo.evaluate(() => location.reload());
  console.log('Location.reload() triggered on user tab');
} else {
  console.log('Demo page not found');
}
await browser.disconnect();
