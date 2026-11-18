import { google } from 'googleapis';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkAnswer, looksLikeWorkStep } from './answerChecker.js';
import { driveStorage } from './driveStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE_PATH = path.join(__dirname, '../data/classroom_store.json');
const DRIVE_STORE_NAME = 'socrates-store.json';
const DRIVE_WRITE_DEBOUNCE_MS = 1500;

/** Answer-key fields that must never be sent to a student's browser. */
const ANSWER_KEY_FIELDS = ['targetAnswer', 'hint', 'solutionSteps'];

/** Corrected answer keys for problems that shipped with a wrong key in earlier versions. */
const KNOWN_ANSWER_KEY_FIXES = [
  {
    match: /\\frac\{1\}\{2\}\\log_4\(16\)\s*\+\s*\\log_4\(8\)/,
    targetAnswer: '5/2',
    hint: 'Power Law: $\\frac{1}{2}\\log_4(16) = \\log_4(4) = 1$. Then $\\log_4(8) = \\frac{3}{2}$ because $4^{3/2} = 8$.'
  }
];

const LOG_TOPIC_RE = /\\log|logarithm|log_|\blog\b/i;

/**
 * Service to manage Google Classroom Add-on API interactions.
 * Handles addOnToken, attachments, student submissions, and grade passback.
 */
export class ClassroomService {
  constructor() {
    this.attachmentsStore = new Map();
    this.submissionsStore = new Map();
    this.mobileSessions = new Map();
    this.customMaterialsStore = new Map();
    this.savedLessonPlansStore = new Map();
    this.customCurriculaStore = new Map();
    this.driveWriteTimer = null;
    this.driveResultsDirty = new Set();
    this.resultSheetUrls = new Map();
    this.initializeDefaultData();
    if (config.storageBackend !== 'drive') {
      this.loadStoreFromFile();
    }
  }

  /**
   * Async initialisation: when running on Cloud Run, loads all state from the shared Google Drive folder.
   * Must complete before the server starts accepting requests.
   */
  async init() {
    if (config.storageBackend !== 'drive') return;
    try {
      await driveStorage.init();
      const parsed = await driveStorage.readJson(DRIVE_STORE_NAME);
      if (parsed) {
        this.applyParsedStore(parsed);
      } else if (fs.existsSync(STORE_FILE_PATH)) {
        // First run on Drive: seed from any bundled file
        this.applyParsedStore(JSON.parse(fs.readFileSync(STORE_FILE_PATH, 'utf-8')));
        this.saveStoreToFile();
      }
    } catch (e) {
      console.error('[ClassroomService] Google Drive storage unavailable — data will NOT be saved until this is fixed:', e.message);
      this.storageInitError = e.message;
      config.storageBackend = 'memory';
    }
  }

  loadStoreFromFile() {
    try {
      if (fs.existsSync(STORE_FILE_PATH)) {
        this.applyParsedStore(JSON.parse(fs.readFileSync(STORE_FILE_PATH, 'utf-8')));
      }
    } catch (e) {
      console.warn('[ClassroomService] Could not load persistent store:', e.message);
    }
  }

  applyParsedStore(parsed = {}) {
    {
      {
        if (parsed.attachments && Array.isArray(parsed.attachments)) {
          for (const att of parsed.attachments) {
            if (att.id === 'att-demo-socratic-01') continue;
            this.applyKnownAnswerKeyFixes(att);
            this.attachmentsStore.set(att.id, att);
          }
        }
        if (parsed.customMaterials && Array.isArray(parsed.customMaterials)) {
          for (const mat of parsed.customMaterials) {
            if (mat && mat.id) this.customMaterialsStore.set(mat.id, mat);
          }
        }
        if (parsed.savedLessonPlans && Array.isArray(parsed.savedLessonPlans)) {
          for (const plan of parsed.savedLessonPlans) {
            if (plan && plan.id) {
              this.applyKnownAnswerKeyFixes(plan);
              this.savedLessonPlansStore.set(plan.id, plan);
            }
          }
        }
        if (parsed.customCurricula && Array.isArray(parsed.customCurricula)) {
          for (const cur of parsed.customCurricula) {
            if (cur && cur.code) this.customCurriculaStore.set(cur.code, cur);
          }
        }
        if (parsed.submissions && Array.isArray(parsed.submissions)) {
          for (const sub of parsed.submissions) {
            if (sub.isAutomatedTest) continue;
            const userMsgs = (sub.transcript || []).filter(m => m.role === 'user');
            const solvedCount = Array.isArray(sub.solvedProblems) ? sub.solvedProblems.length : 0;
            if (userMsgs.length === 0 && (sub.photosSubmittedCount || 0) === 0 && solvedCount === 0) continue;
            this.submissionsStore.set(sub.submissionId, sub);
          }
          // Re-grade after attachments are loaded so corrected answer keys apply to stored work
          for (const sub of this.submissionsStore.values()) {
            this.refreshSubmissionAnalysis(sub);
          }
        }
        console.log(`[ClassroomService] Loaded ${this.attachmentsStore.size} attachments, ${this.submissionsStore.size} submissions, ${this.customMaterialsStore.size} custom materials, and ${this.savedLessonPlansStore.size} saved lesson plans.`);
      }
    }
  }

  /** Patches known-wrong answer keys inside an attachment / lesson plan exercise pool. */
  applyKnownAnswerKeyFixes(holder) {
    const pool = holder?.exercisePool;
    if (!pool) return;
    for (const key of ['diagnostic', 'levelA', 'levelB', 'levelC']) {
      for (const p of Array.isArray(pool[key]) ? pool[key] : []) {
        const fix = KNOWN_ANSWER_KEY_FIXES.find(f => f.match.test(String(p.problem || '').replace(/\s+/g, '')) || f.match.test(String(p.problem || '')));
        if (fix) {
          p.targetAnswer = fix.targetAnswer;
          p.hint = fix.hint;
        }
      }
    }
  }

  refreshSubmissionAnalysis(sub) {
    try {
      sub.aiAnalysis = this.analyzeTranscript(sub);
      sub.suggestedScore = sub.aiAnalysis.suggestedScore;
      sub.masteryLevel = sub.aiAnalysis.masteryPercentage;
      sub.mistakesCount = sub.aiAnalysis.misconceptionsIdentified?.length || 0;
    } catch (e) {
      console.warn('[ClassroomService] Could not analyse submission', sub?.submissionId, e.message);
    }
  }

  buildStoreSnapshot() {
    return {
      attachments: Array.from(this.attachmentsStore.values()),
      submissions: Array.from(this.submissionsStore.values()),
      customMaterials: Array.from(this.customMaterialsStore.values()),
      savedLessonPlans: Array.from(this.savedLessonPlansStore.values()),
      customCurricula: Array.from(this.customCurriculaStore.values())
    };
  }

  saveStoreToFile() {
    if (config.storageBackend === 'drive') {
      this.scheduleDriveWrite();
      return;
    }
    if (config.storageBackend === 'memory') return;
    try {
      const dir = path.dirname(STORE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(this.buildStoreSnapshot(), null, 2), 'utf-8');
    } catch (e) {
      console.warn('[ClassroomService] Could not save persistent store:', e.message);
    }
  }

  scheduleDriveWrite() {
    if (this.driveWriteTimer) return;
    this.driveWriteTimer = setTimeout(() => {
      this.driveWriteTimer = null;
      this.flushToDrive().catch(e => console.warn('[ClassroomService] Drive write failed:', e.message));
    }, DRIVE_WRITE_DEBOUNCE_MS);
  }

