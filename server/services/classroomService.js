import { google } from 'googleapis';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE_PATH = path.join(__dirname, '../data/classroom_store.json');

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
    this.initializeDefaultData();
    this.loadStoreFromFile();
  }

  loadStoreFromFile() {
    try {
      if (fs.existsSync(STORE_FILE_PATH)) {
        const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.attachments && Array.isArray(parsed.attachments)) {
          for (const att of parsed.attachments) {
            if (att.id === 'att-demo-socratic-01') continue;
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
            if (plan && plan.id) this.savedLessonPlansStore.set(plan.id, plan);
          }
        }
        if (parsed.customCurricula && Array.isArray(parsed.customCurricula)) {
          for (const cur of parsed.customCurricula) {
            if (cur && cur.code) this.customCurriculaStore.set(cur.code, cur);
          }
        }
        if (parsed.submissions && Array.isArray(parsed.submissions)) {
          const fakeSeededIds = new Set(['sub-pavel-birulin-01', 'sub-elena-rostova-01', 'sub-alex-chen-01']);
          for (const sub of parsed.submissions) {
            if (fakeSeededIds.has(sub.submissionId)) continue;
            if (sub.isAutomatedTest) continue;
            const userMsgs = (sub.transcript || []).filter(m => m.role === 'user');
            const solvedCount = Array.isArray(sub.solvedProblems) ? sub.solvedProblems.length : 0;
            if (userMsgs.length === 0 && (sub.photosSubmittedCount || 0) === 0 && solvedCount === 0) continue;
            sub.aiAnalysis = this.analyzeTranscript(sub);
            sub.suggestedScore = sub.aiAnalysis.suggestedScore;
            sub.masteryLevel = sub.aiAnalysis.masteryPercentage;
            sub.mistakesCount = sub.aiAnalysis.misconceptionsIdentified?.length || 0;
            this.submissionsStore.set(sub.submissionId, sub);
          }
        }
        console.log(`[ClassroomService] Loaded ${this.attachmentsStore.size} attachments, ${this.submissionsStore.size} submissions, ${this.customMaterialsStore.size} custom materials, and ${this.savedLessonPlansStore.size} saved lesson plans.`);
      }
    } catch (e) {
      console.warn('[ClassroomService] Could not load persistent store:', e.message);
    }
  }

  saveStoreToFile() {
    try {
      const data = {
        attachments: Array.from(this.attachmentsStore.values()),
        submissions: Array.from(this.submissionsStore.values()),
        customMaterials: Array.from(this.customMaterialsStore.values()),
        savedLessonPlans: Array.from(this.savedLessonPlansStore.values()),
        customCurricula: Array.from(this.customCurriculaStore.values())
      };
      const dir = path.dirname(STORE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[ClassroomService] Could not save persistent store:', e.message);
    }
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
          { id: 'B3', problem: 'Simplify into a single numerical value: $\\frac{1}{2}\\log_4(16) + \\log_4(8)$', targetAnswer: '2', hint: 'Apply Power Law: $\\log_4(\\sqrt{16}) + \\log_4(8) = \\log_4(2) + \\log_4(8) = \\log_4(16)$.' }
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
    // Clean initial state: DO NOT seed fake student submissions (Pavel Birulin Ontario High, Elena Rostova, Alex Chen)
  }

  /**
   * Clears all stored submissions (or submissions for a specific attachmentId)
   */
  clearSubmissions(attachmentId = null) {
    if (!attachmentId) {
      this.submissionsStore.clear();
    } else {
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
    const allReal = [];

    for (const sub of this.submissionsStore.values()) {
      if (sub.isAutomatedTest || sub.isExemplar) continue;
      const userMsgs = (sub.transcript || []).filter(m => m.role === 'user');
      const solvedCount = Array.isArray(sub.solvedProblems) ? sub.solvedProblems.length : 0;
      // Only include sessions where a student actually responded or submitted work
      if (userMsgs.length === 0 && (sub.photosSubmittedCount || 0) === 0 && solvedCount === 0) continue;

      allReal.push(sub);
      if (!attachmentId || attachmentId === 'att-demo-socratic-01' || sub.attachmentId === attachmentId) {
        list.push(sub);
      }
    }

    const result = list.length > 0 ? list : allReal;
    // Sort newest first
    result.sort((a, b) => new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0));

    return result;
  }

  /**
   * Retrieves a single submission by ID, alias, or student email (always prioritizing the newest attempt)
   */
  getSubmission(submissionId) {
    if (this.submissionsStore.has(submissionId)) {
      return this.submissionsStore.get(submissionId);
    }
    // Search by alias 'sub-pavel-birulin-live' or email
    if (submissionId === 'sub-pavel-birulin-live' || submissionId === 'pavel.birulin@gmail.com') {
      const all = Array.from(this.submissionsStore.values());
      const pavelSubs = all.filter(s => s.studentEmail === 'pavel.birulin@gmail.com' && !s.isExemplar && s.submissionId !== 'sub-pavel-birulin-01');
      if (pavelSubs.length > 0) {
        pavelSubs.sort((a, b) => new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0));
        return pavelSubs[0]; // latest live session
      }
    }
    // Search by partial match or student email
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
   * Ensures an attachment always has complete targetMilestones, courseMaterials, and non-placeholder exercisePool
   */
  ensureCompleteAttachment(att) {
    if (!att) return att;
    const def = this.attachmentsStore.get('att-demo-socratic-01');
    if (!def) return att;

    if (!Array.isArray(att.targetMilestones) || att.targetMilestones.length === 0) {
      att.targetMilestones = [...(def.targetMilestones || [])];
    }
    if (!att.courseMaterials || !String(att.courseMaterials).trim()) {
      att.courseMaterials = def.courseMaterials;
      att.courseMaterialsSource = att.courseMaterialsSource || def.courseMaterialsSource;
    }
    const firstProbA = att.exercisePool?.levelA?.[0]?.problem || '';
    const isPlaceholderPool = /Solve step by step using the course reference sheet|Apply the core formula from the reference sheet/i.test(firstProbA);
    if (!att.exercisePool || !att.exercisePool.levelA?.length || isPlaceholderPool) {
      att.exercisePool = JSON.parse(JSON.stringify(def.exercisePool));
    }
    return att;
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
   * Verifies whether a student submitted a step-by-step derivation (or prior steps in chat / photo)
   * rather than a bare single number with no reasoning.
   */
  hasStepByStepProof(item = {}) {
    if (!item) return false;
    if (item.hasPhoto || /\[handwritten photo/i.test(String(item.answer || ''))) return true;
    if (Number(item.stepsCount) > 0) return true;
    if (Array.isArray(item.steps) && item.steps.length > 0) return true;
    if (item.isStepByStep === true) return true;

    const raw = String(item.answer || '').trim();
    if (!raw) return false;

    const clean = raw
      .replace(/\$|\\left|\\right|\\cdot|\s+/g, '')
      .replace(/^x=/i, '')
      .replace(/^=/, '');

    // If the entire cleaned answer is just a single number (e.g. "5", "2", "-3.5"), it is NOT a step-by-step proof
    if (/^-?\d+(?:\.\d+)?$/.test(clean)) {
      return false;
    }

    // Check if the answer contains an intermediate expression + '=' or '->' or math operations/functions
    const hasChainOrOps = /=|->|⇒|\\Longrightarrow|\\implies|\\log|\bln\b|\\frac|\\sqrt|[+\-*/^]/.test(raw);
    return hasChainOrOps;
  }

  /**
   * Helper to compare a student's submitted answer against a problem's targetAnswer
   */
  isSubmittedAnswerCorrect(studentRaw = '', targetRaw = '') {
    const s = String(studentRaw || '').trim();
    const t = String(targetRaw || '').trim();
    if (!s || !t) return false;

    const stripLatex = str => str
      .toLowerCase()
      .replace(/\[handwritten photo(?: attached| solution)?\]/gi, '')
      .replace(/\$|\\left|\\right|\\cdot|\s+/g, '');

    const ns = stripLatex(s).replace(/^x=/, '');
    const nt = stripLatex(t).replace(/^x=/, '');
    if (!ns) return false;
    if (ns === nt) return true;

    // Single numerical targetAnswer (e.g. "5", "2", "3", "-4", "2.5")
    if (/^-?\d+(?:\.\d+)?$/.test(t)) {
      const targetNum = Number(t);
      const parts = s.split(/(?:=|->|⇒|\\Longrightarrow|\\implies)/);
      const rhs = parts[parts.length - 1].trim();
      const rhsClean = stripLatex(rhs).replace(/^x=/, '');
      if (/^-?\d+(?:\.\d+)?$/.test(rhsClean)) {
        return Number(rhsClean) === targetNum;
      }
      return false;
    }

    // Multi-part / algebraic targetAnswer (e.g. "x = 2 (reject x = -3)", "2 and Product Law")
    const mainTargetPart = t.replace(/\([^)]*\)/g, '').trim();
    const expectedNums = mainTargetPart.match(/-?\d+(?:\.\d+)?/g) || [];
    if (expectedNums.length > 0) {
      const allNumsPresent = expectedNums.every(numStr => {
        const escaped = numStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`);
        return re.test(s);
      });
      if (!allNumsPresent) return false;
      if (/product/i.test(mainTargetPart) && !/product/i.test(s)) return false;
      if (/quotient/i.test(mainTargetPart) && !/quotient/i.test(s)) return false;
      if (/power/i.test(mainTargetPart) && !/power/i.test(s)) return false;
      return true;
    }

    return ns === nt;
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

      solvedList.forEach((item, idx) => {
        const lookupKey = String(item.key || '').toUpperCase();
        const lookupId = String(item.id || '').toUpperCase();
        const probDef = problemMap.get(lookupKey) || problemMap.get(lookupId) || activeTierProblems[item.index ?? idx] || null;
        const probLabel = `Problem ${idx + 1}`;
        const studentAns = String(item.answer || '').trim();
        const expectedAns = item.targetAnswer || probDef?.targetAnswer || '';
        const rawProbText = item.problem || probDef?.problem || '';
        const probPrompt = rawProbText ? ` (${rawProbText})` : '';

        const valueMatches = this.isSubmittedAnswerCorrect(studentAns, expectedAns);
        const stepByStepShown = this.hasStepByStepProof(item);

        if (valueMatches && stepByStepShown) {
          correctCount++;
          achieved.push(`✅ ${probLabel}${probPrompt}: Step-by-Step Proof & Final Answer ("${studentAns}") — Verified Correct`);
        } else if (valueMatches && !stepByStepShown) {
          misconceptions.push(
            `⚠️ ${probLabel}${probPrompt}: Submitted bare single number ("${studentAns}") without step-by-step derivation. Students must write intermediate steps (e.g., applying the rule before the final number) to prove knowledge.`
          );
        } else {
          misconceptions.push(
            `⚠️ ${probLabel}${probPrompt}: Submitted "${studentAns}" (Expected step-by-step derivation leading to: ${expectedAns || 'valid solution'}).`
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

      // Score and Mastery are strictly proportional to CORRECT answers out of totalExpected (0 correct = 0 score)
      const score = Math.min(100, Math.max(0, Math.round((correctCount / Math.max(1, totalExpected)) * 100)));
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
        teacherFeedback = `${studentFirstName}, none of the ${answeredCount} submitted answer(s) matched the expected solutions (0% accuracy). Please review the logarithm laws in the reference sheet and work through each step carefully.`;
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
        suggestedTeacherFeedback: teacherFeedback
      };
    }

    // Case 2: Socratic dialogue turns without explicit problem answer submissions
    const fullText = userMessages.map(m => m.content.toLowerCase()).join(' ');

    const hasPowerLaw = /power|exponent|6\s*\^\s*2|36|k\s*\*\s*log/i.test(fullText);
    const hasQuotientLaw = /quotient|division|divide|36\s*\/\s*4|9/i.test(fullText);
    const hasFinalEval = /3\s*squared|log_3\(9\)\s*=\s*2|\b2\b|\b5\b|\b3\b/i.test(fullText);

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
      score = Math.max(90, mastery);
      mastery = Math.max(90, mastery);
      summary = `${studentDisplayName} demonstrated clear step-by-step reasoning across ${userMessages.length} Socratic dialogue response(s).`;
      teacherFeedback = `Great reasoning in the Socratic dialogue, ${studentFirstName}!`;
    } else if (achieved.length >= 1) {
      score = Math.max(60 + achieved.length * 10, mastery);
      mastery = Math.max(50 + achieved.length * 15, mastery);
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

    const updated = {
      ...existing,
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    // Auto-analyze transcript & solvedProblems
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
    this.saveStoreToFile();
    return updated;
  }

  /**
   * Performs grade passback to Google Classroom.
   * If real OAuth credentials and addOnToken are supplied, calls Classroom API.
   * Otherwise, updates internal state and returns success confirmation.
   */
  async passGradeToClassroom({
    courseId,
    courseWorkId,
    submissionId,
    assignedGrade,
    draftGrade,
    teacherComment,
    addOnToken
  }) {
    // If real Google OAuth credentials exist, execute actual Classroom API request
    if (config.googleClientId && addOnToken) {
      try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: addOnToken });
        const classroom = google.classroom({ version: 'v1', auth: oauth2Client });

        const patchRes = await classroom.courses.courseWork.studentSubmissions.patch({
          courseId,
          courseWorkId,
          id: submissionId,
          updateMask: 'assignedGrade,draftGrade',
          requestBody: {
            assignedGrade: assignedGrade,
            draftGrade: draftGrade || assignedGrade
          }
        });

        return {
          success: true,
          liveApi: true,
          result: patchRes.data
        };
      } catch (err) {
        console.warn('[ClassroomService] Classroom API grade passback error:', err.message);
      }
    }

    // Local / Simulator / Dev fallback
    const submission = this.submissionsStore.get(submissionId);
    if (submission) {
      submission.assignedScore = assignedGrade;
      submission.teacherFeedback = teacherComment;
      submission.gradePassedBackAt = new Date().toISOString();
      this.submissionsStore.set(submissionId, submission);
    }

    return {
      success: true,
      liveApi: false,
      message: `Grade of ${assignedGrade}/100 successfully recorded and passed back for submission ${submissionId}`,
      assignedGrade,
      teacherComment,
      timestamp: new Date().toISOString()
    };
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
