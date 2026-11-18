import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
const demoPage = pages.find(p => p.url().includes('wysiwyg-demo.html'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!demoPage) {
  console.log('Demo page not found');
  process.exit(1);
}

// Reload with domcontentloaded
await demoPage.reload({ waitUntil: 'domcontentloaded' });
await sleep(1000);

// Clear prompt editor and type "log"
await demoPage.click('#teacherPromptWrap .mte');
await demoPage.evaluate(() => { document.querySelector('#teacherPromptWrap .mte').innerHTML = ''; });

console.log('Typing "log" in user tab...');
for (const ch of 'log') {
  await demoPage.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

let state = await demoPage.evaluate(() => {
  const mf = document.querySelector('#teacherPromptWrap math-field');
  return {
    hasMf: !!mf,
    mfVal: mf ? mf.value : null,
    activeTag: document.activeElement.tagName
  };
});
console.log('State after "log":', state);

// Now type base "3"
console.log('Typing "3"...');
await demoPage.keyboard.type('3');
await sleep(200);

state = await demoPage.evaluate(() => {
  const mf = document.querySelector('#teacherPromptWrap math-field');
  return {
    mfVal: mf ? mf.value : null
  };
});
console.log('State after "3":', state);

// Now type "(" and "6"
console.log('Typing "(6)"...');
await demoPage.keyboard.type('(');
await sleep(100);
await demoPage.keyboard.type('6');
await sleep(200);

state = await demoPage.evaluate(() => {
  const mf = document.querySelector('#teacherPromptWrap math-field');
  return {
    mfVal: mf ? mf.value : null
  };
});
console.log('State after "(6)":', state);

// Take screenshot
await demoPage.screenshot({
  path: 'C:/Users/Lenovo ThinkPad/.gemini/antigravity-cli/brain/413efb06-696b-43a5-984c-06d813a052d4/demo_after_log_fix.png',
  fullPage: true
});

await browser.disconnect();
console.log('Test finished successfully!');
