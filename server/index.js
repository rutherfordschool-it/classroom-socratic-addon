import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';
import { classroomRouter } from './routes/classroom.js';
import { classroomService } from './services/classroomService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// Enable JSON and URL-encoded body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// No CORS middleware on purpose: every page and API call is served from this same origin
// (including inside the Google Classroom iframe), so cross-origin browser access stays blocked.

// Google Classroom iframe security headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://classroom.google.com https://workspace.google.com https://*.google.com;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // API responses and HTML pages are always fresh; static assets are revalidated via ETag
  if (req.path.startsWith('/api') || req.path.startsWith('/classroom') || req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

// Serve static frontend assets (JS/CSS use ETag revalidation so updates are picked up immediately)
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Health check (note: Cloud Run reserves /healthz for itself, so this lives under /api)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: classroomService.getStorageInfo() });
});

// Mount API routes
app.use('/api', apiRouter);
app.use('/classroom', classroomRouter);

// Friendly page aliases
const pageAliases = {
  '/simulator': 'simulator.html',
  '/discovery': 'attachment-discovery.html',
  '/student': 'student-work.html',
  '/review': 'teacher-review.html'
};
for (const [route, file] of Object.entries(pageAliases)) {
  app.get(route, (req, res) => res.sendFile(path.join(publicDir, file)));
}

// Load persisted state (from the shared Google Drive folder on Cloud Run) BEFORE accepting traffic
await classroomService.init();

const server = app.listen(config.port, () => {
  const storage = classroomService.getStorageInfo();
  console.log(`\n======================================================`);
  console.log(`🎓 Google Classroom Socratic LLM Add-on is LIVE!`);
  console.log(`======================================================`);
  console.log(`🌐 Base URL:            ${config.baseUrl}`);
  console.log(`🎮 Classroom Simulator: ${config.baseUrl}/simulator.html`);
  console.log(`👨‍🏫 Teacher Discovery:   ${config.baseUrl}/attachment-discovery.html`);
  console.log(`🎒 Student Work:        ${config.baseUrl}/student-work.html?attachmentId=att-demo-socratic-01`);
  console.log(`📊 Teacher Grading:     ${config.baseUrl}/teacher-review.html`);
  console.log(`💾 Storage:             ${storage.backend}${storage.driveFolderUrl ? ` → ${storage.driveFolderUrl}` : ''}`);
  console.log(`🤖 Multi-LLM Providers: Gemini (${config.hasGeminiKey ? 'Active' : 'Simulated'}), Claude (${config.hasAnthropicKey ? 'Active' : 'Simulated'}), OpenAI (${config.hasOpenaiKey ? 'Active' : 'Simulated'})`);
  console.log(`======================================================\n`);
});

// Make sure the last student answers reach Google Drive when Cloud Run stops this instance
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received, flushing data to storage...`);
  try {
    if (config.storageBackend === 'drive') {
      for (const attachmentId of new Set([...classroomService.submissionsStore.values()].map(s => s.attachmentId))) {
        classroomService.markResultsDirty(attachmentId);
      }
      await classroomService.flushToDrive();
    }
  } catch (e) {
    console.warn('[Server] Flush on shutdown failed:', e.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
