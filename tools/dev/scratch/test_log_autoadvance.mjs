import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const reset = async () => {
  await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
};
const typeStr = async (s) => { for (const ch of s) { await page.keyboard.type(ch); await sleep(60); } await sleep(150); };
const val = () => page.evaluate(() => {
  const e = document.querySelector('#teacherPromptWrap .mte');
  const mf = e.querySelector('math-field');
  return { text: e.innerText.replace(/\u200B/g, ''), mf: mf ? mf.value : null };
});

const T = async (name, s) => { await reset(); await typeStr(s); console.log(name.padEnd(22), JSON.stringify(await val())); };

await T('log 3 6', 'log36');
await T('log 10 5', 'log105');       // log + 1 + 0 -> argument
await T('log_ 2 8', 'log_28');
await T('log a x', 'logax');
await T('log3 then 6', 'log36');
await T('log36 + 5', 'log36 + 5');

// arrow back / forward
await reset();
await typeStr('log36');
console.log('typed log36       ', JSON.stringify(await val()));
for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowLeft'); await sleep(80); }
await page.keyboard.press('Backspace'); await sleep(80);
await page.keyboard.type('5'); await sleep(200);
console.log('after <- fix base  ', JSON.stringify(await val()));
await page.keyboard.press('ArrowRight'); await sleep(80);
await page.keyboard.type('7'); await sleep(200);
console.log('after -> type 7    ', JSON.stringify(await val()));

await page.close();
await browser.disconnect();
process.exit(0);
