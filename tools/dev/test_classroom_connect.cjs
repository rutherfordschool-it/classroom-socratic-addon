const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Lenovo ThinkPad\\.gemini\\antigravity-cli\\brain\\413efb06-696b-43a5-984c-06d813a052d4';

async function main() {
  console.log('Connecting to Chrome on port 9222...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  console.log(`Found ${pages.length} pages in browser.`);
  
  let classroomPage = null;
  for (const page of pages) {
    const url = page.url();
    const title = await page.title();
    console.log(`Page: "${title}" -> ${url}`);
    if (url.includes('classroom.google.com')) {
      classroomPage = page;
      break;
    }
  }

  if (!classroomPage) {
    console.log('Classroom page not found, opening it in a new tab...');
    classroomPage = await browser.newPage();
    await classroomPage.goto('https://classroom.google.com/c/ODkwNzY5OTc4MjEw', { waitUntil: 'networkidle2' });
  }

  console.log('Classroom tab title:', await classroomPage.title());
  console.log('Classroom tab URL:', classroomPage.url());

  const screenshotPath = path.join(ARTIFACT_DIR, 'classroom_current.png');
  await classroomPage.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // Inspect frames
  const frames = classroomPage.frames();
  console.log(`Page has ${frames.length} frames.`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    console.log(`Frame ${i}: name="${f.name()}", url="${f.url().slice(0, 80)}"`);
  }

  browser.disconnect();
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