  /** Writes the full store plus human-readable library items and per-assignment student results into the same Google Drive folder. */
  async flushToDrive() {
    if (!driveStorage.ready) return;
    if (this.driveWriteTimer) {
      clearTimeout(this.driveWriteTimer);
      this.driveWriteTimer = null;
    }
    const dirty = Array.from(this.driveResultsDirty);
    this.driveResultsDirty.clear();
    const snapshot = this.buildStoreSnapshot();
    await driveStorage.writeJson(DRIVE_STORE_NAME, snapshot);
    await driveStorage.syncLibraryItemsToDrive(snapshot).catch(e =>
      console.warn('[ClassroomService] Library sync warning:', e.message)
    );
    for (const attachmentId of dirty) {
      try {
        const att = this.attachmentsStore.get(attachmentId);
        const submissions = this.getSubmissionsForAttachment(attachmentId);
        const url = await driveStorage.writeAssignmentResultsToDrive({
          attachmentId,
          title: att?.title || attachmentId,
          csv: this.buildResultsCsv(attachmentId),
          submissions
        });
        this.resultSheetUrls.set(attachmentId, url);
      } catch (e) {
        console.warn(`[ClassroomService] Could not write results to Drive for ${attachmentId}:`, e.message);
        this.driveResultsDirty.add(attachmentId);
      }
    }
  }

  /** One row per student for an assignment: score, mastery, per-problem outcome, telemetry. */
  buildResultsCsv(attachmentId) {
    const esc = (v) => {
      const s = String(v ?? '').replace(/\r?\n/g, ' ');
      return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const subs = this.getSubmissionsForAttachment(attachmentId);
    const header = [
      'Assignment', 'Student', 'Email', 'Status', 'Level', 'AI Score (/100)', 'Teacher Grade (/100)', 'Mastery %',
      'Problems Answered', 'Problems Correct', 'Mistakes', 'Hints Used', 'Photos', 'Active Time (min)',
      'Submitted At', 'Last Updated', 'Teacher Feedback'
    ];
    const rows = subs.map(s => {
      const att = this.attachmentsStore.get(s.attachmentId);
      const solved = Array.isArray(s.solvedProblems) ? s.solvedProblems : [];
      const verdicts = s.aiAnalysis?.perProblem || [];
      const correct = verdicts.filter(v => v.correct).length;
      return [
        att?.title || s.attachmentId || attachmentId || '',
        s.studentName, s.studentEmail, s.status, s.currentLevel, s.suggestedScore ?? '', s.assignedScore ?? '',
        s.masteryLevel ?? '', solved.length, correct, s.mistakesCount ?? '', s.hintsUsedCount ?? 0,
        s.photosSubmittedCount ?? 0, Math.round((s.activeTimeSec || 0) / 60), s.submittedAt || '',
        s.updatedAt || '', s.teacherFeedback || ''
      ].map(esc).join(',');
    });
    return [header.map(esc).join(','), ...rows].join('\n');
  }

  getResultsSheetUrl(attachmentId) {
    return this.resultSheetUrls.get(attachmentId) || (config.storageBackend === 'drive' ? driveStorage.folderUrl : '');
  }

  getStorageInfo() {
    const isDrive = config.storageBackend === 'drive';
    return {
      backend: config.storageBackend,
      driveFolderUrl: isDrive ? driveStorage.folderUrl : '',
      driveName: isDrive ? driveStorage.driveName : '',
      lastError: driveStorage.lastError || this.storageInitError || '',
      persisted: isDrive ? !driveStorage.lastError : config.storageBackend === 'file'
    };
  }

  markResultsDirty(attachmentId) {
    if (attachmentId) this.driveResultsDirty.add(attachmentId);
  }

  initializeDefaultData() {
    // Seed sample attachment for demonstration and local testing
    const sampleAttachmentId = 'att-demo-socratic-01';
    this.attachmentsStore.set(sampleAttachmentId, {
      id: sampleAttachmentId,
      title: 'Laws of Logarithms (Product, Quotient, Power Rules)',
      curriculum: 'canada',
      gradeLevel: 'Grade 12',
      subject: 'Mathematics',
      courseName: 'MHF4U Advanced Functions',
      topic: 'Laws of Logarithms (Product, Quotient, Power)',
      learningGoal: 'Master applying the Product, Quotient, and Power laws of logarithms to simplify expressions and solve equations.',
      prompt: 'Simplify into a single numerical value: $2\\log_3(6) - \\log_3(4)$. Take a look at the first term $2\\log_3(6)$. What rule allows us to absorb that multiplier $2$ into an exponent?',
      initialHint: 'Apply the Power Law to the first term before combining with the Quotient Law.',
      socraticStyle: 'guided_scaffold',
      selectedProvider: 'gemini',
      selectedModel: 'gemini-3.1-flash-lite',
      currentLevel: 'A',
      studentMode: 'step_by_step',
      targetMilestones: [
        "Step 1 (Diagnostic Check): Verify basic logarithm definition ($b^y = x \\Longleftrightarrow \\log_b(x) = y$)",
        "Step 2 (Power Law): Absorb scalar coefficients into exponents ($2\\log_3(6) = \\log_3(36)$)",
        "Step 3 (Quotient Law): Combine same-base logarithms ($\\log_3(36) - \\log_3(4) = \\log_3(9) = 2$)",
        "Step 4 (Mastery Verification): Solve adaptive problem and check domain ($x > 0$)"
      ],
      specificExpectations: [
        "Apply Product Law: $\\log_b(xy) = \\log_b(x) + \\log_b(y)$",
        "Apply Quotient Law: $\\log_b(x/y) = \\log_b(x) - \\log_b(y)$",
        "Apply Power Law: $\\log_b(x^k) = k \\cdot \\log_b(x)$"
      ],
      courseMaterialsSource: 'Block 1 — Teacher Material Studio (MHF4U Logarithms)',
      courseMaterials: `**Reference Sheet: Product, Quotient, and Power Laws of Logarithms (MHF4U Grade 12)**

1. **Product Law**: $\\log_b(xy) = \\log_b(x) + \\log_b(y)$
   Base Example: $\\log_2(4) + \\log_2(8) = \\log_2(32) = 5$

2. **Quotient Law**: $\\log_b(x/y) = \\log_b(x) - \\log_b(y)$
   Base Example: $\\log_3(36/4) = \\log_3(9) = 2$

3. **Power Law**: $\\log_b(x^k) = k \\cdot \\log_b(x)$
   **Critical Priority Rule**: Always absorb front coefficients using the Power Law BEFORE combining terms with the Quotient or Product Law.
   Base Multi-Step Example: $2\\log_3(6) - \\log_3(4) = \\log_3(6^2) - \\log_3(4) = \\log_3(36/4) = \\log_3(9) = 2$`,
      teacherTelemetry: {
        materialPrepTimeSec: 145,
        lessonPlanPrepTimeSec: 95,
        totalPrepTimeSec: 240,
        prepMethodsUsed: ['file_upload', 'voice_dictation', 'ai_lesson_draft']
      },
      adaptiveConfig: {
        autoDiagnoseNewStudent: true,
        startingLevel: 'AUTO',
        repetitionsPerTier: 3
      },
      exercisePool: {
        diagnostic: [
          { id: 'diag-1', problem: 'Quick Diagnostic Check: What is the exact value of $\\log_3(9)$, and which rule lets us combine $\\log_3(2) + \\log_3(4.5)$ into a single logarithm?', targetAnswer: '2 and Product Law', hint: 'Ask yourself: $3$ to what power gives $9$?' }
        ],
        levelA: [
          { id: 'A1', problem: 'Simplify into a single logarithm and evaluate: $\\log_2(4) + \\log_2(8)$', targetAnswer: '5', hint: 'Use the Product Law: $\\log_2(4 \\cdot 8) = \\log_2(32)$.' },
          { id: 'A2', problem: 'Simplify into a single logarithm and evaluate: $\\log_3(27) - \\log_3(3)$', targetAnswer: '2', hint: 'Use the Quotient Law: $\\log_3(27 / 3) = \\log_3(9)$.' },
          { id: 'A3', problem: 'Rewrite as a single logarithm and evaluate: $2\\log_5(5)$', targetAnswer: '2', hint: 'Use the Power Law: $\\log_5(5^2) = \\log_5(25) = 2$.' }
        ],
        levelB: [
          { id: 'B1', problem: 'Simplify into a single numerical value: $2\\log_3(6) - \\log_3(4)$', targetAnswer: '2', hint: 'Apply the Power Law first: $2\\log_3(6) = \\log_3(36)$, then divide by $4$.' },
          { id: 'B2', problem: 'Simplify into a single numerical value: $3\\log_2(4) - \\log_2(8)$', targetAnswer: '3', hint: 'Rewrite $3\\log_2(4) = \\log_2(64)$, then apply Quotient Law.' },
          { id: 'B3', problem: 'Simplify into a single numerical value: $\\frac{1}{2}\\log_4(16) + \\log_4(8)$', targetAnswer: '5/2', hint: 'Power Law: $\\frac{1}{2}\\log_4(16) = \\log_4(\\sqrt{16}) = \\log_4(4) = 1$. Then $\\log_4(8) = \\frac{3}{2}$ because $4^{3/2} = 8$.' }
        ],
        levelC: [
          { id: 'C1', problem: 'Solve for $x$ and verify domain restrictions ($x > 1$): $\\log_2(x - 1) + \\log_2(x + 2) = 2$', targetAnswer: 'x = 2 (reject x = -3)', hint: 'Combine into $\\log_2((x-1)(x+2)) = 2 \\implies (x-1)(x+2) = 4$.' },
          { id: 'C2', problem: 'Solve for $x$ and check for extraneous roots: $2\\log_3(x) - \\log_3(x - 2) = 2$', targetAnswer: 'x = 3 or x = 6', hint: 'Rewrite as $\\log_3\\left(\\frac{x^2}{x-2}\\right) = 2 \\implies x^2 = 9(x - 2)$.' },
          { id: 'C3', problem: 'Solve for $x$ over the valid domain: $\\log_4(x + 3) + \\log_4(x - 3) = 2$', targetAnswer: 'x = 5 (reject x = -5)', hint: 'Combine via Product Law: $\\log_4(x^2 - 9) = 2 \\implies x^2 - 9 = 16$.' }
        ]
      },
      levelConfigs: {
        A: {
          title: 'Level A — Foundational',
          description: 'Foundational Scaffolding: Single-step rule recognition, basic definitions, and guided step-by-step verification.',
          prompt: 'Guide the student one small step at a time. Ask them to identify which rule from the Reference Sheet applies first, and require them to write the intermediate algebraic substitution before computing the final number.'
        },
        B: {
          title: 'Level B — Standard',
          description: 'Standard Curriculum Mastery: Multi-step simplification combining two or more rules in proper operational priority.',
          prompt: 'Prompt the student to justify operational priority (e.g., Power Law before Quotient/Product Law) and require every intermediate transformation step to be shown explicitly.'
        },
        C: {
          title: 'Level C — Advanced',
          description: 'Advanced & Olympiad Challenge: Complex equations, domain restrictions, extraneous root verification, and multi-concept proofs.',
          prompt: 'Challenge the student with minimal hints. Require full algebraic derivation, explicit domain restriction checks (e.g., x > 0), and verification/rejection of extraneous roots.'
        }
      },
      createdAt: new Date().toISOString()
    });

    // Seed initial Saved Lesson Plan in the Library
    const defaultAtt = this.attachmentsStore.get(sampleAttachmentId);
    if (defaultAtt) {
      this.savedLessonPlansStore.set('plan-default-mhf4u-log', {
        id: 'plan-default-mhf4u-log',
        title: defaultAtt.title,
        curriculum: defaultAtt.curriculum,
        gradeLevel: defaultAtt.gradeLevel,
        subject: defaultAtt.subject,
        learningGoal: defaultAtt.learningGoal,
        targetMilestones: defaultAtt.targetMilestones,
        teacherInstructions: 'Emphasize step-by-step derivations and operational priority of the Power Law.',
        courseMaterials: defaultAtt.courseMaterials,
        courseMaterialsSource: defaultAtt.courseMaterialsSource,
        levelConfigs: defaultAtt.levelConfigs,
        exercisePool: defaultAtt.exercisePool,
        repetitionsPerTier: 3,
        studentMode: 'step_by_step',
        socraticStyle: 'guided_scaffold',
        savedAt: defaultAtt.createdAt
      });
    }
    // Clean initial state: DO NOT seed fake student submissions (Demo Student Ontario High, Elena Rostova, Alex Chen)
  }

  /**
   * Clears all stored submissions (or submissions for a specific attachmentId)
   */
  clearSubmissions(attachmentId = null) {
    if (!attachmentId) {
      for (const sub of this.submissionsStore.values()) this.markResultsDirty(sub.attachmentId);
      this.submissionsStore.clear();
    } else {
      this.markResultsDirty(attachmentId);
      for (const [id, sub] of this.submissionsStore.entries()) {
        if (sub.attachmentId === attachmentId) {
          this.submissionsStore.delete(id);
        }
      }
    }
    this.saveStoreToFile();
  }

  /**
   * Retrieves all real student submissions associated with an attachment, sorted newest first.
   * Never injects fake demo people or unattempted/empty sessions.
   */
  getSubmissionsForAttachment(attachmentId) {
    const list = [];

    for (const sub of this.submissionsStore.values()) {
      if (sub.isAutomatedTest || sub.isExemplar) continue;
      const userMsgs = (sub.transcript || []).filter(m => m.role === 'user');
      const solvedCount = Array.isArray(sub.solvedProblems) ? sub.solvedProblems.length : 0;
      // Only include sessions where a student actually responded or submitted work
      if (userMsgs.length === 0 && (sub.photosSubmittedCount || 0) === 0 && solvedCount === 0) continue;

      if (!attachmentId || attachmentId === 'att-demo-socratic-01' || sub.attachmentId === attachmentId) {
        list.push(sub);
      }
    }

    const result = list;
    // Sort newest first
    result.sort((a, b) => new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0));

    return result;
  }

