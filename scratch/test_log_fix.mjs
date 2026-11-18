import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));
const server = await new Promise(r => { const s = app.listen(3422, '127.0.0.1', () => r(s)); });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3422/attachment-discovery.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('--- TEST 1: Typing "log" then "3" then "(" then "6" ---');
await page.click('#promptEditorWrap .mte');
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
// Type "log"
for (const ch of 'log') {
  await page.keyboard.type(ch);
  await sleep(40);
}
await sleep(200);
let t1_state = await page.evaluate(() => {
  const mf = document.querySelector('#promptEditorWrap math-field');
  return { hasMf: !!mf, val: mf ? mf.value : null };
});
console.log('After typing "log":', t1_state);

// Type base "3"
await page.keyboard.type('3');
await sleep(150);
console.log('After typing base "3":', await page.evaluate(() => document.querySelector('#promptEditorWrap math-field').value));

// Type "(" to jump to argument
await page.keyboard.type('(');
await sleep(150);
// Type argument "6"
await page.keyboard.type('6');
await sleep(150);
console.log('After typing "(6)":', await page.evaluate(() => document.querySelector('#promptEditorWrap math-field').value));

// Press Space to exit
await page.keyboard.press('Space');
await sleep(100);
await page.keyboard.type('done');
await sleep(100);

let t1_final = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  return mte.innerText;
});
console.log('Test 1 final text:', t1_final);

console.log('\n--- TEST 2: Typing "log3" ---');
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of 'log3') {
  await page.keyboard.type(ch);
  await sleep(40);
}
await sleep(200);
let t2_state = await page.evaluate(() => {
  const mf = document.querySelector('#promptEditorWrap math-field');
  return { hasMf: !!mf, val: mf ? mf.value : null };
});
console.log('After typing "log3":', t2_state);

// Type argument "4"
await page.keyboard.type('4');
await sleep(100);
console.log('After typing "4":', await page.evaluate(() => document.querySelector('#promptEditorWrap math-field').value));

console.log('\n--- TEST 3: Typing "2log_3(6) - log_3(4)" ---');
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of '2log_3(6) - log_3(4)') {
  await page.keyboard.type(ch);
  await sleep(35);
}
await sleep(300);
let t3_state = await page.evaluate(() => {
  const mfs = [...document.querySelectorAll('#promptEditorWrap math-field')].map(m => m.value);
  return mfs;
});
console.log('Test 3 math fields:', t3_state);

await page.close();
await browser.disconnect();
server.close();
console.log('\nAll log tests completed!');
