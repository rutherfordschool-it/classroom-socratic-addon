import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ACTIVITY_TEMPLATES } from '../server/data/curricula.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.join(__dirname, '..', 'server', 'data', 'templates.json');

fs.writeFileSync(outPath, JSON.stringify(ACTIVITY_TEMPLATES, null, 2), 'utf-8');
console.log('Saved templates.json with', ACTIVITY_TEMPLATES.length, 'templates.');
