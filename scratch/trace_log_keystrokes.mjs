import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

await page.evaluate(() => {
  const el = document.querySelector('#teacherPromptWrap .mte');
  el.innerHTML = '';
  el.focus();
});

const logStep = async (step) => {
  const info = await page.evaluate(() => {
    const el = document.querySelector('#teacherPromptWrap .mte');
    const mf = el.querySelector('math-field');
    return {
      activeTag: document.activeElement.tagName,
      activeClass: document.activeElement.className,
      elText: el.innerText,
      hasMf: !!mf,
      mfValue: mf ? mf.value : null,
      mfPosition: mf ? mf.position : null,
      selection: mf ? mf.selection : null
    };
  });
  console.log(`[${step}]`, info);
};

await logStep('init');

await page.keyboard.type('l'); await sleep(50);
await logStep('type l');
await page.keyboard.type('o'); await sleep(50);
await logStep('type o');
await page.keyboard.type('g'); await sleep(50);
await logStep('type g');

await page.keyboard.type('_'); await sleep(50);
await logStep('type _');

await page.keyboard.type('3'); await sleep(50);
await logStep('type 3');

await page.keyboard.type('('); await sleep(50);
await logStep('type (');

await page.keyboard.type('6'); await sleep(50);
await logStep('type 6');

await page.close();
await browser.disconnect();
