import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#teacherPromptWrap .mte') && customElements.get('math-field'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const run = async (s) => {
  await page.evaluate(() => { const e = document.querySelector('#teacherPromptWrap .mte'); e.innerHTML = ''; e.focus(); });
  for (const ch of s) { await page.keyboard.type(ch); await sleep(45); }
  await sleep(150);
  return await page.evaluate(() => {
    const e = document.querySelector('#teacherPromptWrap .mte');
    const mf = e.querySelector('math-field');
    return { text: e.innerText.replace(/\u200B/g, ''), mf: mf ? mf.value : null };
  });
};

console.log('2*3     ', await run('2*3'));
console.log('a->b    ', await run('a->b'));
console.log('+-5     ', await run('+-5'));
console.log('pi r    ', await run('pi r'));
console.log('pipe    ', await run('pipe'));
console.log('theta=  ', await run('theta='));
console.log('x<=3    ', await run('x<=3'));
console.log('5/2*3   ', await run('5/2*3'));
console.log('log36   ', await run('log36'));
console.log('log3(6) ', await run('log3(6)'));
console.log('log106  ', await run('log106'));
console.log('sinx    ', await run('sinx'));
console.log('sin(x)  ', await run('sin(x)'));
console.log('sin^2x  ', await run('sin^2x'));
console.log('lnx     ', await run('lnx'));
console.log('single  ', await run('single'));
console.log('since   ', await run('since'));

// Also reload the user's open wysiwyg-demo.html tab if present
const pages = await browser.pages();
for (const p of pages) {
  if (p !== page && p.url().includes('wysiwyg-demo.html')) {
    await p.reload({ waitUntil: 'domcontentloaded' });
  }
}

await page.close();
await browser.disconnect();
process.exit(0);
