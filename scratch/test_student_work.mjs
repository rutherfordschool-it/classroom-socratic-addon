import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { apiRouter } from '../server/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json());
app.use(express.static(publicDir));
app.use('/api', apiRouter);

const server = await new Promise((resolve) => {
  const s = app.listen(3355, '127.0.0.1', () => resolve(s));
});
console.log('Student test server running at http://127.0.0.1:3355');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOT_STUDENT = 'C:/Users/Lenovo ThinkPad/.gemini/antigravity-cli/brain/413efb06-696b-43a5-984c-06d813a052d4/student_wysiwyg_live.png';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });

const errors = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

console.log('Loading student-work.html...');
await page.goto('http://127.0.0.1:3355/student-work.html', { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => customElements.get('math-field'), { timeout: 20000 });
await sleep(1000);

// Close mode modal if open
const modeModal = await page.$('.mode-card[data-mode="step_by_step"]');
if (modeModal) {
  console.log('Selecting Step-by-Step mode in modal...');
  await modeModal.click();
  await sleep(500);
}

const hasChatEditor = await page.$('#studentChatEditorWrap .mte');
console.log('Student chat editor present:', !!hasChatEditor);

// Type math formula into student chat editor: "I think the first step is 2log3(6) = log3(36)"
await page.click('#studentChatEditorWrap .mte');
for (const ch of 'I think 2log3(6) = log3(36)') {
  await page.keyboard.type(ch);
  await sleep(35);
}
await sleep(400);

// Click send button
console.log('Clicking send message...');
await page.click('#btnSendMessage');
await sleep(1500);

const bubbleCount = await page.evaluate(() => document.querySelectorAll('.message-bubble').length);
console.log('Total chat bubbles:', bubbleCount);

await page.screenshot({ path: SHOT_STUDENT, fullPage: true });
console.log('Screenshot saved to:', SHOT_STUDENT);
console.log('Errors:', errors.length ? errors.join('\n') : 'none');

await page.close();
await browser.disconnect();
server.close();
console.log('Student test completed successfully!');
