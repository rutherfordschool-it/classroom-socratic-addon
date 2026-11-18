import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const info = () => page.evaluate(() => { const m = document.querySelector('#teacherPromptWrap math-field'); return m ? `${m.value}   [pos ${m.position}]` : 'NO FIELD'; });
const fresh = async (s) => {
  await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
  for (const ch of s) { await page.keyboard.type(ch); await sleep(60); }
  await sleep(250);
};
await fresh('log36');
console.log('typed', await info());
await page.keyboard.press('ArrowLeft'); await sleep(200);
await page.keyboard.press('ArrowLeft'); await sleep(200);
console.log('after 2 Left', await info());
await page.keyboard.press('Backspace'); await sleep(250);
console.log('after Backspace', await info());
await page.keyboard.type('5'); await sleep(250);
console.log('after type 5', await info());
await page.keyboard.press('ArrowRight'); await sleep(250);
console.log('after Right', await info());
await page.keyboard.type('7'); await sleep(250);
console.log('after type 7', await info());
await page.close(); await browser.disconnect(); process.exit(0);
