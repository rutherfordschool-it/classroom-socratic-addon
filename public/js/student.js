/**
 * Student Socratic Inquiry Workspace Controller (Architecture v2 — 100% English)
 * Implements:
 * - Point 6a: New Student Diagnostic Calibration + Progressive Lesson Plan Flow (A -> B -> C)
 * - Multimodal Handwritten Photo Solution Upload (Formulas, Graphs, Asymptotes, Margin Notes) via Phone Camera / QR Bridge
 * - Point 7a: Automatic Student Telemetry (Active Time, Time per Problem, Mistakes, Hints, Repetitions)
 */
import { MathTextEditor } from './math-editor.js?v=20261112b';
import { initFullWindowBridge } from './full-window-bridge.js?v=20261113d';

const urlParams = new URLSearchParams(window.location.search);
const attachmentId = urlParams.get('attachmentId') || 'att-demo-socratic-01';
const studentSlug = (urlParams.get('studentName') || urlParams.get('login_hint') || 'student').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const submissionId = urlParams.get('submissionId') || `sub-${attachmentId}-${studentSlug}`;
const isTeacherPreview = urlParams.get('preview') === 'true';

let activityConfig = null;
let chatHistory = [];
let currentMastery = 0;
let currentMilestoneIndex = 0;
let isWaitingForAI = false;
let studentMathEditor = null;

// Point 6a: Adaptive Diagnostic & Finite Level Progression State (No Infinite Loop)
let diagnosticStatus = 'COMPLETED'; // Start directly on Problem 1 of N in the selected tier
let diagnosticStartLevel = 'A';
let currentLevel = 'A';
let levelProgression = ['A'];
let currentProblemIndexInTier = 0;
let solvedProblems = new Map(); // problemKey -> { answer, submittedAt }
let allProblemsCompleted = false;
let lastUserStepForCurrentProblem = '';
let currentProblemSteps = []; // Stores step-by-step messages entered for the current problem

// Point 7a: Student Telemetry State
let activeTimeSec = 0;
let currentProblemStartSec = 0;
let timePerProblemSec = [];
let mistakesCount = 0;
let hintsUsedCount = 0;
let repetitionsCount = 1;
let photosSubmittedCount = 0;

// Pending Handwritten Photo Attachment State
let pendingPhotoAttachment = null; // { mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,...', label: '' }
let studentMobileToken = null;
let studentMobilePoll = null;

document.addEventListener('DOMContentLoaded', async () => {
  initFullWindowBridge({ pageType: 'student' });
  initStudentMathEditor();
  initStudentTimer();
  initStudentPhotoControls();
  await loadActivityDetails();
  initializeGreeting();
  setupEventListeners();
});

function initStudentMathEditor() {
  const wrap = document.getElementById('studentMathEditorWrap');
  if (!wrap) return;
  studentMathEditor = new MathTextEditor(wrap, {
    compact: true,
    minHeight: '56px',
    placeholder: 'Write your step-by-step derivation (e.g., log_2(4*8) = log_2(32) = 5) — single numbers alone are not accepted...',
    onEnterSubmit: () => sendMessage()
  });
  const stepBanner = document.getElementById('stepByStepInstructionBanner');
  if (stepBanner) renderMathSafe(stepBanner);
}

/**
 * Point 7a: Live Student Active Time Tracker
 */
function initStudentTimer() {
  const timerEl = document.getElementById('studentTimerDisplay');
  setInterval(() => {
    if (document.hidden) return;
    activeTimeSec++;
    if (timerEl) {
      const m = Math.floor(activeTimeSec / 60).toString().padStart(2, '0');
      const s = (activeTimeSec % 60).toString().padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }
  }, 1000);
}

/**
 * Returns the exact list of problems selected by the teacher in Teacher View for a given tier ('A' | 'B' | 'C')
 */
function getSelectedProblemsForTier(tier = currentLevel) {
  const pool = activityConfig?.exercisePool || {};
  const list = pool[`level${tier}`] || [];
  const selectedOnly = list.filter(x => x.selected !== false);
  return selectedOnly.length > 0 ? selectedOnly : list;
}

/**
 * Verifies whether the student provided step-by-step reasoning (either prior steps in chat,
 * a multi-step equation chain with operators/functions, or a handwritten photo) rather than a bare single number.
 */
function isStepByStepWorkShown(answerText = '', priorSteps = [], hasPhoto = false) {
  if (hasPhoto) return true;
  if (Array.isArray(priorSteps) && priorSteps.length > 0) return true;

  const raw = String(answerText || '').trim();
  if (!raw) return false;

  const clean = raw
    .replace(/\$|\\left|\\right|\\cdot|\s+/g, '')
    .replace(/^x=/i, '')
    .replace(/^=/, '');

  // If the cleaned answer is just a bare single number (e.g., "5", "2", "-3.5"), it is NOT a step-by-step proof
  if (/^-?\d+(?:\.\d+)?$/.test(clean)) {
    return false;
  }

  return /=|->|⇒|\\Longrightarrow|\\implies|\\log|\bln\b|\\frac|\\sqrt|[+\-*/^]/.test(raw);
}

/**
 * Strictly verify whether a student's submitted answer matches the problem's targetAnswer
 */
function isSubmittedAnswerCorrect(studentRaw = '', targetRaw = '') {
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
 * Count how many problems in the specified tier have been submitted
 */
function getSolvedCountInTier(tier = currentLevel) {
  const list = getSelectedProblemsForTier(tier);
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    if (solvedProblems.has(`${tier}${i + 1}`)) count++;
  }
  return count;
}

/**
 * Count how many problems in the specified tier were answered CORRECTLY
 */
function getCorrectCountInTier(tier = currentLevel) {
  const list = getSelectedProblemsForTier(tier);
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = solvedProblems.get(`${tier}${i + 1}`);
    if (entry && entry.isCorrect) count++;
  }
  return count;
}

function updateTelemetryHUD() {
  const repsEl = document.getElementById('studentRepsDisplay');
  const hintsEl = document.getElementById('studentHintsDisplay');
  const tierTotal = Math.max(1, getSelectedProblemsForTier(currentLevel).length);
  const solvedInTier = getSolvedCountInTier(currentLevel);
  if (repsEl) {
    repsEl.textContent = `${solvedInTier}/${tierTotal}`;
  }
  if (hintsEl) hintsEl.textContent = String(hintsUsedCount);
}

/**
 * Update Concept Mastery % and Milestones strictly from CORRECTLY answered problems (0% when 0 correct)
 */
function updateMasteryAndMilestonesFromSubmissions() {
  const tierTotal = Math.max(1, getSelectedProblemsForTier(currentLevel).length);
  const solvedInTier = getSolvedCountInTier(currentLevel);
  const correctInTier = getCorrectCountInTier(currentLevel);

  // Mastery percentage is strictly proportional to CORRECT answers in the selected tier
  currentMastery = Math.min(100, Math.round((correctInTier / tierTotal) * 100));
  const masteryPercentEl = document.getElementById('masteryPercent');
  const masteryFillEl = document.getElementById('masteryFill');
  if (masteryPercentEl) {
    masteryPercentEl.textContent = `${currentMastery}% (${correctInTier}/${tierTotal} Correct • ${solvedInTier}/${tierTotal} Submitted)`;
  }
  if (masteryFillEl) {
    masteryFillEl.style.width = `${currentMastery}%`;
  }

  // Milestones advance only when problems are answered CORRECTLY
  const totalMilestones = (activityConfig?.targetMilestones || []).length || 4;
  if (correctInTier === 0) {
    currentMilestoneIndex = 0;
  } else if (correctInTier >= tierTotal) {
    currentMilestoneIndex = totalMilestones;
  } else {
    currentMilestoneIndex = Math.min(
      totalMilestones,
      Math.round((correctInTier / tierTotal) * totalMilestones)
    );
  }
  renderMilestones();
}

