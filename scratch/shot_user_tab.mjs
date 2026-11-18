import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pages = await browser.pages();
const demo = pages.find(p => p.url().includes('wysiwyg-demo.html'));
if (demo) {
  const SHOT_PATH = 'C:/Users/Lenovo ThinkPad/.gemini/antigravity-cli/brain/413efb06-696b-43a5-984c-06d813a052d4/user_actual_tab.png';
  await demo.screenshot({ path: SHOT_PATH });
  console.log('Saved screenshot of active user tab');
}
await browser.disconnect();
