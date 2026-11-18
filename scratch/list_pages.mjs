import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
console.log('Open pages in Chrome:');
for (const p of pages) {
  console.log(' - Title:', await p.title(), '| URL:', p.url());
}
await browser.disconnect();