/**
 * Synchronize the top Current Problem Banner and Progress Counters with the exact number of problems
 * selected in Teacher View for the current tier (e.g., 3 problems, never looping).
 */
function syncCurrentProblemUI() {
  const pool = activityConfig?.exercisePool || {};
  const tierList = getSelectedProblemsForTier(currentLevel);
  const tierTotal = Math.max(1, tierList.length);
  const solvedInTier = getSolvedCountInTier(currentLevel);

  const progressBadge = document.getElementById('poolProgressBadge');
  if (progressBadge) {
    progressBadge.textContent = `✅ ${solvedInTier} / ${tierTotal} Answered`;
  }

  const counterTag = document.getElementById('problemCounterTag');
  const statusBadge = document.getElementById('currentProblemStatusBadge');
  const completedBanner = document.getElementById('poolCompletedBanner');
  const nextBtn = document.getElementById('generateSimilarBtn');
  const bottomSubmitBtn = document.getElementById('submitAnswerBottomBtn');

  updateMasteryAndMilestonesFromSubmissions();

  if (allProblemsCompleted) {
    if (counterTag) {
      counterTag.textContent = `🎉 All ${tierTotal} of ${tierTotal} Selected Problems Completed!`;
      counterTag.style.background = '#137333';
    }
    if (statusBadge) {
      statusBadge.textContent = '✅ All Answered';
      statusBadge.style.background = '#e6f4ea';
      statusBadge.style.color = '#137333';
      statusBadge.style.borderColor = '#ceead6';
    }
    setPromptMathText(`🎉 **All ${tierTotal} selected problems in Level ${currentLevel} have been completed!** Click **🎓 Turn In Assignment to Classroom** below to submit your work (or click another Level pill above if you want extra practice).`);
    if (completedBanner) completedBanner.style.display = 'flex';
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = `✅ All ${tierTotal} Problems Completed`;
    }
    if (bottomSubmitBtn) {
      bottomSubmitBtn.disabled = true;
      bottomSubmitBtn.textContent = '✅ All Answered';
    }
    diagnosticStatus = 'COMPLETED';
    updateProgressionPills();
    updateTelemetryHUD();
    return;
  }

  if (completedBanner) completedBanner.style.display = 'none';
  if (bottomSubmitBtn) {
    bottomSubmitBtn.disabled = false;
    bottomSubmitBtn.textContent = '✅ Submit Answer';
  }

  if (diagnosticStatus === 'IN_DIAGNOSTIC') {
    const diagItem = pool.diagnostic?.[0] || {
      problem: activityConfig.prompt || 'Simplify into a single numerical value: $2\\log_3(6) - \\log_3(4)$'
    };
    activityConfig.prompt = diagItem.problem;
    setPromptMathText(diagItem.problem);
    if (counterTag) {
      counterTag.textContent = `🧭 Diagnostic Check ( precedes ${tierTotal} Selected Pool Problem${tierTotal === 1 ? '' : 's'} )`;
      counterTag.style.background = '#1a73e8';
    }
    if (statusBadge) {
      const diagDone = solvedProblems.has('DIAG');
      statusBadge.textContent = diagDone ? '✅ Answer Submitted' : '⏳ Awaiting Answer';
      statusBadge.style.background = diagDone ? '#e6f4ea' : '#fef7e0';
      statusBadge.style.color = diagDone ? '#137333' : '#b06000';
      statusBadge.style.borderColor = diagDone ? '#ceead6' : '#fde293';
    }
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.textContent = `⏭️ Start Problem 1 of ${tierTotal}`;
    }
    updateProgressionPills();
    updateTelemetryHUD();
    return;
  }

  // Clamp index to valid range [0 .. tierTotal - 1] without wrapping around
  currentProblemIndexInTier = Math.max(0, Math.min(currentProblemIndexInTier, tierTotal - 1));
  const curItem = tierList[currentProblemIndexInTier] || { problem: activityConfig.prompt };
  const curKey = `${currentLevel}${currentProblemIndexInTier + 1}`;
  const problemNumber = currentProblemIndexInTier + 1;

  activityConfig.prompt = curItem.problem;
  setPromptMathText(curItem.problem);

  const lvlDescEl = document.getElementById('activeLevelDescriptionBanner');
  if (lvlDescEl) {
    const customDesc = activityConfig?.levelConfigs?.[currentLevel]?.description;
    lvlDescEl.textContent = customDesc ? `🎯 Level ${currentLevel} Focus: ${customDesc}` : '';
  }

  if (counterTag) {
    counterTag.textContent = `Problem ${problemNumber} of ${tierTotal} (Level ${currentLevel})`;
    counterTag.style.background = '#1a73e8';
  }

  const isCurrentSolved = solvedProblems.has(curKey);
  if (statusBadge) {
    statusBadge.textContent = isCurrentSolved ? '✅ Answer Submitted' : '⏳ Awaiting Answer';
    statusBadge.style.background = isCurrentSolved ? '#e6f4ea' : '#fef7e0';
    statusBadge.style.color = isCurrentSolved ? '#137333' : '#b06000';
    statusBadge.style.borderColor = isCurrentSolved ? '#ceead6' : '#fde293';
  }

  if (nextBtn) {
    if (problemNumber >= tierTotal) {
      nextBtn.disabled = true;
      nextBtn.textContent = `🏁 Final Problem (${tierTotal}/${tierTotal})`;
    } else {
      nextBtn.disabled = false;
      nextBtn.textContent = `⏭️ Next Problem (${problemNumber}/${tierTotal})`;
    }
  }

  updateProgressionPills();
  updateTelemetryHUD();
}

/**
 * Update Adaptive Progression Bar (Diagnostic -> Level A -> Level B -> Level C)
 */
function updateProgressionPills() {
  const pills = {
    DIAG: document.getElementById('stagePillDiag'),
    A: document.getElementById('stagePillA'),
    B: document.getElementById('stagePillB'),
    C: document.getElementById('stagePillC')
  };

  const isStageFullySolved = (stage) => {
    if (stage === 'DIAG') return solvedProblems.has('DIAG');
    const total = getSelectedProblemsForTier(stage).length;
    return total > 0 && getSolvedCountInTier(stage) >= total;
  };

  const resetPill = (el, done = false) => {
    if (!el) return;
    if (done) {
      el.style.background = '#e6f4ea';
      el.style.color = '#137333';
      el.style.border = '1px solid #ceead6';
    } else {
      el.style.background = '#f1f3f4';
      el.style.color = '#5f6368';
      el.style.border = '1px solid #dadce0';
    }
  };

  const highlightActivePill = (el) => {
    if (!el) return;
    el.style.background = '#e8f0fe';
    el.style.color = '#1967d2';
    el.style.border = '2px solid #1a73e8';
  };

  resetPill(pills.DIAG, isStageFullySolved('DIAG') || diagnosticStatus === 'COMPLETED');
  resetPill(pills.A, isStageFullySolved('A'));
  resetPill(pills.B, isStageFullySolved('B'));
  resetPill(pills.C, isStageFullySolved('C'));

  if (!allProblemsCompleted) {
    if (diagnosticStatus === 'IN_DIAGNOSTIC') {
      highlightActivePill(pills.DIAG);
    } else {
      highlightActivePill(pills[currentLevel] || pills.A);
    }
  }

  const levelBadge = document.getElementById('levelBadge');
  if (levelBadge) {
    if (allProblemsCompleted) {
      levelBadge.textContent = `🎉 LEVEL ${currentLevel} COMPLETED`;
      levelBadge.className = 'badge badge-green';
    } else if (diagnosticStatus === 'IN_DIAGNOSTIC') {
      levelBadge.textContent = '🧭 LEVEL DIAGNOSTIC';
      levelBadge.className = 'badge badge-blue';
    } else {
      const names = { A: 'LEVEL A: FOUNDATIONAL', B: 'LEVEL B: STANDARD', C: 'LEVEL C: ADVANCED' };
      levelBadge.textContent = names[currentLevel] || `LEVEL ${currentLevel}`;
      levelBadge.className = currentLevel === 'C' ? 'badge badge-amber' : currentLevel === 'A' ? 'badge badge-green' : 'badge badge-blue';
    }
  }
}

