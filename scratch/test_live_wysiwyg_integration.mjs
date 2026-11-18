import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { apiRouter } from '../server/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

// Spin up a test express server
const app = express();
app.use(express.json());
app.use(express.static(publicDir));
app.use('/api', apiRouter);

const server = await new Promise((resolve) => {
  const s = app.listen(3344, '127.0.0.1', () => resolve(s));
});
console.log('Test server running at http://127.0.0.1:3344');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOT_DISCOVERY = 'C:/Users/Lenovo ThinkPad/.gemini/antigravity-cli/brain/413efb06-696b-43a5-984c-06d813a052d4/discovery_wysiwyg_live.png';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1100 });

const errors = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

console.log('Loading http://127.0.0.1:3344/attachment-discovery.html...');
await page.goto('http://127.0.0.1:3344/attachment-discovery.html', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => customElements.get('math-field'), { timeout: 20000 });
await sleep(1000);

const hasPromptWrap = await page.$('#promptEditorWrap .mte');
const hasWrapA = await page.$('#exProblemWrapA .mte');
const hasWrapB = await page.$('#exProblemWrapB .mte');
const hasWrapC = await page.$('#exProblemWrapC .mte');
const hasAnsA = await page.$('#exAnswerA');
const hasAnsB = await page.$('#exAnswerB');
const hasAnsC = await page.$('#exAnswerC');

console.log('Elements present:', {
  prompt: !!hasPromptWrap,
  wrapA: !!hasWrapA,
  wrapB: !!hasWrapB,
  wrapC: !!hasWrapC,
  ansA: !!hasAnsA,
  ansB: !!hasAnsB,
  ansC: !!hasAnsC
});

// Check initial prompt value from default template/curriculum
const promptVal = await page.evaluate(() => {
  const pWrap = document.querySelector('#promptEditorWrap .mte');
  return pWrap ? pWrap.innerText : '';
});
console.log('Prompt editor initial text:', promptVal.slice(0, 100));

// Type in Level A editor: "Simplify 5/6 + x^2 done"
await page.click('#exProblemWrapA .mte');
for (const ch of 'Simplify 5/6 + x^2 done') {
  await page.keyboard.type(ch);
  await sleep(35);
}
await sleep(400);

// Set answer in exAnswerA
await page.click('#exAnswerA');
await page.keyboard.type('log_2(8) = 3', { delay: 40 });
await sleep(400);

const valAnsA = await page.evaluate(() => document.getElementById('exAnswerA').value);
console.log('Target Answer A value:', valAnsA);

await page.screenshot({ path: SHOT_DISCOVERY, fullPage: true });
console.log('Screenshot saved to:', SHOT_DISCOVERY);
console.log('Errors:', errors.length ? errors.join('\n') : 'none');

await page.close();
await browser.disconnect();
server.close();
console.log('Discovery test completed successfully!');
