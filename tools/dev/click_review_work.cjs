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

  console.log('Finding and clicking "Review work" button...');
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .find(el => el.innerText && el.innerText.trim() === 'Review work');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  console.log('Clicked "Review work":', clicked);
  await new Promise(r => setTimeout(r, 4000));

  console.log('Current URL after clicking Review work:', page.url());
  const screenshotPath = path.join(ARTIFACT_DIR, 'classroom_review_work_page.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Check what students and submissions are on this page
  const pageDetails = await page.evaluate(() => {
    const students = Array.from(document.querySelectorAll('[data-student-id], [role="row"], li, [data-stream-item-id]'))
      .map(el => el.innerText ? el.innerText.trim().replace(/\n+/g, ' | ') : '')
      .filter(t => t.length > 5 && t.length < 200);

    const attachments = Array.from(document.querySelectorAll('a, [role="button"], div'))
      .filter(el => el.innerText && (el.innerText.includes('Socrates') || el.innerText.includes('Turned in') || el.innerText.includes('Assigned')))
      .map(el => ({
        tag: el.tagName,
        text: el.innerText.trim().replace(/\n+/g, ' '),
        href: el.href || null
      }));

    return { students: Array.from(new Set(students)), attachments };
  });

  console.log('Page details:', JSON.stringify(pageDetails, null, 2));

  // Also check frames
  const frames = page.frames();
  console.log(`Frames (${frames.length}):`);
  frames.forEach((f, i) => console.log(`  Frame ${i}: ${f.url().slice(0, 80)}`));

  browser.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