async function loadActivityDetails() {
  try {
    const res = await fetch(`/api/attachment/${attachmentId}`);
    const data = await res.json();
    if (data.success && data.attachment) {
      activityConfig = data.attachment;
    }
  } catch (err) {
    console.warn('Using fallback activity config');
  }

  if (!activityConfig) {
    activityConfig = {
      id: attachmentId,
      title: 'Laws of Logarithms (Product, Quotient, Power Rules)',
      curriculum: 'canada',
      gradeLevel: 'Grade 12',
      subject: 'Mathematics',
      courseName: 'MHF4U Advanced Functions',
      topic: 'Laws of Logarithms (Product, Quotient, Power)',
      learningGoal: 'Master applying the Product, Quotient, and Power laws of logarithms to simplify expressions and solve equations.',
      prompt: 'Simplify into a single numerical value: $2\\log_3(6) - \\log_3(4)$',
      initialHint: 'Apply the Power Law first to absorb the multiplier 2 into an exponent.',
      socraticStyle: 'guided_scaffold',
      studentMode: 'step_by_step',
      currentLevel: 'A',
      adaptiveConfig: { autoDiagnoseNewStudent: true, startingLevel: 'AUTO', repetitionsPerTier: 3 },
      selectedProvider: 'gemini',
      selectedModel: 'gemini-3.1-flash-lite',
      targetMilestones: [
        'Step 1 (Diagnostic Check): Verify basic logarithm definition ($b^y = x \\Longleftrightarrow \\log_b(x) = y$)',
        'Step 2 (Power Law): Absorb scalar coefficients into exponents ($2\\log_3(6) = \\log_3(36)$)',
        'Step 3 (Quotient Law): Combine same-base logarithms ($\\log_3(36) - \\log_3(4) = \\log_3(9) = 2$)',
        'Step 4 (Mastery Verification): Complete progressive Level A → B → C mastery verification'
      ]
    };
  }

  const defaultMilestones = [
    'Step 1 (Diagnostic Check): Verify basic logarithm definition ($b^y = x \\Longleftrightarrow \\log_b(x) = y$)',
    'Step 2 (Power Law): Absorb scalar coefficients into exponents ($2\\log_3(6) = \\log_3(36)$)',
    'Step 3 (Quotient & Product Laws): Combine same-base logarithms ($\\log_3(36) - \\log_3(4) = \\log_3(9) = 2$)',
    'Step 4 (Mastery Verification): Solve adaptive problems step by step and check domain restrictions ($x > 0$)'
  ];

  const defaultReferenceMaterials = `**Reference Sheet: Product, Quotient, and Power Laws of Logarithms (MHF4U Grade 12)**

1. **Product Law**: $\\log_b(xy) = \\log_b(x) + \\log_b(y)$ for $b > 0, b \\neq 1, x > 0, y > 0$
   Base Example: $\\log_2(4) + \\log_2(8) = \\log_2(4 \\cdot 8) = \\log_2(32) = 5$

2. **Quotient Law**: $\\log_b(x/y) = \\log_b(x) - \\log_b(y)$
   Base Example: $\\log_3(27) - \\log_3(3) = \\log_3(27/3) = \\log_3(9) = 2$

3. **Power Law**: $\\log_b(x^k) = k \\cdot \\log_b(x)$
   **Critical Priority Rule**: Always absorb front coefficients using the Power Law BEFORE combining terms with the Quotient or Product Law.
   Base Multi-Step Example: $2\\log_3(6) - \\log_3(4) = \\log_3(6^2) - \\log_3(4) = \\log_3(36/4) = \\log_3(9) = 2$`;

  if (!Array.isArray(activityConfig.targetMilestones) || activityConfig.targetMilestones.length === 0) {
    activityConfig.targetMilestones = defaultMilestones;
  }

  if (!activityConfig.courseMaterials || !activityConfig.courseMaterials.trim()) {
    activityConfig.courseMaterials = defaultReferenceMaterials;
    activityConfig.courseMaterialsSource = activityConfig.courseMaterialsSource || 'Teacher Material Studio (MHF4U Reference Sheet)';
  }

  const hasGenericPlaceholderPool = /Solve step by step using the course reference sheet|Apply the core formula from the reference sheet/i.test(
    activityConfig.exercisePool?.levelA?.[0]?.problem || ''
  );

  if (
    !activityConfig.exercisePool ||
    (!activityConfig.exercisePool.levelA?.length && !activityConfig.exercisePool.levelB?.length) ||
    hasGenericPlaceholderPool
  ) {
    activityConfig.exercisePool = {
      diagnostic: [
        { id: 'diag-1', problem: 'Quick Diagnostic Check: What is the exact value of $\\log_3(9)$, and which rule lets us combine $\\log_3(2) + \\log_3(4.5)$ into a single logarithm?', targetAnswer: '2 and Product Law', hint: 'Ask yourself: $3$ to what power gives $9$?' }
      ],
      levelA: [
        { id: 'A1', problem: 'Simplify into a single logarithm and evaluate: $\\log_2(4) + \\log_2(8)$', targetAnswer: '5', hint: 'Use the Product Law: $\\log_2(4 \\cdot 8) = \\log_2(32) = 5$.' },
        { id: 'A2', problem: 'Simplify into a single logarithm and evaluate: $\\log_3(27) - \\log_3(3)$', targetAnswer: '2', hint: 'Use the Quotient Law: $\\log_3(27 / 3) = \\log_3(9) = 2$.' },
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
    };
  }

  // Start directly on Problem 1 of the selected tier so the student works on the exact N problems chosen in Teacher View
  currentLevel = activityConfig.currentLevel || 'A';
  diagnosticStartLevel = currentLevel;
  diagnosticStatus = 'COMPLETED';
  currentProblemIndexInTier = 0;
  levelProgression = [currentLevel];

  // Synchronize subject & gradeLevel with actual Lesson Plan topic so badge never mismatches content
  const inspectTopic = `${activityConfig.title || ''} ${activityConfig.learningGoal || ''} ${activityConfig.prompt || ''}`;
  if (/\\log_|\bln\b|logarithm|asymptote|factor theorem|radian|trigonometr|3-space/i.test(inspectTopic)) {
    activityConfig.subject = 'Mathematics';
    activityConfig.gradeLevel = 'Grade 12';
  } else if (/quadratic|completing the square|discriminant/i.test(inspectTopic)) {
    activityConfig.subject = 'Mathematics';
    activityConfig.gradeLevel = 'Grade 10';
  } else if (/photosynthesis|calvin cycle|thylakoid|cellular respiration|chloroplast/i.test(inspectTopic)) {
    activityConfig.subject = 'Biology';
    activityConfig.gradeLevel = 'Grade 11';
  } else if (/stoichiometr|limiting reactant|molar mass|2\\text\{H\}_2\s*\+/i.test(inspectTopic)) {
    activityConfig.subject = 'Chemistry';
    activityConfig.gradeLevel = 'Grade 11';
  } else if (/newton|free-body|inclined plane/i.test(inspectTopic)) {
    activityConfig.subject = 'Physics';
    activityConfig.gradeLevel = 'Grade 11';
  }

  // Populate UI Header & Sidebar
  document.getElementById('courseBadge').textContent = `${activityConfig.gradeLevel} • ${activityConfig.subject}`;
  document.getElementById('modelBadge').textContent = `${(activityConfig.selectedProvider || 'gemini').toUpperCase()} • ${activityConfig.selectedModel || 'gemini-3.1-flash'}`;
  document.getElementById('activityTitle').textContent = activityConfig.title;

  const goalEl = document.getElementById('activityGoal');
  if (goalEl) {
    goalEl.innerHTML = formatMarkdownAndMath(activityConfig.learningGoal);
    renderMathSafe(goalEl);
  }

  const modeSwitcher = document.getElementById('studentModeSwitcher');
  if (modeSwitcher && activityConfig.studentMode) {
    modeSwitcher.value = activityConfig.studentMode;
  }

  syncCurrentProblemUI();
  renderReferenceMaterial();
}

function normalizeMathDelimiters(raw = '') {
  let str = String(raw || '')
    .replace(/\\iff\b/g, '\\Longleftrightarrow')
    .replace(/\\implies\b/g, '\\Longrightarrow');

  // 1. Heal any previously corrupted "$... = $...$$" or trailing "$$" inline sequences
  str = str.replace(/\$([^$\n]+?)\$(\\[A-Za-z][^$\n]*?)\$\$/g, '$$$1$2$$');
  str = str.replace(/(\$[^$\n]+?)\$\$(?!\$)/g, '$1$');

  // 2. Tokenize by valid existing math blocks ($...$ or $$...$$) so we NEVER inject $ inside an existing math block
  const segments = str.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return segments.map((seg, idx) => {
    if (idx % 2 === 1) return seg; // Already delimited math block — keep untouched
    return seg.replace(/(^|[\s:(])((?:\d+\s*\*?\s*)?\\(?:log|ln|frac|sqrt|cdot|Longleftrightarrow|Longrightarrow|neq|leq|geq)[A-Za-z0-9_{}()^+\-=<>.\s/*]*)/gm, (m, pre, expr) => {
      const trimmed = expr.trim();
      if (!trimmed) return m;
      return `${pre}$${trimmed}$`;
    });
  }).join('');
}

function renderMathSafe(el, attempt = 0) {
  if (!el) return;
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } catch (e) { /* ignore */ }
  } else if (attempt < 20) {
    setTimeout(() => renderMathSafe(el, attempt + 1), 120);
  }
}

function setPromptMathText(text) {
  const promptEl = document.getElementById('activityPrompt');
  if (!promptEl) return;
  promptEl.innerHTML = formatMarkdownAndMath(text);
  renderMathSafe(promptEl);
}

function renderReferenceMaterial() {
  const card = document.getElementById('referenceMaterialCard');
  const sourceLabel = document.getElementById('referenceSourceLabel');
  const contentBox = document.getElementById('referenceMaterialContent');
  const toggleBtn = document.getElementById('toggleMaterialViewBtn');
  if (!card || !contentBox) return;

  if (activityConfig.courseMaterials && activityConfig.courseMaterials.trim().length > 0) {
    card.style.display = 'block';
    sourceLabel.textContent = activityConfig.courseMaterialsSource || 'Teacher Material Studio';
    const normalized = normalizeMathDelimiters(activityConfig.courseMaterials);
    contentBox.innerHTML = formatMarkdownAndMath(normalized);
    contentBox.style.display = 'block';
    if (toggleBtn) toggleBtn.textContent = 'Collapse';
    renderMathSafe(contentBox);

    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const isHidden = contentBox.style.display === 'none';
        contentBox.style.display = isHidden ? 'block' : 'none';
        toggleBtn.textContent = isHidden ? 'Collapse' : 'Expand';
        if (isHidden) renderMathSafe(contentBox);
      };
    }
  }
}

function renderMilestones() {
  const list = document.getElementById('milestoneList');
  if (!list) return;
  list.innerHTML = '';

  const milestones = activityConfig.targetMilestones || [];
  milestones.forEach((m, idx) => {
    const isCompleted = idx < currentMilestoneIndex;
    const isActive = idx === currentMilestoneIndex;

    const item = document.createElement('div');
    item.style.cssText = `
      display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.55rem 0.65rem;
      border-radius: 6px; font-size: 0.8rem;
      background: ${isCompleted ? '#e6f4ea' : isActive ? '#e8f0fe' : '#f8f9fa'};
      border: 1px solid ${isCompleted ? '#ceead6' : isActive ? '#d2e3fc' : '#dadce0'};
      color: ${isCompleted ? '#137333' : isActive ? '#1967d2' : '#5f6368'};
      font-weight: ${isActive || isCompleted ? '600' : '400'};
    `;
    item.innerHTML = `
      <span>${isCompleted ? '✅' : isActive ? '🎯' : '⚪'}</span>
      <span class="wysiwyg-math-block" style="line-height:1.45;">${formatMarkdownAndMath(m)}</span>
    `;
    list.appendChild(item);
    renderMathSafe(item);
  });
}

function initializeGreeting() {
  const tierList = getSelectedProblemsForTier(currentLevel);
  const tierTotal = Math.max(1, tierList.length);
  let welcomeMsg = '';
  if (diagnosticStatus === 'IN_DIAGNOSTIC') {
    const diagProb = activityConfig.exercisePool?.diagnostic?.[0]?.problem || activityConfig.prompt;
    welcomeMsg = `Welcome! 👋 I am **SocratesAI**. Since we are starting **${activityConfig.title}** (${tierTotal} selected problem${tierTotal === 1 ? '' : 's'} in Level ${currentLevel}), let's begin with the **Diagnostic Calibration Question**:\n\n> ${diagProb}\n\n*(Type your response in the chat box below and click **💬 Send Step** to discuss, or click **✅ Submit Answer** in the chat window to submit and start Problem 1 of ${tierTotal}!)*`;
  } else {
    const firstProb = tierList[0]?.problem || activityConfig.prompt;
    welcomeMsg = `Welcome! 👋 I am **SocratesAI**. Today we are working through **${activityConfig.title}** (${tierTotal} selected problem${tierTotal === 1 ? '' : 's'} in Level ${currentLevel}).\n\nCurrent Problem (**Problem 1 of ${tierTotal} — Level ${currentLevel}**):\n> ${firstProb}`;
  }

  appendMessage('assistant', welcomeMsg);
  chatHistory.push({ role: 'assistant', content: welcomeMsg });
}

/**
 * Handwritten Photo Solution Upload & Phone QR Bridge Controls
 */
function initStudentPhotoControls() {
  const openBtn1 = document.getElementById('openStudentPhoneModalBtn');
  const openBtn2 = document.getElementById('attachPhotoQuickBtn');
  const modal = document.getElementById('studentPhoneModal');
  const closeBtn = document.getElementById('closeStudentPhoneModalBtn');
  const fileBtn = document.getElementById('triggerStudentCameraFileBtn');
  const fileInput = document.getElementById('studentCameraFileInput');
  const demoFormulaBtn = document.getElementById('attachDemoFormulaPhotoBtn');
  const demoGraphBtn = document.getElementById('attachDemoGraphPhotoBtn');
  const rotateBtn = document.getElementById('rotatePendingPhotoBtn');
  const removeBtn = document.getElementById('removePendingPhotoBtn');

  const openModal = async () => {
    if (modal) modal.style.display = 'flex';
    await setupStudentMobileBridge();
  };

  openBtn1?.addEventListener('click', openModal);
  openBtn2?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
    if (studentMobilePoll) clearInterval(studentMobilePoll);
  });

  fileBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingPhoto({
        mimeType: file.type || 'image/jpeg',
        data: ev.target.result,
        label: file.name
      });
      if (modal) modal.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  demoFormulaBtn?.addEventListener('click', () => {
    const dataUrl = generateStudentDemoPhoto('formulas');
    setPendingPhoto({
      mimeType: 'image/jpeg',
      data: dataUrl,
      label: 'Handwritten_Logarithm_Derivation.jpg'
    });
    if (!studentMathEditor?.getValue()) {
      studentMathEditor?.setValue('Here is a photo of my step-by-step handwritten derivation on paper (Power Law and Quotient Law):');
    }
    if (modal) modal.style.display = 'none';
  });

  demoGraphBtn?.addEventListener('click', () => {
    const dataUrl = generateStudentDemoPhoto('graph');
    setPendingPhoto({
      mimeType: 'image/jpeg',
      data: dataUrl,
      label: 'Handwritten_Logarithm_Graph_Asymptote.jpg'
    });
    if (!studentMathEditor?.getValue()) {
      studentMathEditor?.setValue('Here is a photo of my sketch for y = log_3(x) showing the vertical asymptote at x = 0 and key intercepts:');
    }
    if (modal) modal.style.display = 'none';
  });

  removeBtn?.addEventListener('click', () => {
    pendingPhotoAttachment = null;
    const bar = document.getElementById('pendingPhotoPreviewBar');
    if (bar) bar.style.display = 'none';
  });

  rotateBtn?.addEventListener('click', () => {
    if (!pendingPhotoAttachment?.data) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      pendingPhotoAttachment.data = canvas.toDataURL('image/jpeg', 0.88);
      const thumb = document.getElementById('pendingPhotoThumb');
      if (thumb) thumb.src = pendingPhotoAttachment.data;
    };
    img.src = pendingPhotoAttachment.data;
  });
}

