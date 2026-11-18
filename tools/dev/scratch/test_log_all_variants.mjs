import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));
const server = await new Promise(r => { const s = app.listen(3411, '127.0.0.1', () => r(s)); });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3411/attachment-discovery.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('Testing variants...');

// Let's test the MathLive API behavior
const test1 = await page.evaluate(() => {
  const mf = document.createElement('math-field');
  document.body.appendChild(mf);
  mf.focus();
  mf.insert('\\log_{#?}\\left(#?\\right)', { selectionMode: 'placeholder', focus: true });
  return {
    val: mf.value,
    pos: mf.position
  };
});
console.log('Insert \\log_{#?}\\left(#?\\right):', test1);

await page.close();
await browser.disconnect();
server.close();
