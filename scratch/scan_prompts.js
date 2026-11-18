import fs from 'fs';
import path from 'path';

function findPrompts(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'node_modules' && f.name !== '.git') findPrompts(full);
    } else if (f.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes('You are "SocratesAI"') || content.includes('You are an expert high school educator')) {
        console.log('Found prompt in:', full);
      }
    }
  }
}

findPrompts('C:\\Users\\Lenovo ThinkPad\\.gemini\\antigravity-ide\\scratch\\classroom-socratic-addon\\server');
console.log('Scan completed.');