async function setupStudentMobileBridge() {
  try {
    const res = await fetch('/api/mobile-bridge/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'student_solution', targetId: submissionId })
    });
    const data = await res.json();
    if (data.success && data.session) {
      studentMobileToken = data.session.token;
      const captureUrl = `${window.location.origin}/mobile-capture.html?token=${encodeURIComponent(studentMobileToken)}&mode=student_solution`;
      const qrImg = document.getElementById('studentQrImg');
      const qrLink = document.getElementById('studentQrDirectLink');
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(captureUrl)}`;
      }
      if (qrLink) qrLink.href = captureUrl;

      let seen = 0;
      if (studentMobilePoll) clearInterval(studentMobilePoll);
      studentMobilePoll = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/mobile-bridge/${encodeURIComponent(studentMobileToken)}`);
          const pollData = await pollRes.json();
          const uploads = pollData.session?.uploads || [];
          if (uploads.length > seen) {
            const latest = uploads[uploads.length - 1];
            seen = uploads.length;
            setPendingPhoto({
              mimeType: latest.mimeType || 'image/jpeg',
              data: latest.data,
              label: 'Phone_Solution_Sheet.jpg'
            });
            if (latest.note && studentMathEditor && !studentMathEditor.getValue()) {
              studentMathEditor.setValue(latest.note);
            }
            const modal = document.getElementById('studentPhoneModal');
            if (modal) modal.style.display = 'none';
          }
        } catch (e) { /* ignore */ }
      }, 2500);
    }
  } catch (e) {
    console.warn('Mobile bridge error:', e);
  }
}

