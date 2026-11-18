import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));
const server = await new Promise(r => { const s = app.listen(3388, '127.0.0.1', () => r(s)); });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3388/attachment-discovery.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

const res = await page.evaluate(() => {
  const mf = document.createElement('math-field');
  document.body.appendChild(mf);
  mf.focus();
  mf.insert('\\log_{#?}\\left(#?\\right)', { selectionMode: 'placeholder', focus: true });
  return {
    val: mf.value,
    pos: mf.position,
    sel: mf.selection
  };
});
console.log('mf insert placeholder result:', res);

// Now type "3"
await page.keyboard.type('3');
await sleep(100);

let after3 = await page.evaluate(() => {
  const all = document.querySelectorAll('math-field');
  const mf = all[all.length - 1];
  return mf.value;
});
console.log('after typing 3:', after3);

// Now press Tab
await page.keyboard.press('Tab');
await sleep(100);
// Type 6
await page.keyboard.type('6');
await sleep(100);

let after6 = await page.evaluate(() => {
  const all = document.querySelectorAll('math-field');
  const mf = all[all.length - 1];
  return mf.value;
});
console.log('after typing 6:', after6);

await page.close();
await browser.disconnect();
server.close();
