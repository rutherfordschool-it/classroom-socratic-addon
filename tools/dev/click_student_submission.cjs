const puppeteer = require('puppeteer-core');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Lenovo ThinkPad\\.gemini\\antigravity-cli\\brain\\413efb06-696b-43a5-984c-06d813a052d4';

async function main() {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('classroom.google.com'));
  if (!page) throw new Error('Classroom tab not found');

  await page.bringToFront();

  console.log('Clicking on Pavel Birulin submission...');
  const clicked = await page.evaluate(() => {
    const student = Array.from(document.querySelectorAll('a, div, span, li'))
      .find(el => el.innerText && el.innerText.trim() === 'Pavel Birulin' && el.offsetParent !== null);
    if (student) {
      const clickable = student.closest('a, [role="button"], [role="row"], div[tabindex]') || student;
      clickable.click();
      return { success: true, tag: clickable.tagName, href: clickable.href || null };
    }
    return { success: false };
  });

  console.log('Click result:', clicked);
  await new Promise(r => setTimeout(r, 4000));

  console.log('Current URL:', page.url());
  const screenshotPath = path.join(ARTIFACT_DIR, 'classroom_pavel_submission_view.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Inspect frames to see if SocratesAI teacher review iframe is embedded
  const frames = page.frames();
  console.log(`Page has ${frames.length} frames.`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    console.log(`Frame ${i}: name="${f.name()}", url="${f.url().slice(0, 100)}"`);
  }

  browser.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
