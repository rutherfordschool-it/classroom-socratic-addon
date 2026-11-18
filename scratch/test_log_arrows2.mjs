import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const val = () => page.evaluate(() => document.querySelector('#teacherPromptWrap math-field')?.value);
const fresh = async (s) => {
  await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
  for (const ch of s) { await page.keyboard.type(ch); await sleep(60); }
  await sleep(200);
};
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(90); } };

// 1) log36, two ← from argument start -> base? (1 Left = before 6, 1 more = base end)
await fresh('log36');
console.log('typed            ', await val());
await key('ArrowLeft', 2);                 // before "6", then base end (junction skipped)
await key('Backspace'); await page.keyboard.type('5'); await sleep(200);
console.log('base 3 -> 5      ', await val());
await key('ArrowRight');                   // base end -> argument start
await page.keyboard.type('7'); await sleep(200);
console.log('-> then type 7  ', await val());

// 2) change base to 10 using back arrows
await fresh('log36');
await key('ArrowLeft', 2);
await key('Backspace'); await page.keyboard.type('10'); await sleep(200);
console.log('base -> 10       ', await val());

// 3) sin( still works as before, then continue with text
await fresh('sin(x');
console.log('sin(x            ', await val());

await page.close();
await browser.disconnect();
process.exit(0);
