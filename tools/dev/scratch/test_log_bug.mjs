import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));
const server = await new Promise(r => { const s = app.listen(3399, '127.0.0.1', () => r(s)); });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3399/attachment-discovery.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Test 1: Typing "log_3(6)"
await page.click('#promptEditorWrap .mte');
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
for (const ch of 'log_3(6)') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

let r1 = await page.evaluate(() => {
  const mf = document.querySelector('#promptEditorWrap math-field');
  return mf ? mf.value : 'no mf';
});
console.log('Result of typing "log_3(6)":', r1);

// Test 2: Typing "log" then space then "3"
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of 'log 3') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

let r2 = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  return mte.innerText;
});
console.log('Result of typing "log 3":', r2);

// Test 3: Typing "log3"
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of 'log3') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

let r3 = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  return mte.innerText;
});
console.log('Result of typing "log3":', r3);

await page.close();
await browser.disconnect();
server.close();
