import puppeteer from 'puppeteer-core';

const FILE_URL = 'file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html';
const SHOT = 'C:/Users/Lenovo ThinkPad/.gemini/antigravity-cli/brain/413efb06-696b-43a5-984c-06d813a052d4/wysiwyg_demo_live.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

await page.goto(FILE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte'), { timeout: 20000 });
await sleep(800);

const read = () => page.evaluate(() => JSON.parse(document.getElementById('debugOut').textContent));
const type = async (s) => { for (const ch of s) { await page.keyboard.type(ch); await sleep(45); } };

console.log('Initial teacher prompt:', (await read()).prompt);

// Clear teacher prompt and type freely
await page.evaluate(() => { const r = document.querySelector('#teacherPromptWrap .mte'); r.innerHTML = ''; r.focus(); });
await type('Compute 5/6= 7 then x^2 + 1 and 2log3(6) - log3(4) done');
await sleep(300);
console.log('Typed result:', (await read()).prompt);

// Level B: put caret at end, press ArrowLeft to enter formula from text, then Backspace etc.
await page.evaluate(() => {
  const r = document.querySelector('#levelBWrap .mte'); r.focus();
  const range = document.createRange(); range.selectNodeContents(r); range.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(range);
});
await page.keyboard.press('ArrowLeft');
await sleep(200);
console.log('Active after ArrowLeft:', await page.evaluate(() => document.activeElement.tagName));
await type('+1');
await page.keyboard.press('ArrowRight');
await sleep(200);
await type(' ok');
console.log('Level B:', (await read()).levelB.problem);

// Student: sqrt + <= replacement
await page.click('#studentInputWrap .mte');
await type('sqrt');
await type('9');
await page.keyboard.press(' ');
await type('<= 4');
await sleep(200);
console.log('Student draft:', (await read()).studentDraft);

await page.screenshot({ path: SHOT, fullPage: true });
console.log('Errors:', errors.length ? errors.join('\n') : 'none');
await page.close();
await browser.disconnect();
