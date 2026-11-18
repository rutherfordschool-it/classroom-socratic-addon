import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const val = () => page.evaluate(() => document.querySelector('#teacherPromptWrap math-field')?.value);

for (let n = 1; n <= 4; n++) {
  await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
  for (const ch of 'log36') { await page.keyboard.type(ch); await sleep(60); }
  await sleep(200);
  for (let i = 0; i < n; i++) { await page.keyboard.press('ArrowLeft'); await sleep(80); }
  await page.keyboard.type('Z'); await sleep(150);
  console.log(`${n} x Left + Z:`.padEnd(16), await val());
}

// forward from base: put Z in base, then ArrowRight x k and type Y
for (let k = 1; k <= 3; k++) {
  await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
  for (const ch of 'log3') { await page.keyboard.type(ch); await sleep(60); }
  await sleep(200);
  // cursor is now in the (empty) argument; go back into the base
  for (let i = 0; i < 1; i++) { await page.keyboard.press('ArrowLeft'); await sleep(80); }
  for (let i = 0; i < k; i++) { await page.keyboard.press('ArrowRight'); await sleep(80); }
  await page.keyboard.type('Y'); await sleep(150);
  console.log(`Left, ${k} x Right + Y:`.padEnd(24), await val());
}

await page.close();
await browser.disconnect();
process.exit(0);
