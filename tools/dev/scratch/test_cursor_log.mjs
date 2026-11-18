import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));
const server = await new Promise(r => { const s = app.listen(3377, '127.0.0.1', () => r(s)); });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3377/attachment-discovery.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

await page.click('#promptEditorWrap .mte');
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });

// Type "log" then "_"
for (const ch of 'log_') {
  await page.keyboard.type(ch);
  await sleep(100);
}
await sleep(300);

let info = await page.evaluate(() => {
  const mf = document.querySelector('#promptEditorWrap math-field');
  if (!mf) return { error: 'no mf' };
  return {
    value: mf.value,
    position: mf.position,
    selection: mf.selection,
    activeElement: document.activeElement.tagName
  };
});
console.log('After log_:', info);

// Now type "2"
await page.keyboard.type('2');
await sleep(300);

info = await page.evaluate(() => {
  const mf = document.querySelector('#promptEditorWrap math-field');
  return {
    value: mf ? mf.value : null
  };
});
console.log('After typing 2:', info);

await page.close();
await browser.disconnect();
server.close();
