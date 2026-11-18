import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
for (const p of pages) {
  for (const frame of p.frames()) {
    if (frame.url().includes('socrates-classroom-addon')) {
      await frame.evaluate(() => location.reload()).catch(() => {});
    }
  }
}

const testPage = await browser.newPage();
await testPage.goto('https://socrates-classroom-addon-243371665093.us-central1.run.app/attachment-discovery.html', { waitUntil: 'networkidle0' });
const res = await testPage.evaluate(() => {
  window.selectExerciseLevel('A');
  const statusA = document.getElementById('statusLevelA')?.textContent;
  window.selectExerciseLevel('C');
  const statusC = document.getElementById('statusLevelC')?.textContent;
  window.selectExerciseLevel('B');
  const statusB = document.getElementById('statusLevelB')?.textContent;
  return { statusA, statusC, statusB };
});
console.log('Cloud Run attachment-discovery verified:', res);
await testPage.close();
await browser.disconnect();
process.exit(0);
