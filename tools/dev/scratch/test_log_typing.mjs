import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));
const server = await new Promise(r => { const s = app.listen(3366, '127.0.0.1', () => r(s)); });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3366/attachment-discovery.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => customElements.get('math-field'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Click prompt editor and clear
await page.click('#promptEditorWrap .mte');
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });

console.log('Testing typing "log_3"');
for (const ch of 'log_3') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

let state = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  const mf = mte.querySelector('math-field');
  return {
    mteHtml: mte.innerHTML.replace(/<span class="katex">[\s\S]*?<\/span>/g, '[K]').slice(0, 200),
    hasMf: !!mf,
    mfVal: mf ? mf.value : null
  };
});
console.log('State after log_3:', state);

// Clear and test typing "log3("
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of 'log3(') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

state = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  const mf = mte.querySelector('math-field');
  return {
    mteHtml: mte.innerHTML.replace(/<span class="katex">[\s\S]*?<\/span>/g, '[K]').slice(0, 200),
    hasMf: !!mf,
    mfVal: mf ? mf.value : null
  };
});
console.log('State after log3(:', state);

// Clear and test typing "log3" without paren
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of 'log3') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

state = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  const mf = mte.querySelector('math-field');
  return {
    mteHtml: mte.innerHTML.replace(/<span class="katex">[\s\S]*?<\/span>/g, '[K]').slice(0, 200),
    hasMf: !!mf,
    mfVal: mf ? mf.value : null
  };
});
console.log('State after log3:', state);

// Clear and test typing "log"
await page.evaluate(() => { document.querySelector('#promptEditorWrap .mte').innerHTML = ''; });
await page.click('#promptEditorWrap .mte');
for (const ch of 'log') {
  await page.keyboard.type(ch);
  await sleep(60);
}
await sleep(300);

state = await page.evaluate(() => {
  const mte = document.querySelector('#promptEditorWrap .mte');
  const mf = mte.querySelector('math-field');
  return {
    mteHtml: mte.innerHTML.replace(/<span class="katex">[\s\S]*?<\/span>/g, '[K]').slice(0, 200),
    hasMf: !!mf,
    mfVal: mf ? mf.value : null
  };
});
console.log('State after log:', state);

await page.close();
await browser.disconnect();
server.close();