  /**
   * Retrieves a single submission by ID or student email (always prioritizing the newest attempt)
   */
  getSubmission(submissionId) {
    if (this.submissionsStore.has(submissionId)) {
      return this.submissionsStore.get(submissionId);
    }
    const matches = [];
    for (const sub of this.submissionsStore.values()) {
      if (sub.submissionId === submissionId || sub.studentEmail === submissionId) {
        matches.push(sub);
      }
    }
    if (matches.length > 0) {
      matches.sort((a, b) => new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0));
      return matches[0];
    }
    return null;
  }

  /**
   * Fills in MISSING optional fields of an attachment without ever replacing a teacher's lesson with another subject.
   * The built-in logarithm pool / reference sheet is only used for logarithm lessons; any other subject with an
   * empty pool is flagged (`poolMissing`) so the student and teacher see an explicit warning instead of wrong content.
   */
  ensureCompleteAttachment(att) {
    if (!att) return att;
    const def = this.attachmentsStore.get('att-demo-socratic-01');
    if (!def || att.id === def.id) return att;

    const topicText = `${att.title || ''} ${att.topic || ''} ${att.learningGoal || ''}`;
    const isLogLesson = LOG_TOPIC_RE.test(topicText);

    if (!Array.isArray(att.targetMilestones) || att.targetMilestones.length === 0) {
      att.targetMilestones = isLogLesson
        ? [...(def.targetMilestones || [])]
        : [
            `Step 1 (Recall): State the key definitions and rules for ${att.topic || att.title || 'this topic'}`,
            'Step 2 (Apply): Use the rule on a guided example, showing every step',
            'Step 3 (Combine): Solve a multi-step problem and justify each transformation',
            'Step 4 (Verify): Check the result against the conditions of the problem'
          ];
    }
    if (!att.courseMaterials || !String(att.courseMaterials).trim()) {
      if (isLogLesson) {
        att.courseMaterials = def.courseMaterials;
        att.courseMaterialsSource = att.courseMaterialsSource || def.courseMaterialsSource;
      }
    }
    const firstProbA = att.exercisePool?.levelA?.[0]?.problem || '';
    const isPlaceholderPool = /Solve step by step using the course reference sheet|Apply the core formula from the reference sheet/i.test(firstProbA);
    const hasProblems = ['levelA', 'levelB', 'levelC'].some(k => att.exercisePool?.[k]?.length);
    if (isLogLesson && (!hasProblems || isPlaceholderPool)) {
      att.exercisePool = JSON.parse(JSON.stringify(def.exercisePool));
    }
    att.poolMissing = !['levelA', 'levelB', 'levelC'].some(k => att.exercisePool?.[k]?.length);
    return att;
  }

  /**
   * Returns a deep copy of an attachment that is safe to send to a student's browser: no answer keys, hints
   * with worked solutions, or reference exercise answers. Grading happens only on the server.
   */
  toStudentSafeAttachment(att) {
    if (!att) return att;
    const copy = JSON.parse(JSON.stringify(att));
    const stripList = (list) => (Array.isArray(list) ? list.map(p => {
      const clean = { ...p };
      ANSWER_KEY_FIELDS.forEach(f => delete clean[f]);
      return clean;
    }) : list);
    if (copy.exercisePool) {
      for (const key of ['diagnostic', 'levelA', 'levelB', 'levelC']) {
        if (copy.exercisePool[key]) copy.exercisePool[key] = stripList(copy.exercisePool[key]);
      }
    }
    delete copy.exerciseBank;
    if (copy.referenceExercise) {
      copy.referenceExercise = { ...copy.referenceExercise };
      ANSWER_KEY_FIELDS.forEach(f => delete copy.referenceExercise[f]);
    }
    delete copy.initialHint;
    delete copy.teacherInstructions;
    delete copy.teacherTelemetry;
    return copy;
  }

  /** Finds the problem definition (with answer key) in the stored pool for a tier + zero-based index. */
  findPoolProblem(attachment, tier, index) {
    const pool = attachment?.exercisePool || {};
    if (tier === 'DIAG') return pool.diagnostic?.[0] || null;
    const all = Array.isArray(pool[`level${tier}`]) ? pool[`level${tier}`] : [];
    const selected = all.filter(p => p.selected !== false);
    const active = selected.length > 0 ? selected : all;
    return active[index] || null;
  }

  /**
   * Server-side check of one answer submitted by a student. Returns whether it is correct and whether the
   * student actually showed work. The client never sees the answer key.
   */
  gradeStudentAnswer({ attachmentId, tier = 'A', index = 0, answer = '', steps = [], hasPhoto = false }) {
    const attachment = this.getAttachment(attachmentId);
    const problem = this.findPoolProblem(attachment, tier, Number(index) || 0);
    const stepList = (Array.isArray(steps) ? steps : []).map(s => String(s || '')).filter(Boolean);
    const combined = stepList.length > 0 && !stepList.includes(answer)
      ? `${stepList.join(' -> ')} = ${answer}`
      : (answer || stepList.join(' -> '));
    const verdict = checkAnswer(combined, problem?.targetAnswer || '');
    const showedWork = Boolean(hasPhoto) || stepList.some(looksLikeWorkStep) || looksLikeWorkStep(answer);
    return {
      gradable: verdict.gradable,
      correct: verdict.gradable && verdict.correct && showedWork,
      valueCorrect: verdict.correct,
      showedWork,
      combinedAnswer: combined
    };
  }

  /**
   * Saves or creates a new Classroom Socratic Add-on attachment
   */
  createAttachment(attachmentData) {
    const id = attachmentData.id || `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const attachment = this.ensureCompleteAttachment({
      id,
      ...attachmentData,
      createdAt: new Date().toISOString()
    });
    this.attachmentsStore.set(id, attachment);
    if (!attachmentData.isPreviewOnly && attachment.title) {
      this.saveLessonPlanToLibrary({
        id: `plan-${id}`,
        ...attachment
      });
    } else {
      this.saveStoreToFile();
    }
    return attachment;
  }

  /**
   * Retrieves an attachment by ID, adopting dynamically if created from Google Classroom
   */
  getAttachment(id) {
    if (this.attachmentsStore.has(id)) {
      return this.ensureCompleteAttachment(this.attachmentsStore.get(id));
    }
    const defaultAtt = this.attachmentsStore.get('att-demo-socratic-01');
    if (defaultAtt && id && id !== 'undefined' && id !== 'null') {
      const adopted = {
        ...defaultAtt,
        id,
        adoptedFrom: 'att-demo-socratic-01',
        createdAt: new Date().toISOString()
      };
      this.attachmentsStore.set(id, adopted);
      this.saveStoreToFile();
      return adopted;
    }
    return defaultAtt || null;
  }

  /**
   * Retrieves or initializes a student submission for a given attachment & student
   */
  getOrCreateSubmission({ attachmentId, submissionId, studentName = 'Student', studentEmail = '', currentLevel = 'B', studentMode = 'step_by_step' }) {
    const key = submissionId || `sub-${attachmentId}-${studentEmail || 'anon'}`;
    if (this.submissionsStore.has(key)) {
      return this.submissionsStore.get(key);
    }

    const newSub = {
      submissionId: key,
      attachmentId,
      studentName,
      studentEmail,
      currentLevel,
      studentMode,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      submittedAt: null,
      masteryLevel: 10,
      turnsCount: 0,
      suggestedScore: null,
      assignedScore: null,
      maxScore: 100,
      transcript: [],
      aiAnalysis: null
    };
    this.submissionsStore.set(key, newSub);
    this.saveStoreToFile();
    return newSub;
  }

  /**
   * Verifies the student showed work: a handwritten photo that the server actually received, intermediate steps
   * with real mathematical content, or a chained derivation. Client-sent flags (hasPhoto, isStepByStep,
   * stepsCount) are deliberately ignored because a student could forge them.
   */
  hasStepByStepProof(item = {}, submission = null) {
    if (!item) return false;
    const transcriptHasPhoto = Boolean(submission) && (submission.transcript || []).some(
      m => m.role === 'user' && Array.isArray(m.attachments) && m.attachments.some(a => a && a.data)
    );
    if (item.hasPhoto && transcriptHasPhoto) return true;
    if (Array.isArray(item.steps) && item.steps.some(looksLikeWorkStep)) return true;
    return looksLikeWorkStep(item.answer);
  }

  /**
   * Compares a student's submitted answer against a problem's targetAnswer (see answerChecker.js)
   */
  isSubmittedAnswerCorrect(studentRaw = '', targetRaw = '') {
    return checkAnswer(studentRaw, targetRaw).correct;
  }

  /**
   * Evaluates student transcript & per-problem submitted answers to generate pedagogically rigorous rubric and suggested score.
   */
  analyzeTranscript(submission) {
    const studentDisplayName = submission.studentName || 'Student';
    const studentFirstName = studentDisplayName.split(' ')[0];
    const attachment = this.getAttachment(submission.attachmentId) || this.getAttachment('att-demo-socratic-01');
    const targetMilestones = Array.isArray(attachment?.targetMilestones) && attachment.targetMilestones.length > 0
      ? attachment.targetMilestones
      : [
          "Applied Power Law: $2\\log_3(6) = \\log_3(36)$",
          "Applied Quotient Law: $\\log_3(36) - \\log_3(4) = \\log_3(9)$",
          "Evaluated numerical value: $\\log_3(9) = 2$"
        ];

    const userMessages = (submission.transcript || []).filter(m => m.role === 'user');
    let solvedList = Array.isArray(submission.solvedProblems) ? [...submission.solvedProblems] : [];

    // Also extract any submitted answers from transcript if solvedProblems was not explicitly populated
    if (solvedList.length === 0 && userMessages.length > 0) {
      userMessages.forEach((m, idx) => {
        const match = String(m.content || '').match(/Submitted Answer for Problem\s+([^:]+):\*\*\s*(.+)/i);
        if (match) {
          solvedList.push({
            key: `parsed:${idx}`,
            id: match[1].trim(),
            answer: match[2].trim()
          });
        }
      });
    }

    if (userMessages.length === 0 && solvedList.length === 0 && (submission.photosSubmittedCount || 0) === 0) {
      return {
        suggestedScore: 0,
        maxScore: 100,
        masteryPercentage: 0,
        socraticIndependenceScore: 0,
        summary: `${studentDisplayName} has not submitted any answers or Socratic responses yet.`,
        milestonesAchieved: [],
        milestonesPending: targetMilestones,
        misconceptionsIdentified: ["No student responses completed before submission"],
        suggestedTeacherFeedback: "No work was submitted. Please complete the problems and click Submit Answer."
      };
    }

    // Build lookup map of pool problems from attachment
    const pool = attachment?.exercisePool || {};
    const problemMap = new Map();
    ['diagnostic', 'levelA', 'levelB', 'levelC'].forEach(groupKey => {
      const tierCode = groupKey === 'diagnostic' ? 'DIAG' : groupKey.replace('level', '');
      const arr = Array.isArray(pool[groupKey]) ? pool[groupKey] : [];
      const selectedArr = arr.filter(p => p.selected !== false);
      const activeArr = selectedArr.length > 0 ? selectedArr : arr;
      activeArr.forEach((p, idx) => {
        if (p.id) problemMap.set(String(p.id).toUpperCase(), p);
        problemMap.set(`${tierCode}${idx + 1}`, p);
        problemMap.set(`${tierCode}:${idx}`, p);
      });
    });

    const activeTier = submission.currentLevel || 'A';
    const tierArr = Array.isArray(pool[`level${activeTier}`]) ? pool[`level${activeTier}`] : [];
    const selectedTierArr = tierArr.filter(p => p.selected !== false);
    const activeTierProblems = selectedTierArr.length > 0 ? selectedTierArr : tierArr;
    const totalExpected = Number(submission.totalSelectedProblems) || (activeTierProblems.length > 0 ? activeTierProblems.length : 3);

    // Exclude extra diagnostic check item if student also answered the tier problems
    if (solvedList.length > 1 && solvedList.some(x => x.key === 'DIAG' || x.tier === 'DIAG')) {
      const nonDiag = solvedList.filter(x => x.key !== 'DIAG' && x.tier !== 'DIAG');
      if (nonDiag.length > 0) {
        solvedList = nonDiag;
      }
    }

    // Case 1: Student submitted explicit problem answers via the Submit Answer button
    if (solvedList.length > 0) {
      const achieved = [];
      const pending = [];
      const misconceptions = [];
      let correctCount = 0;

      let manualReviewCount = 0;
      const perProblem = [];

      solvedList.forEach((item, idx) => {
        const lookupKey = String(item.key || '').toUpperCase();
        const lookupId = String(item.id || '').toUpperCase();
        // The answer key ALWAYS comes from the stored lesson plan, never from data sent by the student's browser
        const probDef = this.findPoolProblem(attachment, item.tier || activeTier, Number.isInteger(item.index) ? item.index : idx)
          || problemMap.get(lookupKey) || problemMap.get(lookupId) || null;
        const probLabel = `Problem ${idx + 1}`;
        const studentAns = String(item.answer || '').trim();
        const expectedAns = probDef?.targetAnswer || '';
        const rawProbText = probDef?.problem || item.problem || '';
        const probPrompt = rawProbText ? ` (${rawProbText})` : '';

        const verdict = checkAnswer(studentAns, expectedAns);
        const valueMatches = verdict.correct;
        const stepByStepShown = this.hasStepByStepProof(item, submission);

        if (!verdict.gradable) {
          manualReviewCount++;
          perProblem.push({ label: probLabel, gradable: false, correct: false });
          misconceptions.push(
            `🔎 ${probLabel}${probPrompt}: No automatic answer key for this problem — teacher review required (student answered: "${studentAns}").`
          );
        } else if (valueMatches && stepByStepShown) {
          correctCount++;
          perProblem.push({ label: probLabel, gradable: true, correct: true });
          achieved.push(`✅ ${probLabel}${probPrompt}: Step-by-Step Proof & Final Answer ("${studentAns}") — Verified Correct`);
        } else if (valueMatches && !stepByStepShown) {
          perProblem.push({ label: probLabel, gradable: true, correct: false });
          misconceptions.push(
            `⚠️ ${probLabel}${probPrompt}: Submitted bare single number ("${studentAns}") without step-by-step derivation. Students must write intermediate steps (e.g., applying the rule before the final number) to prove knowledge.`
          );
        } else {
          perProblem.push({ label: probLabel, gradable: true, correct: false });
          misconceptions.push(
            `⚠️ ${probLabel}${probPrompt}: Submitted "${studentAns}" — this does not match the expected result.`
          );
        }
      });

      // Only unlock curriculum milestones proportionally to CORRECT answers
      const milestoneRatio = Math.min(1, correctCount / Math.max(1, totalExpected));
      const milestonesToUnlock = Math.floor(milestoneRatio * targetMilestones.length);
      targetMilestones.forEach((m, idx) => {
        if (idx < milestonesToUnlock) {
          achieved.push(m);
        } else {
          pending.push(m);
        }
      });

      const answeredCount = solvedList.length;
      const accuracyRatio = answeredCount > 0 ? (correctCount / answeredCount) : 0;

      // Problems without a usable answer key cannot be auto-graded; they are excluded from the denominator
      // and flagged for the teacher instead of counting as wrong.
      const ungradableInTier = activeTierProblems.filter(p => !checkAnswer('x', p.targetAnswer || '').gradable).length;
      const gradableTotal = Math.max(1, totalExpected - ungradableInTier);
      const needsManualGrading = manualReviewCount > 0 || ungradableInTier >= totalExpected;

      // Score and Mastery are strictly proportional to CORRECT answers out of gradable problems (0 correct = 0 score)
      const score = Math.min(100, Math.max(0, Math.round((correctCount / gradableTotal) * 100)));
      const mastery = score;

      const hintsPenalty = Math.min(25, (submission.hintsUsedCount || 0) * 8);
      const independence = correctCount === 0 ? 0 : Math.max(10, Math.min(100, score - hintsPenalty));

      const summary = `${studentDisplayName} submitted answers for ${answeredCount} of ${totalExpected} selected problem(s) in Level ${activeTier}, answering ${correctCount} of ${answeredCount} accurately (${Math.round(accuracyRatio * 100)}% accuracy).`;

      let teacherFeedback = '';
      if (correctCount >= totalExpected) {
        teacherFeedback = `Excellent work, ${studentFirstName}! You accurately solved all ${totalExpected} problem(s) in Level ${activeTier} and demonstrated strong mastery of ${attachment?.title || 'the lesson objectives'}.`;
      } else if (correctCount > 0) {
        teacherFeedback = `Good progress, ${studentFirstName}! You solved ${correctCount} of ${totalExpected} problem(s) correctly in Level ${activeTier}. Review the feedback on the remaining problem(s) to reach 100% mastery.`;
      } else {
        teacherFeedback = `${studentFirstName}, none of the ${answeredCount} submitted answer(s) matched the expected solutions (0% accuracy). Please review the rules in the reference sheet and work through each step carefully.`;
      }

      return {
        suggestedScore: score,
        maxScore: 100,
        masteryPercentage: mastery,
        achievedLevel: submission.currentLevel || (mastery >= 85 ? 'C' : mastery >= 60 ? 'B' : 'A'),
        studentMode: submission.studentMode || 'step_by_step',
        socraticIndependenceScore: independence,
        summary,
        milestonesAchieved: achieved,
        milestonesPending: pending,
        misconceptionsIdentified: misconceptions,
        perProblem,
        needsManualGrading,
        suggestedTeacherFeedback: teacherFeedback
      };
    }

    // Case 2: Socratic dialogue turns without explicit problem answer submissions
    const fullText = userMessages.map(m => m.content.toLowerCase()).join(' ');

    const hasPowerLaw = /power|exponent|6\s*\^\s*2|36|k\s*\*\s*log/i.test(fullText);
    const hasQuotientLaw = /quotient|division|divide|36\s*\/\s*4/i.test(fullText);
    const hasFinalEval = /3\s*squared|log_3\(9\)\s*=\s*2/i.test(fullText);

    const achieved = [];
    const pending = [];
    if (hasPowerLaw) achieved.push(targetMilestones[0] || "Applied Power Law");
    else if (targetMilestones[0]) pending.push(targetMilestones[0]);

    if (hasQuotientLaw) achieved.push(targetMilestones[1] || "Applied Quotient/Product Law");
    else if (targetMilestones[1]) pending.push(targetMilestones[1]);

    if (hasFinalEval) achieved.push(targetMilestones[2] || "Evaluated final expression");
    else if (targetMilestones[2]) pending.push(targetMilestones[2]);

    const mathKeywordMatches = fullText.match(/log|law|power|quotient|product|base|rule|exponent|step|equal|divide|minus|plus|\d/g) || [];
    const isNonsenseOrOffTopic = mathKeywordMatches.length < 2 && userMessages.length >= 1;

    let score = 0;
    let mastery = submission.masteryLevel || 10;
    let misconceptions = [];
    let summary = "";
    let teacherFeedback = "";

    if (isNonsenseOrOffTopic) {
      score = Math.min(20, userMessages.length * 5);
      mastery = Math.min(20, mastery);
      misconceptions.push("Student provided off-topic or non-mathematical responses instead of applying lesson rules.");
      summary = `Student sent ${userMessages.length} chat message(s), but they did not contain mathematical steps or submitted problem answers.`;
      teacherFeedback = `${studentFirstName}, please complete the problem steps and use the Submit Answer button to turn in your solution for each problem.`;
    } else if (achieved.length >= 3) {
      score = Math.min(50, Math.max(90, mastery));
      mastery = Math.min(50, Math.max(90, mastery));
      summary = `${studentDisplayName} demonstrated clear step-by-step reasoning across ${userMessages.length} Socratic dialogue response(s).`;
      teacherFeedback = `Great reasoning in the Socratic dialogue, ${studentFirstName}!`;
    } else if (achieved.length >= 1) {
      score = Math.min(50, Math.max(60 + achieved.length * 10, mastery));
      mastery = Math.min(50, Math.max(50 + achieved.length * 15, mastery));
      summary = `${studentDisplayName} made partial progress in the Socratic dialogue, achieving ${achieved.length} milestone(s).`;
      teacherFeedback = `Good start on the Socratic steps, ${studentFirstName}. Be sure to click Submit Answer for each problem in the set.`;
    } else {
      score = Math.max(35, mastery);
      mastery = Math.max(30, mastery);
      misconceptions.push("Incomplete problem steps before submission.");
      summary = `${studentDisplayName} started the Socratic dialogue (${userMessages.length} message(s)) but did not complete all problem steps.`;
      teacherFeedback = "Review the reference sheet and submit your final answer for each assigned problem.";
    }

    return {
      suggestedScore: score,
      maxScore: 100,
      masteryPercentage: mastery,
      achievedLevel: submission.currentLevel || (mastery >= 85 ? 'C' : mastery >= 60 ? 'B' : 'A'),
      studentMode: submission.studentMode || 'step_by_step',
      socraticIndependenceScore: isNonsenseOrOffTopic ? 10 : Math.round(score * 0.9),
      summary,
      milestonesAchieved: achieved,
      milestonesPending: pending,
      misconceptionsIdentified: misconceptions,
      suggestedTeacherFeedback: teacherFeedback
    };
  }

  /**
   * Saves updated student submission state (chat transcript & progress)
   */
  updateSubmission(submissionId, updateData) {
    const existing = this.submissionsStore.get(submissionId) || {
      submissionId,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      transcript: []
    };

    // Fields derived or owned by the server/teacher can never be set by the student's browser
    const PROTECTED = ['aiAnalysis', 'suggestedScore', 'masteryLevel', 'assignedScore', 'teacherFeedback', 'gradePassedBackAt', 'gradePassedBackLive'];
    const safeUpdate = { ...updateData };
    PROTECTED.forEach(f => delete safeUpdate[f]);

    const updated = {
      ...existing,
      ...safeUpdate,
      updatedAt: new Date().toISOString()
    };

    // Auto-analyze transcript & solvedProblems (the server grades against the stored answer key)
    const userMessages = (updated.transcript || []).filter(m => m.role === 'user');
    const solvedCount = Array.isArray(updated.solvedProblems) ? updated.solvedProblems.length : 0;
    if (userMessages.length > 0 || solvedCount > 0 || (updated.photosSubmittedCount || 0) > 0) {
      updated.aiAnalysis = this.analyzeTranscript(updated);
      updated.suggestedScore = updated.aiAnalysis.suggestedScore;
      updated.masteryLevel = updated.aiAnalysis.masteryPercentage;
      updated.mistakesCount = Math.max(
        Number(updated.mistakesCount) || 0,
        updated.aiAnalysis.misconceptionsIdentified?.length || 0
      );
    }

    this.submissionsStore.set(submissionId, updated);
    this.markResultsDirty(updated.attachmentId);
    this.saveStoreToFile();
    return updated;
  }

  /**
   * Records the teacher's grade and, when possible, writes it to Google Classroom through the Add-ons API
   * (courses.courseWork.addOnAttachments.studentSubmissions.patch → pointsEarned).
   * The result states honestly whether Classroom was updated (liveApi) or only the local/Drive record.
   */
  async passGradeToClassroom({ submissionId, assignedGrade, teacherComment = '', accessToken = '' }) {
    const submission = this.getSubmission(submissionId);
    if (!submission) {
      return { success: false, liveApi: false, message: `Submission ${submissionId} was not found.` };
    }

    // Always record the grade + comment first so it is saved to Drive even if Classroom is unreachable
    submission.assignedScore = assignedGrade;
    submission.teacherFeedback = teacherComment;
    submission.gradePassedBackAt = new Date().toISOString();
    submission.gradePassedBackLive = false;
    this.submissionsStore.set(submission.submissionId, submission);

    const attachment = this.attachmentsStore.get(submission.attachmentId);
    const courseId = submission.courseId || attachment?.courseId;
    const itemId = submission.itemId || attachment?.itemId;
    const classroomAttachmentId = attachment?.classroomAttachmentId;
    const classroomSubmissionId = submission.classroomSubmissionId;

    let result = {
      success: true,
      liveApi: false,
      assignedGrade,
      teacherComment,
      timestamp: submission.gradePassedBackAt
    };

    const missing = [];
    if (!accessToken) missing.push('a Google sign-in (teacher access token)');
    if (!courseId || !itemId) missing.push('the Classroom course/assignment');
    if (!classroomAttachmentId) missing.push('the Classroom attachment id');
    if (!classroomSubmissionId) missing.push('the Classroom student submission id (the student must open the work from Classroom)');

    if (missing.length === 0) {
      try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const classroom = google.classroom({ version: 'v1', auth: oauth2Client });
        const patchRes = await classroom.courses.courseWork.addOnAttachments.studentSubmissions.patch({
          courseId,
          itemId,
          attachmentId: classroomAttachmentId,
          submissionId: classroomSubmissionId,
          updateMask: 'pointsEarned',
          requestBody: { pointsEarned: Number(assignedGrade) }
        });
        submission.gradePassedBackLive = true;
        result = {
          ...result,
          liveApi: true,
          message: `Grade ${assignedGrade} sent to Google Classroom for ${submission.studentName || 'student'}.`,
          result: patchRes.data
        };
      } catch (err) {
        console.warn('[ClassroomService] Classroom API grade passback error:', err.message);
        result.message = `Grade saved, but Google Classroom rejected the update: ${err.message}`;
        result.classroomError = err.message;
      }
    } else {
      result.message = `Grade saved to the results sheet. Not sent to Google Classroom — missing ${missing.join(', ')}.`;
      result.missing = missing;
    }

    this.markResultsDirty(submission.attachmentId);
    this.saveStoreToFile();
    return result;
  }


  /**
   * Computes automatic student performance cohorts (Group C / Group B / Group A) and class telemetry
   */
  getCohortSummary(attachmentId) {
    const submissions = this.getSubmissionsForAttachment(attachmentId);
    const attachment = this.getAttachment(attachmentId) || this.getAttachment('att-demo-socratic-01');
    const cohorts = {
      C: {
        id: 'C',
        label: 'Group C — Advanced Mastery (85–100%)',
        recommendation: 'Ready for enrichment, olympiad proofs, and peer mentoring.',
        students: []
      },
      B: {
        id: 'B',
        label: 'Group B — Proficient / Developing (60–84%)',
        recommendation: 'On track. Reinforce multi-step operational priority (Power Law before Quotient Law).',
        students: []
      },
      A: {
        id: 'A',
        label: 'Group A — Foundational / Needs Intervention (<60%)',
        recommendation: 'Schedule targeted teacher mini-workshop on foundational logarithm laws.',
        students: []
      }
    };

    let totalTimeSec = 0;
    let totalMistakes = 0;
    let totalRepetitions = 0;

    for (const sub of submissions) {
      const mastery = sub.masteryLevel ?? sub.aiAnalysis?.masteryPercentage ?? 0;
      const mistakes = sub.mistakesCount ?? (sub.aiAnalysis?.misconceptionsIdentified?.length || 0);
      const hints = sub.hintsUsedCount ?? 0;
      const reps = sub.repetitionsCount ?? Math.max(1, Math.ceil((sub.turnsCount || 2) / 2));
      const activeTime = sub.activeTimeSec ?? ((sub.turnsCount || 3) * 65);

      totalTimeSec += activeTime;
      totalMistakes += mistakes;
      totalRepetitions += reps;

      let groupKey = 'B';
      if (mastery >= 85 && mistakes <= 1) {
        groupKey = 'C';
      } else if (mastery < 60 || mistakes >= 3) {
        groupKey = 'A';
      }

      cohorts[groupKey].students.push({
        submissionId: sub.submissionId,
        studentName: sub.studentName || 'Student',
        studentEmail: sub.studentEmail || '',
        status: sub.status || 'IN_PROGRESS',
        masteryLevel: mastery,
        currentLevel: sub.currentLevel || groupKey,
        diagnosticStartLevel: sub.diagnosticStartLevel || 'A',
        activeTimeSec: activeTime,
        mistakesCount: mistakes,
        hintsUsedCount: hints,
        repetitionsCount: reps,
        photosSubmittedCount: sub.photosSubmittedCount || 0,
        suggestedScore: sub.suggestedScore ?? mastery
      });
    }

    const count = submissions.length || 1;
    return {
      teacherTelemetry: attachment?.teacherTelemetry || {
        materialPrepTimeSec: 145,
        lessonPlanPrepTimeSec: 95,
        totalPrepTimeSec: 240,
        prepMethodsUsed: ['typing', 'ai_lesson_draft']
      },
      classMetrics: {
        totalStudents: submissions.length,
        avgActiveTimeSec: Math.round(totalTimeSec / count),
        avgMistakes: Number((totalMistakes / count).toFixed(1)),
        avgRepetitions: Number((totalRepetitions / count).toFixed(1))
      },
      cohorts
    };
  }

  /**
   * Mobile QR Bridge session management for phone camera capture (Teacher Block 1 & Student Work)
   */
  createMobileSession({ mode = 'student_solution', targetId = '' }) {
    const token = `mob-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const session = {
      token,
      mode,
      targetId,
      createdAt: new Date().toISOString(),
      uploads: []
    };
    this.mobileSessions.set(token, session);
    return session;
  }

  getMobileSession(token) {
    return this.mobileSessions.get(token) || null;
  }

  saveMobileUpload(token, { mimeType = 'image/jpeg', data, note = '' }) {
    let session = this.mobileSessions.get(token);
    if (!session) {
      session = { token, mode: 'generic', createdAt: new Date().toISOString(), uploads: [] };
      this.mobileSessions.set(token, session);
    }
    const uploadItem = {
      id: `up-${Date.now()}`,
      mimeType,
      data,
      note,
      uploadedAt: new Date().toISOString()
    };
    session.uploads.push(uploadItem);
    return uploadItem;
  }

  /**
   * Automatically recognizes the document type, curriculum framework, grade level, subject, and key concepts
   * of any material loaded from Drive, Local File, Classroom Stream, or Internet Search.
   */
  recognizeMaterialMetadata({ title = '', content = '', source = 'Loaded Material', curriculumHint = '', gradeHint = '', subjectHint = '', categoryHint = '' } = {}) {
    const combined = `${title} ${content} ${source}`.toLowerCase();

    // 1. Recognize Document Type & Category ('curriculum' vs 'material')
    let recognizedType = 'Formula Reference Sheet & Worked Examples';
    let docCategory = categoryHint || 'material';
    if (/expectation|standard|curriculum|ministry|syllabus|competenc|strand|outcome|ced\b/i.test(combined)) {
      recognizedType = 'Curriculum Standard & Expectations';
      if (!categoryHint) docCategory = 'curriculum';
    } else if (/lab|experiment|procedure|hypothesis|apparatus|titration/i.test(combined)) {
      recognizedType = 'Laboratory & Inquiry Guide';
    } else if (/reference sheet|formula|identity|law|rule|theorem/i.test(combined)) {
      recognizedType = 'Formula Reference Sheet & Worked Examples';
    } else if (/problem set|worksheet|quiz|exam|assignment|exercise bank/i.test(combined)) {
      recognizedType = 'Worked Examples & Problem Set';
    }
    if (categoryHint === 'curriculum') {
      recognizedType = 'Curriculum Standard & Expectations';
    }

    // 2. Recognize Subject (Check Mathematics FIRST so "base" in logarithms never matches Chemistry!)
    let subject = subjectHint || 'Mathematics';
    if (/\\log|logarithm|polynomial|trigonometr|calculus|derivative|integral|quadratic|parabola|asymptote|vector|binomial|mhf4u|mcv4u|mcr3u|mpm2d|mth1w/i.test(combined)) {
      subject = 'Mathematics';
    } else if (/stoichiometr|molar mass|limiting reactant|enthalpy|acids?\s+and\s+bases?|ph\s+buffer|equilibrium|periodic table|moles?\b|sch3u|sch4u|chemistry/i.test(combined)) {
      subject = 'Chemistry';
    } else if (/photosynthes|calvin cycle|respiration|atp|chloroplast|mitosis|meiosis|dna|gene|sbi3u|sbi4u|biology/i.test(combined)) {
      subject = 'Biology';
    } else if (/newton|kinematic|free-body|momentum|torque|circuit|magnetic|inclined plane|sph3u|sph4u|physics/i.test(combined)) {
      subject = 'Physics';
    } else if (/rhetoric|ethos|pathos|logos|fallac|essay|shakespeare|literary|history/i.test(combined)) {
      subject = 'English & Humanities';
    } else if (/algorithm|python|java|recursion|binary search|comp sci/i.test(combined)) {
      subject = 'Computer Science';
    }

    // 3. Recognize Grade Level
    let gradeLevel = gradeHint || 'Grade 12';
    const gradeMatch = combined.match(/grade\s*(9|10|11|12)/i);
    if (gradeMatch) {
      gradeLevel = `Grade ${gradeMatch[1]}`;
    } else if (/mth1w|alg\s*1|algebra\s*i\b/i.test(combined)) {
      gradeLevel = 'Grade 9';
    } else if (/mpm2d|completing the square|quadratic formula/i.test(combined)) {
      gradeLevel = 'Grade 10';
    } else if (/mcr3u|sch3u|sbi3u|sph3u|pre-calculus 11/i.test(combined)) {
      gradeLevel = 'Grade 11';
    } else if (/mhf4u|mcv4u|sch4u|sbi4u|sph4u|ap\s|ib\s|a-level/i.test(combined)) {
      gradeLevel = 'Grade 12';
    }

    // 4. Recognize Curriculum Framework
    let curriculumCode = curriculumHint || 'canada';
    let curriculumLabel = 'Canada MHF4U / Ontario OSS';
    if (/\bib\b|international baccalaureate|math aa|math ai|diploma programme/i.test(combined)) {
      curriculumCode = 'ib';
      curriculumLabel = 'IB Diploma (International Baccalaureate)';
    } else if (/a-level|igcse|cambridge|edexcel/i.test(combined)) {
      curriculumCode = 'uk-alevel';
      curriculumLabel = 'UK Cambridge IGCSE & A-Level';
    } else if (/\bap\b|college board|ap calculus|ap chemistry|ap biology|ap physics/i.test(combined)) {
      curriculumCode = 'us-ap';
      curriculumLabel = 'US College Board AP';
    } else if (/ngss|next generation science/i.test(combined)) {
      curriculumCode = 'us-ngss';
      curriculumLabel = 'US NGSS Science Standards';
    } else if (/common core|ccss/i.test(combined)) {
      curriculumCode = 'us';
      curriculumLabel = 'US Common Core (CCSS)';
    } else if (/british columbia|\bbc\b|alberta|math 20-1|math 30-1|pre-calculus 12/i.test(combined)) {
      curriculumCode = 'canada-bc-ab';
      curriculumLabel = 'Canada BC / Alberta Curriculum';
    } else {
      curriculumCode = 'canada';
      curriculumLabel = `Canada Ontario OSS (${subject === 'Mathematics' ? 'MHF4U/MCV4U' : subject})`;
    }

    // 5. Count formulas & extract clean title
    const formulaMatches = String(content || '').match(/\$[^$]+\$|\\(?:log|frac|sqrt|sum|int|vec|sin|cos|tan)/g) || [];
    const firstLine = String(content || '')
      .split('\n')
      .map(l => l.replace(/^[#*\-\s]+/, '').trim())
      .find(l => l.length > 4) || '';
    const resolvedTitle = (title || firstLine || `${gradeLevel} ${subject} Reference Material`).slice(0, 110);

    return {
      title: resolvedTitle,
      docCategory,
      recognizedType,
      curriculumCode,
      curriculum: curriculumLabel,
      subject,
      gradeLevel,
      source: source || 'Teacher Studio',
      formulasCount: formulaMatches.length,
      summary: `${recognizedType} • ${curriculumLabel} • ${gradeLevel} ${subject} (${formulaMatches.length} formula/rule expressions recognized)`
    };
  }

  /**
   * Saves a curriculum or reference material item into the persistent library so it appears in the dropdowns.
   */
  saveMaterialToLibrary(payload = {}) {
    const meta = this.recognizeMaterialMetadata({
      title: payload.title,
      content: payload.content,
      source: payload.source,
      curriculumHint: payload.curriculumCode || payload.curriculum,
      gradeHint: payload.gradeLevel,
      subjectHint: payload.subject,
      categoryHint: payload.docCategory
    });

    const id = payload.id || `lib-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const item = {
      id,
      title: payload.title || meta.title,
      docCategory: payload.docCategory || meta.docCategory || 'material',
      curriculum: payload.curriculum || meta.curriculum,
      curriculumCode: payload.curriculumCode || meta.curriculumCode,
      recognizedType: payload.recognizedType || meta.recognizedType,
      subject: payload.subject || meta.subject,
      gradeLevel: payload.gradeLevel || meta.gradeLevel,
      source: payload.source || meta.source,
      content: String(payload.content || '').trim(),
      excerpt: String(payload.content || '').trim().slice(0, 240),
      summary: meta.summary,
      isCustomSaved: true,
      savedAt: new Date().toISOString()
    };

    this.customMaterialsStore.set(id, item);

    // If saved as a curriculum (or has curriculum info), also register it in customCurriculaStore
    const curCode = item.docCategory === 'curriculum'
      ? `custom-cur-${id}`
      : (item.curriculumCode || `custom-cur-${id}`);
    const curLabel = item.docCategory === 'curriculum'
      ? `${item.title} (${item.gradeLevel} ${item.subject})`
      : item.curriculum;
    if (curCode && curLabel) {
      this.customCurriculaStore.set(curCode, {
        code: curCode,
        label: curLabel,
        subject: item.subject,
        gradeLevel: item.gradeLevel,
        content: item.content
      });
    }

    this.saveStoreToFile();
    return item;
  }

  getCustomMaterials() {
    const arr = Array.from(this.customMaterialsStore.values());
    arr.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    return arr;
  }

  getCustomCurricula() {
    return Array.from(this.customCurriculaStore.values());
  }

  /**
   * Saves a created Lesson Plan (including Level A/B/C descriptions & prompts and 30-problem pool) to the persistent library.
   */
  saveLessonPlanToLibrary(planData = {}) {
    const id = planData.id || `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const savedPlan = {
      id,
      title: planData.title || 'Untitled Socratic Lesson Plan',
      curriculum: planData.curriculum || 'canada',
      gradeLevel: planData.gradeLevel || 'Grade 12',
      subject: planData.subject || 'Mathematics',
      learningGoal: planData.learningGoal || '',
      targetMilestones: Array.isArray(planData.targetMilestones) ? planData.targetMilestones : [],
      teacherInstructions: planData.teacherInstructions || '',
      courseMaterials: planData.courseMaterials || '',
      courseMaterialsSource: planData.courseMaterialsSource || 'Teacher Studio',
      levelConfigs: planData.levelConfigs || null,
      exercisePool: planData.exercisePool || null,
      repetitionsPerTier: Number(planData.repetitionsPerTier) || 3,
      studentMode: planData.studentMode || 'step_by_step',
      socraticStyle: planData.socraticStyle || 'guided_scaffold',
      savedAt: new Date().toISOString()
    };

    this.savedLessonPlansStore.set(id, savedPlan);
    this.saveStoreToFile();
    return savedPlan;
  }

  getSavedLessonPlans() {
    const list = Array.from(this.savedLessonPlansStore.values());
    list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    return list;
  }
}

export const classroomService = new ClassroomService();