function setPendingPhoto(photoObj) {
  pendingPhotoAttachment = photoObj;
  const bar = document.getElementById('pendingPhotoPreviewBar');
  const thumb = document.getElementById('pendingPhotoThumb');
  if (bar && thumb) {
    thumb.src = photoObj.data;
    bar.style.display = 'flex';
  }
}

function generateStudentDemoPhoto(type = 'formulas') {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 380;
  const ctx = canvas.getContext('2d');

  // Grid notebook background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 24) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'italic 600 19px "Georgia", serif';
  if (type === 'graph') {
    ctx.fillText('Student Graph & Domain Analysis: y = log_3(x)', 32, 38);
    // Draw axes
    const ox = 220, oy = 250;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, oy); ctx.lineTo(560, oy);
    ctx.moveTo(ox, 340); ctx.lineTo(ox, 70);
    ctx.stroke();

    // Dashed vertical asymptote x = 0
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(ox + 2, 335); ctx.lineTo(ox + 2, 75);
    ctx.stroke();
    ctx.setLineDash([]);

    // Log curve
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox + 8, 325);
    ctx.quadraticCurveTo(ox + 35, oy, ox + 300, 120);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.font = '15px sans-serif';
    ctx.fillText('Vertical Asymptote: x = 0 (Domain x > 0)', ox - 110, 362);
    ctx.fillStyle = '#15803d';
    ctx.fillText('Intercept (1, 0)', ox + 28, oy + 20);
    ctx.fillText('Point (9, 2) -> confirms 2log_3(6)-log_3(4) = 2', ox + 170, 115);
  } else {
    ctx.fillText('Student Handwritten Solution — Laws of Logarithms', 32, 42);
    ctx.font = 'italic 20px "Georgia", serif';
    ctx.fillText('Problem:  2 log_3(6) - log_3(4)', 32, 92);
    ctx.fillText('Step 1 (Power Law):  = log_3(6^2) - log_3(4) = log_3(36) - log_3(4)', 32, 145);
    ctx.fillText('Step 2 (Quotient Law):  = log_3( 36 / 4 ) = log_3(9)', 32, 198);
    ctx.fillText('Step 3 (Evaluate Base 3):  = log_3(3^2) = 2', 32, 250);
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(32, 275, 220, 48);
    ctx.fillStyle = '#15803d';
    ctx.fillText('Final Answer:  2', 52, 306);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * Append chat bubble with KaTeX math + optional handwritten photo preview
 */
function appendMessage(role, content, meta = null, attachments = []) {
  const container = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${role === 'user' ? 'message-user' : 'message-ai'}`;

  const senderLabel = role === 'user' ? 'Student (You)' : 'SocratesAI Tutor';
  const formattedHtml = formatMarkdownAndMath(content);

  let photosHtml = '';
  if (Array.isArray(attachments) && attachments.length > 0) {
    photosHtml = `<div style="margin-top:0.55rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
      ${attachments.map(att => `
        <div style="border:1px solid rgba(0,0,0,0.12); border-radius:8px; overflow:hidden; background:#ffffff; padding:4px;">
          <img src="${att.data}" alt="Handwritten solution" style="max-width:260px; max-height:180px; border-radius:6px; display:block; object-fit:contain;" />
          <div style="font-size:0.7rem; color:#5f6368; padding:2px 4px;">📷 Handwritten Solution Sheet</div>
        </div>
      `).join('')}
    </div>`;
  }

  bubble.innerHTML = `
    <div class="message-meta">
      <span>${senderLabel}</span>
      ${meta ? `<span>• ${meta}</span>` : ''}
    </div>
    <div class="message-content">${formattedHtml}${photosHtml}</div>
  `;

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  renderMathSafe(bubble);
}

function formatMarkdownAndMath(text) {
  if (!text) return '';
  const normalized = normalizeMathDelimiters(text);
  const segments = normalized.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  const safeMd = segments.map((seg, idx) => {
    if (idx % 2 === 1) return seg; // Protect math delimiters and operators (*, _)
    return seg
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }).join('');
  return safeMd
    .replace(/^> (.*$)/gim, '<blockquote style="border-left:3px solid #1a73e8; margin:0.5rem 0; color:#202124; background:#f8f9fa; padding:0.5rem 0.85rem; border-radius:0 6px 6px 0;">$1</blockquote>')
    .replace(/\n/g, '<br/>');
}

async function sendMessage(overrideText = null) {
  if (isWaitingForAI) return;

  const editorVal = studentMathEditor ? studentMathEditor.getValue().trim() : '';
  const rawInput = document.getElementById('chatInput')?.value.trim() || '';
  let text = overrideText || editorVal || rawInput;

  if (!text && pendingPhotoAttachment) {
    text = 'Please review my handwritten solution steps and graph on the attached sheet.';
  }
  if (!text) return;

  if (!overrideText) {
    lastUserStepForCurrentProblem = text;
    currentProblemSteps.push(text);
    if (studentMathEditor) studentMathEditor.clear();
    const input = document.getElementById('chatInput');
    if (input) input.value = '';
  }

  const currentAttachments = pendingPhotoAttachment ? [pendingPhotoAttachment] : [];
  if (pendingPhotoAttachment) {
    photosSubmittedCount++;
    pendingPhotoAttachment = null;
    const bar = document.getElementById('pendingPhotoPreviewBar');
    if (bar) bar.style.display = 'none';
  }

  appendMessage('user', text, null, currentAttachments);
  chatHistory.push({
    role: 'user',
    content: text,
    attachments: currentAttachments
  });

  isWaitingForAI = true;
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Thinking...';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachmentId,
        provider: activityConfig.selectedProvider,
        model: activityConfig.selectedModel,
        messages: chatHistory,
        customContext: {
          ...activityConfig,
          currentLevel,
          diagnosticStatus
        }
      })
    });

    const data = await res.json();
    if (data.success && data.reply) {
      const reply = data.reply;
      appendMessage('assistant', reply.content, reply.provider);
      chatHistory.push({ role: 'assistant', content: reply.content });

      if (reply.telemetry) {
        handleStudentTelemetryAndProgression(reply.telemetry, text);
      }

      await saveSubmissionState('IN_PROGRESS');
    } else {
      appendMessage('assistant', '⚠️ Connection issue. Please try sending your step again.');
    }
  } catch (err) {
    appendMessage('assistant', '⚠️ Network error while contacting the AI tutor.');
  } finally {
    isWaitingForAI = false;
    sendBtn.disabled = false;
    sendBtn.textContent = '💬 Send Step';
  }
}

/**
 * Submit final answer for the current problem using the single Submit Answer button in the chat window,
 * record completion, verify with AI tutor, and advance to the next selected problem (without looping).
 */
async function submitCurrentProblemAnswer() {
  if (isWaitingForAI || allProblemsCompleted) return;

  const editorVal = studentMathEditor ? studentMathEditor.getValue().trim() : '';
  const rawInput = document.getElementById('chatInput')?.value.trim() || '';
  const answerText = editorVal || rawInput || lastUserStepForCurrentProblem;
  const usedEditorInput = Boolean(editorVal || rawInput || pendingPhotoAttachment);

  if (!answerText && !pendingPhotoAttachment) {
    appendMessage('assistant', '⚠️ Please type your answer or solution step in the chat box below (or attach a **📷 Photo Sheet**) before clicking **✅ Submit Answer**.');
    return;
  }

  // Clear chat input
  if (studentMathEditor) studentMathEditor.clear();
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.value = '';
  lastUserStepForCurrentProblem = '';

  const currentAttachments = pendingPhotoAttachment ? [pendingPhotoAttachment] : [];
  if (pendingPhotoAttachment) {
    photosSubmittedCount++;
    pendingPhotoAttachment = null;
    const bar = document.getElementById('pendingPhotoPreviewBar');
    if (bar) bar.style.display = 'none';
  }

  const pool = activityConfig?.exercisePool || {};
  const tierList = getSelectedProblemsForTier(currentLevel);
  const tierTotal = Math.max(1, tierList.length);

  const isDiag = diagnosticStatus === 'IN_DIAGNOSTIC';
  const curProbObj = isDiag ? (pool.diagnostic?.[0] || null) : (tierList[currentProblemIndexInTier] || null);
  const curKey = isDiag ? 'DIAG' : `${currentLevel}${currentProblemIndexInTier + 1}`;
  const curShortLabel = isDiag
    ? 'Diagnostic Check'
    : `Problem ${currentProblemIndexInTier + 1} of ${tierTotal} (Level ${currentLevel})`;
  const curProblemText = curProbObj?.problem || activityConfig.prompt;
  const expectedTargetAnswer = curProbObj?.targetAnswer || '';
  const hasPhoto = currentAttachments.length > 0;

  // Requirement 4: Enforce step-by-step derivation (reject bare single-number submissions when no prior steps were sent)
  const stepByStepShown = isStepByStepWorkShown(answerText, currentProblemSteps, hasPhoto);
  if (!stepByStepShown) {
    appendMessage('user', answerText, `${curShortLabel} (Single Number Only)`);
    chatHistory.push({
      role: 'user',
      content: `Attempted single-number submission for ${curShortLabel}: ${answerText}`
    });
    const stepBanner = document.getElementById('stepByStepInstructionBanner');
    if (stepBanner) {
      stepBanner.style.background = '#fce8e6';
      stepBanner.style.borderColor = '#d93025';
      setTimeout(() => {
        stepBanner.style.background = '#fef7e0';
        stepBanner.style.borderColor = '#fde293';
      }, 3000);
    }
    const rejectMsg = `⚠️ **A single number ("${answerText}") is not accepted without step-by-step proof!** Please see the yellow guide above and write your intermediate step(s) (e.g., $\\log_2(4 \\cdot 8) = \\log_2(32) = 5$) or send a step first with **💬 Send Step**.`;
    appendMessage('assistant', rejectMsg, 'Step-by-Step Proof Required');
    chatHistory.push({ role: 'assistant', content: rejectMsg });
    return;
  }

  const combinedStepAnswer = currentProblemSteps.length > 0 && !currentProblemSteps.includes(answerText)
    ? `${currentProblemSteps.join(' -> ')} = ${answerText}`
    : (answerText || currentProblemSteps.join(' -> '));

  const isCorrect = isSubmittedAnswerCorrect(combinedStepAnswer, expectedTargetAnswer);

  if (!isCorrect) {
    mistakesCount++;
  }

  // Record time spent on this problem & mark problem as answered
  const elapsedForProblem = Math.max(5, activeTimeSec - currentProblemStartSec);
  timePerProblemSec.push(elapsedForProblem);
  currentProblemStartSec = activeTimeSec;

  solvedProblems.set(curKey, {
    id: isDiag ? 'DIAG' : `Problem ${currentProblemIndexInTier + 1}`,
    tier: isDiag ? 'DIAG' : currentLevel,
    index: isDiag ? 0 : currentProblemIndexInTier,
    problem: curProblemText,
    targetAnswer: expectedTargetAnswer,
    answer: combinedStepAnswer || '[Handwritten Photo Solution]',
    steps: [...currentProblemSteps],
    stepsCount: Math.max(1, currentProblemSteps.length),
    isStepByStep: true,
    hasPhoto,
    isCorrect,
    submittedAt: new Date().toISOString()
  });
  currentProblemSteps = [];
  repetitionsCount = Math.max(repetitionsCount, getSolvedCountInTier(currentLevel));
  updateMasteryAndMilestonesFromSubmissions();

  if (usedEditorInput) {
    const submissionDisplayMsg = `✅ **Submitted Answer for ${curShortLabel}:** ${answerText || '*(Handwritten solution sheet attached)*'}`;
    appendMessage('user', submissionDisplayMsg, `${curShortLabel} Answer`, currentAttachments);
  }
  chatHistory.push({
    role: 'user',
    content: `Final Answer Submission for ${curShortLabel} ("${curProblemText}"): ${answerText || '[See attached photo]'}`,
    attachments: currentAttachments
  });

  const bottomSubmitBtn = document.getElementById('submitAnswerBottomBtn');
  isWaitingForAI = true;
  if (bottomSubmitBtn) {
    bottomSubmitBtn.disabled = true;
    bottomSubmitBtn.textContent = '⏳ Checking...';
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachmentId,
        provider: activityConfig.selectedProvider,
        model: activityConfig.selectedModel,
        messages: chatHistory,
        customContext: {
          ...activityConfig,
          prompt: curProblemText,
          currentLevel,
          diagnosticStatus
        }
      })
    });
    const data = await res.json();
    if (data.success && data.reply) {
      appendMessage('assistant', data.reply.content, `${curShortLabel} Verification`);
      chatHistory.push({ role: 'assistant', content: data.reply.content });
      if (data.reply.telemetry) {
        handleStudentTelemetryAndProgression(data.reply.telemetry, answerText);
      }
    }
  } catch (err) {
    console.warn('Verification chat notice:', err);
  } finally {
    isWaitingForAI = false;
    if (bottomSubmitBtn) {
      bottomSubmitBtn.disabled = false;
      bottomSubmitBtn.textContent = '✅ Submit Answer';
    }
  }

  // Advance to the next problem in the teacher's selected tier list (without looping!)
  if (isDiag) {
    diagnosticStatus = 'COMPLETED';
    currentProblemIndexInTier = 0;
    if (!levelProgression.includes(currentLevel)) {
      levelProgression.push(currentLevel);
    }
    syncCurrentProblemUI();
    const firstTierProb = tierList[0]?.problem || activityConfig.prompt;
    const nextMsg = `🎯 **Diagnostic Check complete! Moving to Problem 1 of ${tierTotal} (Level ${currentLevel}):**\n\n> ${firstTierProb}\n\nType your step or final answer in the chat box below and click **✅ Submit Answer**!`;
    appendMessage('assistant', nextMsg, `Problem 1 of ${tierTotal}`);
    chatHistory.push({ role: 'assistant', content: nextMsg });
  } else {
    // Find next unanswered problem in the current tier (0 .. tierTotal - 1)
    let nextIdx = -1;
    for (let i = currentProblemIndexInTier + 1; i < tierTotal; i++) {
      if (!solvedProblems.has(`${currentLevel}${i + 1}`)) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === -1) {
      for (let i = 0; i < currentProblemIndexInTier; i++) {
        if (!solvedProblems.has(`${currentLevel}${i + 1}`)) {
          nextIdx = i;
          break;
        }
      }
    }

    if (nextIdx !== -1) {
      currentProblemIndexInTier = nextIdx;
      syncCurrentProblemUI();
      const nextProb = tierList[currentProblemIndexInTier];
      const nextNum = currentProblemIndexInTier + 1;
      const nextMsg = `🎯 **Answer recorded! Moving to Problem ${nextNum} of ${tierTotal} (Level ${currentLevel}):**\n\n> ${nextProb.problem}\n\nType your step or final answer in the chat box below and click **✅ Submit Answer**!`;
      appendMessage('assistant', nextMsg, `Problem ${nextNum} of ${tierTotal}`);
      chatHistory.push({ role: 'assistant', content: nextMsg });
    } else {
      allProblemsCompleted = true;
      syncCurrentProblemUI();
      const doneMsg = `🎉 **All ${tierTotal} of ${tierTotal} selected problems in Level ${currentLevel} have been answered!**\n\nClick **🎓 Turn In Assignment to Classroom** in the top banner to submit your completed work to your teacher.`;
      appendMessage('assistant', doneMsg, 'All Selected Problems Complete');
      chatHistory.push({ role: 'assistant', content: doneMsg });
    }
  }

  await saveSubmissionState('IN_PROGRESS');
}

/**
 * Point 6a & Point 7a: Update Student Telemetry (mistakes & hints) without inflating Mastery % before submission
 */
function handleStudentTelemetryAndProgression(telemetry, lastStudentText = '') {
  if (telemetry.detectedMisconception) {
    mistakesCount++;
  }
  if (telemetry.needsHint || /hint|stuck|help/i.test(lastStudentText)) {
    hintsUsedCount++;
  }

  if (diagnosticStatus === 'IN_DIAGNOSTIC') {
    if (telemetry.detectedMisconception || telemetry.masteryLevel < 40) {
      diagnosticStartLevel = 'A';
    } else {
      diagnosticStartLevel = activityConfig.currentLevel || 'A';
    }
    updateProgressionPills();
  }

  updateTelemetryHUD();
}

/**
 * Switch directly to a specific stage or tier when clicking a Lesson Plan Route pill
 */
async function switchToTierStage(targetStage) {
  lastUserStepForCurrentProblem = '';
  currentProblemSteps = [];
  allProblemsCompleted = false;

  if (targetStage === 'DIAG') {
    diagnosticStatus = 'IN_DIAGNOSTIC';
    syncCurrentProblemUI();
    const diagProb = activityConfig.exercisePool?.diagnostic?.[0]?.problem || activityConfig.prompt;
    const msg = `🧭 **Switched to Level Diagnostic Check:**\n\n> ${diagProb}`;
    appendMessage('assistant', msg, 'Lesson Plan Route');
    chatHistory.push({ role: 'assistant', content: msg });
    return;
  }

  diagnosticStatus = 'COMPLETED';
  currentLevel = targetStage;
  if (!levelProgression.includes(currentLevel)) {
    levelProgression.push(currentLevel);
  }

  const tierList = getSelectedProblemsForTier(currentLevel);
  const tierTotal = Math.max(1, tierList.length);
  let firstUnanswered = 0;
  for (let i = 0; i < tierTotal; i++) {
    if (!solvedProblems.has(`${currentLevel}${i + 1}`)) {
      firstUnanswered = i;
      break;
    }
  }
  currentProblemIndexInTier = firstUnanswered;
  syncCurrentProblemUI();

  const picked = tierList[currentProblemIndexInTier];
  if (picked) {
    const num = currentProblemIndexInTier + 1;
    const msg = `🎯 **Switched to Problem ${num} of ${tierTotal} (Level ${currentLevel}):**\n\n> ${picked.problem}\n\nType your step or final answer in the chat box below and click **✅ Submit Answer**!`;
    appendMessage('assistant', msg, `Level ${currentLevel} Pool (${num}/${tierTotal})`);
    chatHistory.push({ role: 'assistant', content: msg });
  }
}

/**
 * Advance to the next problem in the teacher's selected Exercise Pool for the current tier.
 * Stops cleanly at the final selected problem (e.g., 3 of 3) and NEVER loops endlessly.
 */
async function loadNextPoolProblem() {
  if (allProblemsCompleted) return;
  lastUserStepForCurrentProblem = '';
  currentProblemSteps = [];

  const tierList = getSelectedProblemsForTier(currentLevel);
  const tierTotal = Math.max(1, tierList.length);

  if (diagnosticStatus === 'IN_DIAGNOSTIC') {
    diagnosticStatus = 'COMPLETED';
    currentProblemIndexInTier = 0;
    if (!levelProgression.includes(currentLevel)) {
      levelProgression.push(currentLevel);
    }
    syncCurrentProblemUI();
    const firstProb = tierList[0];
    if (firstProb) {
      const msg = `🎯 **Problem 1 of ${tierTotal} (Level ${currentLevel}):**\n\n> ${firstProb.problem}\n\nType your step or final answer in the chat box below and click **✅ Submit Answer**!`;
      appendMessage('assistant', msg, `Problem 1 of ${tierTotal}`);
      chatHistory.push({ role: 'assistant', content: msg });
    }
    return;
  }

  if (currentProblemIndexInTier >= tierTotal - 1) {
    // At the final selected problem of the tier — do NOT wrap around in a loop!
    syncCurrentProblemUI();
    const endMsg = `🏁 **You are on the final selected problem (Problem ${tierTotal} of ${tierTotal} in Level ${currentLevel}).** Click **✅ Submit Answer** in the chat window to finish!`;
    appendMessage('assistant', endMsg, 'End of Selected Pool');
    return;
  }

  const elapsedForProblem = Math.max(5, activeTimeSec - currentProblemStartSec);
  timePerProblemSec.push(elapsedForProblem);
  currentProblemStartSec = activeTimeSec;

  currentProblemIndexInTier++;
  syncCurrentProblemUI();

  const picked = tierList[currentProblemIndexInTier];
  if (picked) {
    const num = currentProblemIndexInTier + 1;
    const msg = `🎯 **Problem ${num} of ${tierTotal} (Level ${currentLevel}):**\n\n> ${picked.problem}\n\nType your step or final answer in the chat box below and click **✅ Submit Answer**!`;
    appendMessage('assistant', msg, `Problem ${num} of ${tierTotal}`);
    chatHistory.push({ role: 'assistant', content: msg });
    await saveSubmissionState('IN_PROGRESS');
  }
}

async function saveSubmissionState(status = 'IN_PROGRESS') {
  if (urlParams.get('automatedTest') === 'true') return;
  const userTurns = chatHistory.filter(m => m.role === 'user').length;
  // Never save empty/unattempted sessions when the student hasn't sent any answer or photo yet
  if (userTurns === 0 && photosSubmittedCount === 0 && solvedProblems.size === 0) {
    return;
  }
  const resolvedStudentName = urlParams.get('studentName') || urlParams.get('login_hint') || 'Student';
  const resolvedStudentEmail = urlParams.get('login_hint') || '';
  const tierTotal = Math.max(1, getSelectedProblemsForTier(currentLevel).length);
  const solvedList = Array.from(solvedProblems.entries()).map(([key, val]) => ({ key, ...val }));
  try {
    await fetch(`/api/submission/${submissionId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachmentId,
        studentName: resolvedStudentName,
        studentEmail: resolvedStudentEmail,
        status: status === 'SUBMITTED' ? 'TURNED_IN' : status,
        masteryLevel: currentMastery,
        currentLevel,
        diagnosticCompleted: diagnosticStatus === 'COMPLETED',
        diagnosticStartLevel,
        levelProgression,
        activeTimeSec,
        timePerProblemSec: timePerProblemSec.length > 0 ? timePerProblemSec : [activeTimeSec],
        mistakesCount,
        hintsUsedCount,
        repetitionsCount: Math.max(solvedProblems.size, getSolvedCountInTier(currentLevel)),
        totalSelectedProblems: tierTotal,
        solvedProblems: solvedList,
        photosSubmittedCount,
        studentMode: activityConfig.studentMode || 'step_by_step',
        turnsCount: userTurns,
        transcript: chatHistory,
        submittedAt: status === 'SUBMITTED' ? new Date().toISOString() : null
      })
    });
  } catch (err) {
    console.warn('Could not save submission state:', err);
  }
}

