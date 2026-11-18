import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
await page.goto('file:///C:/Users/Lenovo%20ThinkPad/.gemini/antigravity-ide/scratch/classroom-socratic-addon/public/wysiwyg-demo.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

const clearAndType = async (str) => {
  await page.evaluate(() => {
    const el = document.querySelector('#teacherPromptWrap .mte');
    el.innerHTML = '';
    el.focus();
  });
  await sleep(100);
  for (const ch of str) {
    await page.keyboard.type(ch);
    await sleep(50);
  }
  await sleep(200);
  return await page.evaluate(() => {
    const el = document.querySelector('#teacherPromptWrap .mte');
    const mf = el.querySelector('math-field');
    return {
      text: el.innerText.trim(),
      hasMf: !!mf,
      mfVal: mf ? mf.value : null,
      mfPosition: mf ? mf.position : null,
      innerHTML: el.innerHTML.replace(/<span class="katex">[\s\S]*?<\/span>/g, '[K]')
    };
  });
};

console.log('--- Test "log" ---');
console.log(await clearAndType('log'));

console.log('--- Test "log_" ---');
console.log(await clearAndType('log_'));

console.log('--- Test "log3" ---');
console.log(await clearAndType('log3'));

console.log('--- Test "log_3" ---');
console.log(await clearAndType('log_3'));

console.log('--- Test "log 3" ---');
console.log(await clearAndType('log 3'));

console.log('--- Test "log3(" ---');
console.log(await clearAndType('log3('));

console.log('--- Test "log_3(6)" ---');
console.log(await clearAndType('log_3(6)'));

await page.close();
await browser.disconnect();
