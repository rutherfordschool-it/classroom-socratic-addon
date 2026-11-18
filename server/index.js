import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';
import { classroomRouter } from './routes/classroom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// Enable JSON and URL-encoded body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enable CORS
app.use(cors());

// Google Classroom Iframe Security Headers & No-Cache Policy for Live Updates
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://classroom.google.com https://workspace.google.com https://*.google.com;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve static frontend assets with etag/caching disabled
app.use(express.static(publicDir, { etag: false, lastModified: false, maxAge: 0 }));

// Mount API routes
app.use('/api', apiRouter);
app.use('/classroom', classroomRouter);

// Fallback to simulator or index
app.get('/simulator', (req, res) => {
  res.sendFile(path.join(publicDir, 'simulator.html'));
});

app.get('/discovery', (req, res) => {
  res.sendFile(path.join(publicDir, 'attachment-discovery.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(publicDir, 'student-work.html'));
});

app.get('/review', (req, res) => {
  res.sendFile(path.join(publicDir, 'teacher-review.html'));
});

// Start Express Server
const server = app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🎓 Google Classroom Socratic LLM Add-on is LIVE!`);
  console.log(`======================================================`);
  console.log(`🌐 Base URL:            http://localhost:${config.port}`);
  console.log(`🎮 Classroom Simulator: http://localhost:${config.port}/simulator.html`);
  console.log(`👨‍🏫 Teacher Discovery:   http://localhost:${config.port}/attachment-discovery.html`);
  console.log(`🎒 Student Work:        http://localhost:${config.port}/student-work.html?attachmentId=att-demo-socratic-01`);
  console.log(`📊 Teacher Grading:     http://localhost:${config.port}/teacher-review.html?submissionId=sub-pavel-birulin-live`);
  console.log(`🤖 Multi-LLM Providers: Gemini (${config.hasGeminiKey ? 'Active' : 'Simulated'}), Claude (${config.hasAnthropicKey ? 'Active' : 'Simulated'}), OpenAI (${config.hasOpenaiKey ? 'Active' : 'Simulated'})`);
  console.log(`======================================================\n`);
});

export { app, server };