function setupEventListeners() {
  const backBtn = document.getElementById('backToTeacherStudioBtn');
  if (backBtn && isTeacherPreview) {
    backBtn.style.display = 'inline-flex';
    backBtn.addEventListener('click', () => {
      const returnUrl = sessionStorage.getItem('socrates_teacherReturnUrl') || '/attachment-discovery.html';
      window.location.href = returnUrl;
    });
  }

  document.getElementById('sendBtn')?.addEventListener('click', () => sendMessage());
  document.getElementById('submitAnswerBottomBtn')?.addEventListener('click', () => submitCurrentProblemAnswer());

  document.getElementById('bannerTurnInBtn')?.addEventListener('click', () => {
    document.getElementById('turnInBtn')?.click();
  });

  document.getElementById('studentModeSwitcher')?.addEventListener('change', (e) => {
    activityConfig.studentMode = e.target.value;
    const modeLabel = e.target.value === 'independent' ? 'Independent Solution + Final Verification' : 'Step-by-Step Socratic Dialogue';
    appendMessage('assistant', `🔄 Switched guidance mode to: **${modeLabel}**.`);
  });

  document.getElementById('generateSimilarBtn')?.addEventListener('click', () => {
    loadNextPoolProblem();
  });

  // Clickable Lesson Plan Route Pills (Diagnostic / Level A / Level B / Level C)
  document.getElementById('stagePillDiag')?.addEventListener('click', () => switchToTierStage('DIAG'));
  document.getElementById('stagePillA')?.addEventListener('click', () => switchToTierStage('A'));
  document.getElementById('stagePillB')?.addEventListener('click', () => switchToTierStage('B'));
  document.getElementById('stagePillC')?.addEventListener('click', () => switchToTierStage('C'));

  document.getElementById('requestHintBtn')?.addEventListener('click', () => {
    hintsUsedCount++;
    updateTelemetryHUD();
    sendMessage('Could you give me a Socratic hint for the next step without revealing the final answer?');
  });

  document.querySelectorAll('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      sendMessage(chip.dataset.prompt);
    });
  });

  document.getElementById('turnInBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('turnInBtn');
    btn.innerHTML = '⏳ Turning in to Google Classroom...';
    btn.disabled = true;

    const pendingTyped = studentMathEditor ? studentMathEditor.getValue().trim() : '';
    if (pendingTyped || pendingPhotoAttachment) {
      await submitCurrentProblemAnswer();
    }

    await saveSubmissionState('SUBMITTED');

    document.getElementById('modalMastery').textContent = `${currentMastery}%`;
    document.getElementById('modalLevelReached').textContent = `Level ${currentLevel}`;
    const m = Math.floor(activeTimeSec / 60).toString().padStart(2, '0');
    const s = (activeTimeSec % 60).toString().padStart(2, '0');
    document.getElementById('modalTimeSpent').textContent = `${m}:${s}`;

    const reviewLink = document.getElementById('openTeacherReviewLink');
    if (reviewLink) {
      reviewLink.href = `/teacher-review.html?attachmentId=${encodeURIComponent(attachmentId)}&submissionId=${encodeURIComponent(submissionId)}`;
    }

    document.getElementById('turnInModal').style.display = 'flex';
    btn.innerHTML = '✅ Turned In';
  });
}
