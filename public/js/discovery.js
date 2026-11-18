/**
 * Teacher Attachment Discovery & Configuration Controller (Architecture v2 — 100% English)
 * Implements:
 * 1. Clean Real-Life Initial State (no pre-filled usage samples on open)
 * 2. Block 1: Multimodal Teacher Material Studio (Typing + Local Upload + Google Drive Modal + Course Library + Voice Dictation + Phone Camera/QR)
 * 3. Block 2: Ergonomic Existing Lesson Plan Selector + Full-Width Title + AI Lesson Plan Draft & 30-Problem Pool (10 per Tier A / B / C)
 * 4. Automatic Lesson Plan generation when selecting from Course Material Library, Google Drive, or Classroom Stream
 * 5. Hidden Templates Tab (Point 3), Dormant Legacy Editors (Points 4 & 5), and Teacher Prep Time Telemetry (Point 7b)
 */
import { MathTextEditor } from './math-editor.js?v=20261112b';
import { initFullWindowBridge } from './full-window-bridge.js?v=20261113e';

const GOOGLE_CLIENT_ID = '243371665093-1j2aos0nhaboqcsqiimtefir1qa3h5k3.apps.googleusercontent.com';
const CLASSROOM_OAUTH_SCOPES = 'https://www.googleapis.com/auth/classroom.addons.teacher https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.courses.readonly';

let fullWindowBridge = null;

// Feature Flags (Point 4: Keep manual editors dormant & reactivatable anytime)
window.FEATURE_FLAGS = {
  enableManualExerciseEditors: false
};

let templates = [];
let models = [];
let materialLibrary = [];
let savedLessonPlans = [];
let customCurricula = [];
let lastRecognizedMeta = null;
let mhf4uCurriculum = null;
let currentSelectedLesson = null;
let activeTemplateId = '';
let selectedExerciseTab = 'A';
let attachedMaterialSource = '';
let lastLoadedMaterialText = '';
let lastLoadedCourseName = '';

// Clean initial Exercise Pool (starts empty until teacher uploads/selects material or chooses an Existing Lesson Plan)
let currentExercisePool = {
  diagnostic: [],
  A: [],
  B: [],
  C: []
};

// Block 1 Multimodal State & Multi-File Stack (Supports multiple Curriculum & Material files)
let studioImages = []; // [{ id, name, mimeType, data }]
let loadedStudioFiles = []; // [{ id, title, content, source, docCategory: 'curriculum'|'material', recognizedType, curriculum, curriculumCode, gradeLevel, subject, formulasCount }]
let prepMethodsUsed = new Set(['typing']);
let mobileBridgeToken = null;
let mobilePollInterval = null;

// Point 7b: Automatic Teacher Prep Telemetry State
let activePrepSection = 'materials'; // 'materials' | 'lessonPlan'
let materialPrepTimeSec = 0;
let lessonPlanPrepTimeSec = 0;

// WYSIWYG Math+Text Editor instances
let materialStudioEditor = null;
let goalEditor = null;
let milestonesEditor = null;
let lessonInstructionsEditor = null;
// Dormant editor instances (Point 4: kept intact for future reactivation)
let promptEditor = null;
let problemEditorA = null;
let problemEditorB = null;
let problemEditorC = null;

// Parse Google Classroom URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const classroomContext = {
  courseId: urlParams.get('courseId') || 'test-class-math',
  itemId: urlParams.get('itemId') || urlParams.get('postId') || urlParams.get('courseWorkId') || 'assignment-draft-01',
  itemType: urlParams.get('itemType') || 'courseWork',
  addOnToken: urlParams.get('addOnToken') || 'simulated-addon-token',
  loginHint: urlParams.get('login_hint') || ''
};

function isSimulatedContext() {
  return (
    !classroomContext.courseId ||
    classroomContext.courseId === 'test-class-math' ||
    classroomContext.courseId === 'course-calc-101' ||
    !classroomContext.itemId ||
    classroomContext.itemId === 'assignment-draft-01' ||
    classroomContext.itemId === 'assignment-derive-quad' ||
    !classroomContext.addOnToken ||
    classroomContext.addOnToken === 'simulated-addon-token' ||
    classroomContext.addOnToken === 'mock-teacher-token'
  );
}

function hasFreshLocalToken() {
  try {
    const token = localStorage.getItem('socrates_AccessToken') || '';
    const ts = Number(localStorage.getItem('socrates_AccessToken_ts') || '0');
    if (!token || token.length < 20) return false;
    if (!ts) return true;
    return (Date.now() - ts) < 48 * 60 * 1000;
  } catch (e) {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  fullWindowBridge = initFullWindowBridge({ pageType: 'discovery' });
  initTopTabs();
  initTeacherPrepTimer();
  initMathEditors();
  initMultimodalStudioControls();
  initLevelPromptsStudioControls();
  initAdaptiveExercisePoolUI();
  setupEventListeners();
  initClassroomOAuthSync();
  await Promise.all([
    loadTemplates(),
    loadModels(),
    loadMaterialLibrary(),
    loadSavedLessonPlansLibrary(),
    loadMHF4UCurriculum()
  ]);
});

/**
 * Synchronizes OAuth access_token with the backend server cache and pre-warms
 * token on first user interaction in real Google Classroom sessions.
 */
async function initClassroomOAuthSync() {
  try {
    const res = await fetch(`/api/oauth/token?loginHint=${encodeURIComponent(classroomContext.loginHint)}`);
    const data = await res.json();
    if (data && data.accessToken) {
      localStorage.setItem('socrates_AccessToken', data.accessToken);
      localStorage.setItem('socrates_AccessToken_ts', String(data.updatedAt || Date.now()));
    } else if (hasFreshLocalToken()) {
      const localTok = localStorage.getItem('socrates_AccessToken') || '';
      if (localTok) {
        fetch('/api/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: localTok, loginHint: classroomContext.loginHint })
        }).catch(() => {});
      }
    }
  } catch (e) {}
}

/**
 * Point 3: Top Tab Bar Switching (Templates hidden on initial open)
 */
function initTopTabs() {
  const tabBtnStudio = document.getElementById('tabBtnStudio');
  const tabBtnTemplates = document.getElementById('tabBtnTemplates');
  const tabPanelStudio = document.getElementById('tabPanelStudio');
  const tabPanelTemplates = document.getElementById('tabPanelTemplates');
  const returnToStudioBtn = document.getElementById('returnToStudioBtn');

  function switchTab(tab) {
    if (tab === 'templates') {
      tabBtnTemplates.classList.add('active');
      tabBtnTemplates.setAttribute('aria-selected', 'true');
      tabBtnTemplates.style.borderColor = '#1a73e8';
      tabBtnTemplates.style.color = '#1967d2';
      tabBtnTemplates.style.background = '#e8f0fe';
      tabBtnStudio.classList.remove('active');
      tabBtnStudio.setAttribute('aria-selected', 'false');
      tabBtnStudio.style.borderColor = '#dadce0';
      tabBtnStudio.style.color = '#3c4043';
      tabBtnStudio.style.background = '#ffffff';
      tabPanelTemplates.style.display = 'block';
      tabPanelStudio.style.display = 'none';
    } else {
      tabBtnStudio.classList.add('active');
      tabBtnStudio.setAttribute('aria-selected', 'true');
      tabBtnStudio.style.borderColor = '#1a73e8';
      tabBtnStudio.style.color = '#1967d2';
      tabBtnStudio.style.background = '#e8f0fe';
      tabBtnTemplates.classList.remove('active');
      tabBtnTemplates.setAttribute('aria-selected', 'false');
      tabBtnTemplates.style.borderColor = '#dadce0';
      tabBtnTemplates.style.color = '#3c4043';
      tabBtnTemplates.style.background = '#ffffff';
      tabPanelStudio.style.display = 'block';
      tabPanelTemplates.style.display = 'none';
    }
  }

  tabBtnStudio?.addEventListener('click', () => switchTab('studio'));
  tabBtnTemplates?.addEventListener('click', () => switchTab('templates'));
  returnToStudioBtn?.addEventListener('click', () => switchTab('studio'));
}

/**
 * Point 7b: Automatic Teacher Preparation Time Tracker (Materials vs Lesson Plan)
 */
function initTeacherPrepTimer() {
  const block1 = document.getElementById('block1MaterialStudio');
  const block2 = document.getElementById('block2LessonPlanStudio');
  const matVal = document.getElementById('timerMaterialsVal');
  const lesVal = document.getElementById('timerLessonVal');

  block1?.addEventListener('mouseenter', () => { activePrepSection = 'materials'; });
  block1?.addEventListener('focusin', () => { activePrepSection = 'materials'; });
  block2?.addEventListener('mouseenter', () => { activePrepSection = 'lessonPlan'; });
  block2?.addEventListener('focusin', () => { activePrepSection = 'lessonPlan'; });

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  setInterval(() => {
    if (document.hidden) return;
    if (activePrepSection === 'lessonPlan') {
      lessonPlanPrepTimeSec++;
      if (lesVal) lesVal.textContent = formatTime(lessonPlanPrepTimeSec);
    } else {
      materialPrepTimeSec++;
      if (matVal) matVal.textContent = formatTime(materialPrepTimeSec);
    }
  }, 1000);
}

function updatePrepMethodsBadges() {
  const container = document.getElementById('materialMethodsBadges');
  if (!container) return;
  const labels = {
    typing: '⌨️ Typing',
    file_upload: '📄 Local File',
    google_drive: '☁️ Google Drive',
    course_library: '📚 Course Library',
    classroom_stream: '📥 Classroom Stream',
    internet_search: '🌐 Internet Query',
    handwritten_photo: '📷 Handwritten / Photo',
    voice_dictation: '🎤 Voice Dictation',
    ai_synthesis: '✨ LLM Synthesis'
  };
  container.innerHTML = Array.from(prepMethodsUsed)
    .map(m => `<span class="badge badge-blue" style="font-size:0.7rem;">${labels[m] || m}</span>`)
    .join('');
}

function updateLessonPlanStatusPill(text, isReady = false) {
  const pill = document.getElementById('lessonPlanStatusPill');
  if (!pill) return;
  pill.textContent = text;
  if (isReady) {
    pill.style.background = '#e6f4ea';
    pill.style.color = '#137333';
    pill.style.borderColor = '#ceead6';
  } else {
    pill.style.background = '#ffffff';
    pill.style.color = '#5f6368';
    pill.style.borderColor = '#dadce0';
  }
}

/**
 * Initialize Active Block 1 & Block 2 MathTextEditors (Clean & Empty on Load) + Dormant Legacy Editors
 */
function initMathEditors() {
  const studioWrap = document.getElementById('materialStudioEditorWrap');
  if (studioWrap) {
    materialStudioEditor = new MathTextEditor(studioWrap, {
      placeholder: 'Type or paste reference theory, formulas (∑ Formula), and base examples here — or import from Google Drive, Course Material Library, Classroom Stream, Voice Dictation, or Phone Camera above...',
      minHeight: '320px',
      initialValue: ''
    });
  }

  // Single Unified Window in Block 2 for Learning Goal, Target Milestones, and Teacher Instructions
  const goalWrap = document.getElementById('goalEditorWrap');
  const goalHidden = document.getElementById('goalInput');
  const milestonesHidden = document.getElementById('milestonesInput');
  const instrHidden = document.getElementById('teacherLessonInstructions');
  if (goalWrap) {
    goalEditor = new MathTextEditor(goalWrap, {
      minHeight: '140px',
      placeholder: 'Learning Goal, step-by-step Target Milestones (1 per line), and optional Teacher Instructions for Lesson Plan & Pool Generation (auto-populated when generating a Lesson Plan or selecting an existing unit)...',
      initialValue: '',
      onChange: (val) => {
        const parsed = parseUnifiedLessonPlanWindow(val);
        if (goalHidden) goalHidden.value = parsed.learningGoal;
        if (milestonesHidden) milestonesHidden.value = parsed.targetMilestones.join('\n');
        if (instrHidden) instrHidden.value = parsed.teacherInstructions;
      }
    });
    lessonInstructionsEditor = goalEditor;
  }

  // Initialize dormant legacy editors inside #dormantLegacyEditors (Point 4)
  const promptWrap = document.getElementById('promptEditorWrap');
  if (promptWrap) {
    promptEditor = new MathTextEditor(promptWrap, {
      minHeight: '78px',
      initialValue: ''
    });
  }
  const wrapA = document.getElementById('exProblemWrapA');
  const wrapB = document.getElementById('exProblemWrapB');
  const wrapC = document.getElementById('exProblemWrapC');
  if (wrapA) problemEditorA = new MathTextEditor(wrapA, { compact: true, minHeight: '54px', initialValue: '' });
  if (wrapB) problemEditorB = new MathTextEditor(wrapB, { compact: true, minHeight: '54px', initialValue: '' });
  if (wrapC) problemEditorC = new MathTextEditor(wrapC, { compact: true, minHeight: '54px', initialValue: '' });

  // Helper to reactivate manual editors anytime if needed
  window.reactivateManualEditors = function(enable = true) {
    window.FEATURE_FLAGS.enableManualExerciseEditors = enable;
    const dormant = document.getElementById('dormantLegacyEditors');
    if (dormant) dormant.style.display = enable ? 'block' : 'none';
  };
}

/**
 * Formats Learning Goal, Target Milestones, and Teacher Instructions into the single unified Block 2 window
 */
function setUnifiedLessonPlanWindow({ learningGoal = '', milestones = [], teacherInstructions = '' } = {}) {
  const parts = [];
  const cleanGoal = String(learningGoal || '').trim();
  const cleanMilestones = (Array.isArray(milestones) ? milestones : String(milestones || '').split('\n'))
    .map(m => String(m).trim())
    .filter(Boolean);
  const cleanInstr = String(teacherInstructions || '').trim();

  if (cleanGoal) {
    parts.push(`🎯 Learning Goal: ${cleanGoal}`);
  }
  if (cleanMilestones.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push('🪜 Target Milestones & Socratic Steps:');
    cleanMilestones.forEach((m, i) => {
      const stripped = m.replace(/^[-•*]\s*/, '');
      parts.push(/^step\s*\d+/i.test(stripped) ? `• ${stripped}` : `• Step ${i + 1}: ${stripped}`);
    });
  }
  if (cleanInstr) {
    if (parts.length > 0) parts.push('');
    parts.push(`🧭 Teacher Instructions: ${cleanInstr}`);
  }

  const combined = parts.join('\n');
  const goalHidden = document.getElementById('goalInput');
  const msHidden = document.getElementById('milestonesInput');
  const instrHidden = document.getElementById('teacherLessonInstructions');
  if (goalHidden) goalHidden.value = cleanGoal;
  if (msHidden) msHidden.value = cleanMilestones.join('\n');
  if (instrHidden) instrHidden.value = cleanInstr;
  if (goalEditor) goalEditor.setValue(combined);
}

/**
 * Parses Learning Goal, Target Milestones, and Teacher Instructions from the single unified Block 2 window
 */
function parseUnifiedLessonPlanWindow(rawText = '') {
  const raw = String(rawText || (goalEditor ? goalEditor.getValue() : '') || '').trim();
  if (!raw) {
    return { learningGoal: '', targetMilestones: [], teacherInstructions: '' };
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let learningGoal = '';
  const targetMilestones = [];
  const instructionLines = [];
  let section = 'goal';

  for (const line of lines) {
    if (/^(?:🎯\s*)?learning\s*goal\s*:/i.test(line)) {
      learningGoal = line.replace(/^(?:🎯\s*)?learning\s*goal\s*:\s*/i, '').trim();
      section = 'goal';
    } else if (/^(?:🪜\s*)?target\s*(?:concept\s*)?milestones/i.test(line)) {
      section = 'milestones';
    } else if (/^(?:🧭\s*)?teacher\s*instructions\s*:/i.test(line)) {
      const rest = line.replace(/^(?:🧭\s*)?teacher\s*instructions\s*:\s*/i, '').trim();
      if (rest) instructionLines.push(rest);
      section = 'instructions';
    } else if (/^(?:[-•*]|\d+[.)]|step\s*\d+)/i.test(line)) {
      targetMilestones.push(line.replace(/^[-•*]\s*/, '').trim());
    } else if (section === 'milestones') {
      targetMilestones.push(line);
    } else if (section === 'instructions') {
      instructionLines.push(line);
    } else if (!learningGoal) {
      learningGoal = line;
    } else {
      instructionLines.push(line);
    }
  }

  return {
    learningGoal,
    targetMilestones,
    teacherInstructions: instructionLines.join(' ').trim() || (!targetMilestones.length ? learningGoal : '')
  };
}

/**
 * Block 1 (Point 1): Multimodal Teacher Material Studio Controls
 */
function initMultimodalStudioControls() {
  // 1. Upload Local File / Handwritten Note
  const uploadBtn = document.getElementById('studioUploadFileBtn');
  const fileInput = document.getElementById('studioFileUploadInput');
  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        prepMethodsUsed.add('handwritten_photo');
        updatePrepMethodsBadges();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
        if (dataUrl) {
          addHandwrittenImageToStudio({
            name: file.name,
            mimeType: file.type || 'image/jpeg',
            data: dataUrl
          });
        }
      } else {
        prepMethodsUsed.add('file_upload');
        updatePrepMethodsBadges();
        const rawText = typeof file.text === 'function'
          ? await file.text()
          : await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (ev) => resolve(String(ev.target?.result || ''));
              reader.onerror = () => resolve('');
              reader.readAsText(file);
            });
        const text = String(rawText || '').slice(0, 25000);
        await addLoadedFileToStudio({
          title: file.name,
          content: text,
          source: `Local File (${file.name})`
        });
      }
    }
    e.target.value = '';
  });

  // 2. Voice Dictation Drawer & Web Speech API (Clean — No Usage Samples)
  const voiceDrawerBtn = document.getElementById('voiceDictateMaterialBtn');
  const voiceDrawer = document.getElementById('voiceDictationDrawer');
  const toggleRecBtn = document.getElementById('toggleVoiceRecBtn');
  const voiceInput = document.getElementById('voiceTranscriptInput');

  voiceDrawerBtn?.addEventListener('click', () => {
    const isHidden = voiceDrawer.style.display === 'none';
    voiceDrawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      prepMethodsUsed.add('voice_dictation');
      updatePrepMethodsBadges();
      voiceInput?.focus();
    }
  });

  let recognition = null;
  let isRecording = false;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (voiceInput) voiceInput.value = transcript;
    };
    recognition.onend = () => {
      isRecording = false;
      if (toggleRecBtn) toggleRecBtn.textContent = '🎙️ Start Voice Recording';
    };
  }

  toggleRecBtn?.addEventListener('click', () => {
    prepMethodsUsed.add('voice_dictation');
    updatePrepMethodsBadges();
    if (!recognition) {
      voiceInput?.focus();
      return;
    }
    if (isRecording) {
      recognition.stop();
      isRecording = false;
      toggleRecBtn.textContent = '🎙️ Start Voice Recording';
    } else {
      recognition.start();
      isRecording = true;
      toggleRecBtn.textContent = '⏹️ Stop Recording...';
    }
  });

  // Voice button for Block 2 Teacher Lesson Plan Instructions
  const voiceLessonBtn = document.getElementById('voiceDictateLessonBtn');
  voiceLessonBtn?.addEventListener('click', () => {
    activePrepSection = 'lessonPlan';
    if (recognition && !isRecording) {
      const tempRec = new SpeechRec();
      tempRec.lang = 'en-US';
      voiceLessonBtn.textContent = '⏹️ Listening...';
      tempRec.onresult = (ev) => {
        const spoken = ev.results?.[0]?.[0]?.transcript || '';
        if (spoken && lessonInstructionsEditor) {
          const cur = lessonInstructionsEditor.getValue();
          lessonInstructionsEditor.setValue(cur ? `${cur} ${spoken}` : spoken);
        }
      };
      tempRec.onend = () => {
        voiceLessonBtn.textContent = '🎤 Dictate Instructions';
      };
      tempRec.start();
    } else {
      lessonInstructionsEditor?.editorEl?.focus();
    }
  });

  // 3. Phone Camera / QR Modal for Block 1
  const openPhoneBtn = document.getElementById('openMaterialPhoneModalBtn');
  const closePhoneBtn = document.getElementById('closeMaterialPhoneModalBtn');
  const phoneModal = document.getElementById('materialPhoneModal');
  const triggerCameraBtn = document.getElementById('triggerDirectCameraMaterialBtn');
  const directCameraInput = document.getElementById('directCameraMaterialInput');

  openPhoneBtn?.addEventListener('click', async () => {
    if (phoneModal) phoneModal.style.display = 'flex';
    prepMethodsUsed.add('handwritten_photo');
    updatePrepMethodsBadges();
    await setupMaterialMobileBridge();
  });

  closePhoneBtn?.addEventListener('click', () => {
    if (phoneModal) phoneModal.style.display = 'none';
    if (mobilePollInterval) clearInterval(mobilePollInterval);
  });

  triggerCameraBtn?.addEventListener('click', () => directCameraInput?.click());
  directCameraInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addHandwrittenImageToStudio({
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        data: ev.target.result
      });
      if (phoneModal) phoneModal.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  // 4. Synthesize & Format Material with AI Button (Strictly processes ONLY provided notes/voice/photos)
  const synthBtn = document.getElementById('synthesizeMaterialsBtn');
  synthBtn?.addEventListener('click', async () => {
    const typedText = (materialStudioEditor ? materialStudioEditor.getValue() : '').trim();
    const voiceTranscript = (document.getElementById('voiceTranscriptInput')?.value || '').trim();
    if (!typedText && !voiceTranscript && studioImages.length === 0) {
      updateLessonPlanStatusPill('⚠️ Please type notes, record voice dictation, or attach a photo in Block 1 first', false);
      return;
    }

    const origText = synthBtn.innerHTML;
    synthBtn.disabled = true;
    synthBtn.innerHTML = '⏳ LLM is recognizing handwritten notes, voice & formulas...';
    prepMethodsUsed.add('ai_synthesis');
    updatePrepMethodsBadges();

    try {
      const res = await fetch('/api/materials/process-multimodal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typedText,
          voiceTranscript,
          instructions: 'Format only the provided input into clean text and LaTeX formulas without adding any external topics.',
          images: studioImages.map(img => ({ mimeType: img.mimeType, data: img.data }))
        })
      });
      const data = await res.json();
      const synthText = (data.result?.synthesizedMarkdown || data.result?.synthesizedMaterial || '').trim();
      if (data.success && synthText) {
        resetBlock2LessonPlanOnly();
        await addLoadedFileToStudio({
          title: 'Synthesized Teacher Studio Material',
          content: synthText,
          source: 'Teacher Studio Synthesis',
          explicitCategory: 'material'
        });
        const previewSnippet = synthText.replace(/\s+/g, ' ').slice(0, 55);
        showActiveMaterialBadge(`✨ Recognized in Block 1 ("${previewSnippet}${synthText.length > 55 ? '...' : ''}") — ${loadedStudioFiles.length} document(s) ready. Push "✨ Propose Lesson Plan Draft" in Block 2 when ready.`);
        updateLessonPlanStatusPill(`Notes Recognized (${loadedStudioFiles.length} Doc(s) in Studio) — Waiting for Teacher to Generate Lesson Plan`, false);
      }
    } catch (err) {
      console.warn('Synthesis error:', err);
    } finally {
      synthBtn.disabled = false;
      synthBtn.innerHTML = origText;
    }
  });
}

async function setupMaterialMobileBridge() {
  try {
    const res = await fetch('/api/mobile-bridge/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'teacher_material' })
    });
    const data = await res.json();
    if (data.success && data.session) {
      mobileBridgeToken = data.session.token;
      const captureUrl = `${window.location.origin}/mobile-capture.html?token=${encodeURIComponent(mobileBridgeToken)}&mode=teacher_material`;
      const qrImg = document.getElementById('materialQrImg');
      const qrLink = document.getElementById('materialQrDirectLink');
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(captureUrl)}`;
      }
      if (qrLink) qrLink.href = captureUrl;

      let knownCount = 0;
      if (mobilePollInterval) clearInterval(mobilePollInterval);
      mobilePollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/mobile-bridge/${encodeURIComponent(mobileBridgeToken)}`);
          const pollData = await pollRes.json();
          const uploads = pollData.session?.uploads || [];
          if (uploads.length > knownCount) {
            for (let i = knownCount; i < uploads.length; i++) {
              addHandwrittenImageToStudio({
                name: `Phone_Capture_${i + 1}.jpg`,
                mimeType: uploads[i].mimeType || 'image/jpeg',
                data: uploads[i].data
              });
            }
            knownCount = uploads.length;
            const phoneModal = document.getElementById('materialPhoneModal');
            if (phoneModal) phoneModal.style.display = 'none';
          }
        } catch (e) { /* ignore poll errors */ }
      }, 2500);
    }
  } catch (e) {
    console.warn('Could not create mobile bridge session:', e);
  }
}

function addHandwrittenImageToStudio({ name, mimeType, data }) {
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  studioImages.push({ id, name, mimeType, data });
  renderHandwrittenGallery();
  showActiveMaterialBadge(`📷 Attached handwritten sheet: ${name}`);
}

function renderHandwrittenGallery() {
  const wrap = document.getElementById('handwrittenGalleryWrap');
  const countEl = document.getElementById('handwrittenCount');
  const thumbs = document.getElementById('handwrittenThumbnails');
  if (!wrap || !thumbs) return;

  if (studioImages.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  if (countEl) countEl.textContent = String(studioImages.length);

  thumbs.innerHTML = studioImages.map(img => `
    <div style="position:relative; width:130px; border:1px solid #dadce0; border-radius:8px; background:#ffffff; padding:0.35rem; box-shadow:0 1px 2px rgba(60,64,67,0.1);">
      <img src="${img.data}" alt="${img.name}" style="width:100%; height:84px; object-fit:cover; border-radius:4px;" />
      <div style="font-size:0.7rem; color:#3c4043; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:0.25rem;">${img.name}</div>
      <button type="button" data-remove-img="${img.id}" style="position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; border:none; background:rgba(217,48,37,0.9); color:#fff; font-size:0.7rem; cursor:pointer;">✕</button>
    </div>
  `).join('');

  thumbs.querySelectorAll('[data-remove-img]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-remove-img');
      studioImages = studioImages.filter(i => i.id !== targetId);
      renderHandwrittenGallery();
    });
  });
}

function showActiveMaterialBadge(text) {
  const badge = document.getElementById('activeMaterialBadge');
  const nameEl = document.getElementById('activeMaterialName');
  if (badge && nameEl) {
    nameEl.textContent = text;
    badge.style.display = 'flex';
  }
}

/**
 * Block 2 & Point 4: Adaptive Exercise Pool Selection UI (Up to 10 Problems per Tier)
 */
function initAdaptiveExercisePoolUI() {
  window.selectLevelCard = function(lvl) {
    selectedExerciseTab = lvl;
    activePrepSection = 'lessonPlan';

    ['A', 'B', 'C'].forEach(t => {
      const card = document.getElementById(`exTab${t}`);
      const countBadge = document.getElementById(`poolCountBadge${t}`);
      const poolList = currentExercisePool[t] || [];
      const selectedCount = poolList.filter(item => item.selected !== false).length;
      if (countBadge) {
        countBadge.textContent = `${selectedCount}/${poolList.length} selected`;
      }
      if (card) {
        if (t === lvl) {
          card.style.border = '2px solid #1a73e8';
          card.style.background = '#e8f0fe';
          card.style.boxShadow = '0 2px 6px rgba(26, 115, 232, 0.15)';
        } else {
          card.style.border = '1px solid #dadce0';
          card.style.background = '#ffffff';
          card.style.boxShadow = 'none';
        }
      }
    });

    renderExercisePoolList(lvl);
  };

  // Adaptive Entry Mode Radio Cards styling
  document.querySelectorAll('input[name="adaptiveEntryMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isAuto = radio.value === 'AUTO_DIAGNOSE' && radio.checked;
      const cardAuto = document.getElementById('modeCardAutoDiag');
      const cardFixed = document.getElementById('modeCardProgressive');
      if (cardAuto && cardFixed) {
        cardAuto.style.border = isAuto ? '2px solid #1a73e8' : '1px solid #dadce0';
        cardAuto.style.background = isAuto ? '#e8f0fe' : '#ffffff';
        cardFixed.style.border = !isAuto ? '2px solid #1a73e8' : '1px solid #dadce0';
        cardFixed.style.background = !isAuto ? '#e8f0fe' : '#ffffff';
      }
    });
  });

  // Select All, Clear Selection & Regenerate buttons
  document.getElementById('selectAllPoolBtn')?.addEventListener('click', () => {
    const list = currentExercisePool[selectedExerciseTab] || [];
    list.forEach(item => { item.selected = true; });
    window.selectLevelCard(selectedExerciseTab);
  });

  document.getElementById('deselectAllPoolBtn')?.addEventListener('click', () => {
    const list = currentExercisePool[selectedExerciseTab] || [];
    list.forEach(item => { item.selected = false; });
    window.selectLevelCard(selectedExerciseTab);
  });

  document.getElementById('regeneratePoolTierBtn')?.addEventListener('click', async () => {
    await triggerGenerateLessonDraft();
  });

  document.getElementById('generateLessonDraftBtn')?.addEventListener('click', async () => {
    await triggerGenerateLessonDraft();
  });

  // Sync checkboxes when "Problems per student per tier" dropdown changes
  document.getElementById('repetitionsPerTierSelect')?.addEventListener('change', (e) => {
    const repsLimit = Number(e.target.value || 3);
    ['A', 'B', 'C'].forEach(tier => {
      const list = currentExercisePool[tier] || [];
      list.forEach((item, idx) => {
        item.selected = idx < repsLimit;
      });
    });
    window.selectLevelCard(selectedExerciseTab);
  });

  // Render initial clean Level A state (Foundational starting tier)
  window.selectLevelCard('A');
}

function renderExercisePoolList(lvl) {
  const headerEl = document.getElementById('activePoolTierHeader');
  const listEl = document.getElementById('exercisePoolOptionsList');
  const diagWrap = document.getElementById('diagnosticPoolPreview');
  const diagEl = document.getElementById('diagnosticQuestionText');
  if (!listEl) return;

  const titles = {
    A: 'Generated Exercise Pool: Level A (Foundational — up to 10 problems)',
    B: 'Generated Exercise Pool: Level B (Standard Curriculum — up to 10 problems)',
    C: 'Generated Exercise Pool: Level C (Advanced / Mastery — up to 10 problems)'
  };
  if (headerEl) headerEl.textContent = titles[lvl] || titles.B;

  if (diagWrap && diagEl) {
    if (currentExercisePool.diagnostic?.length > 0) {
      diagWrap.style.display = 'block';
      diagEl.innerHTML = currentExercisePool.diagnostic[0].problem;
      renderMathSafe(diagEl);
    } else {
      diagWrap.style.display = 'none';
    }
  }

  const items = currentExercisePool[lvl] || [];
  if (items.length === 0) {
    listEl.innerHTML = `
      <div style="padding:1.25rem; text-align:center; border:1px dashed #bdc1c6; border-radius:8px; background:#f8f9fa; color:#5f6368;">
        <div style="font-size:1.2rem; margin-bottom:0.25rem;">📋</div>
        <div style="font-size:0.88rem; font-weight:600; color:#202124; margin-bottom:0.2rem;">
          No Exercise Pool Generated Yet for Level ${lvl}
        </div>
        <p style="font-size:0.78rem; max-width:500px; margin:0 auto;">
          Use <strong>✨ Propose Lesson Plan Draft &amp; Generate 30-Problem Pool</strong> at the top of Block 2 (or choose an <strong>Existing Lesson Plan</strong>) to populate the 10-problem pool for each tier.
        </p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map((item, idx) => `
    <label style="display:flex; align-items:flex-start; gap:0.75rem; padding:0.7rem 0.85rem; border-radius:8px; border:1px solid ${item.selected !== false ? '#d2e3fc' : '#dadce0'}; background:${item.selected !== false ? '#f8fbff' : '#ffffff'}; cursor:pointer; transition:all 0.12s;">
      <input type="checkbox" data-pool-idx="${idx}" ${item.selected !== false ? 'checked' : ''} style="margin-top:0.25rem; width:16px; height:16px; accent-color:#1a73e8;" />
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.2rem;">
          <span style="font-size:0.76rem; font-weight:700; color:#1967d2;">Problem ${lvl}${idx + 1}</span>
          <span class="pool-math-target" style="font-size:0.74rem; color:#137333; background:#e6f4ea; padding:0.1rem 0.45rem; border-radius:4px;">Target: ${item.targetAnswer || 'Step-by-step'}</span>
        </div>
        <div class="pool-math-text" style="font-size:0.88rem; color:#202124; font-weight:500;">${item.problem}</div>
        <div class="pool-math-hint" style="font-size:0.76rem; color:#5f6368; margin-top:0.2rem;">💡 Socratic Hint: ${item.hint || item.rubric || ''}</div>
      </div>
    </label>
  `).join('');

  listEl.querySelectorAll('input[type="checkbox"][data-pool-idx]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.getAttribute('data-pool-idx'));
      if (currentExercisePool[lvl] && currentExercisePool[lvl][idx]) {
        currentExercisePool[lvl][idx].selected = cb.checked;
        window.selectLevelCard(lvl);
      }
    });
  });

  renderMathSafe(listEl);
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
    } catch (e) { /* ignore KaTeX error */ }
  } else if (attempt < 15) {
    setTimeout(() => renderMathSafe(el, attempt + 1), 120);
  }
}

/**
 * Gathers ALL loaded documents (curricula + course materials + any in-editor teacher notes)
 * so every loaded document is used when building the Lesson Plan Draft.
 */
function collectAllLoadedDocumentsForDraft(explicitMaterials = null) {
  const gradeLevel = document.getElementById('gradeSelect')?.value || 'Grade 12';
  const subject = document.getElementById('subjectSelect')?.value || 'Mathematics';
  const curSelect = document.getElementById('curriculumSelect');
  const curriculumCode = curSelect?.value || 'canada';
  const editorMat = materialStudioEditor ? materialStudioEditor.getValue().trim() : '';

  const docs = loadedStudioFiles.map(f => ({ ...f }));

  if (explicitMaterials !== null && String(explicitMaterials).trim()) {
    const expText = String(explicitMaterials).trim();
    const alreadyPresent = docs.some(d => d.content && expText.includes(d.content.slice(0, 80)));
    if (!alreadyPresent) {
      docs.push({
        id: `doc-explicit-${Date.now().toString(36)}`,
        title: (document.getElementById('titleInput')?.value || '').trim() || 'Selected Course Material',
        content: expText,
        source: attachedMaterialSource || 'Course Library',
        docCategory: 'material',
        curriculumCode,
        gradeLevel,
        subject
      });
    }
  } else if (docs.length === 0 && editorMat) {
    docs.push({
      id: 'doc-editor-notes',
      title: (document.getElementById('titleInput')?.value || '').trim() || 'Teacher Studio Reference Notes',
      content: editorMat,
      source: attachedMaterialSource || 'Block 1 Editor',
      docCategory: 'material',
      curriculumCode,
      gradeLevel,
      subject
    });
  } else if (docs.length > 0 && editorMat && editorMat !== lastLoadedMaterialText) {
    if (docs.length === 1 && !/^===\s*\[/m.test(editorMat)) {
      docs[0].content = editorMat;
    } else {
      const existingJoined = docs.map(d => d.content).join('\n');
      const extraLines = editorMat
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 6 && !l.startsWith('===') && !existingJoined.includes(l));
      if (extraLines.length > 0) {
        docs.push({
          id: 'doc-extra-editor-notes',
          title: 'Additional Teacher Studio Notes',
          content: extraLines.join('\n'),
          source: 'Block 1 Editor',
          docCategory: 'material',
          curriculumCode,
          gradeLevel,
          subject
        });
      }
    }
  }

  // Include active MHF4U lesson curriculum expectations if selected
  if (currentSelectedLesson && Array.isArray(currentSelectedLesson.specificExpectations) && currentSelectedLesson.specificExpectations.length > 0) {
    const mhfTitle = `Ontario MHF4U Curriculum: ${currentSelectedLesson.title}`;
    if (!docs.some(d => d.title === mhfTitle)) {
      docs.unshift({
        id: `cur-mhf4u-${currentSelectedLesson.id || 'unit'}`,
        title: mhfTitle,
        content: [
          ...(currentSelectedLesson.overallExpectations || []),
          ...(currentSelectedLesson.specificExpectations || [])
        ].join('\n'),
        source: 'Ontario MHF4U Curriculum',
        docCategory: 'curriculum',
        curriculumCode: 'canada',
        gradeLevel: 'Grade 12',
        subject: 'Mathematics'
      });
    }
  }

  // Include custom saved curriculum content if selected in #curriculumSelect and not yet in docs
  const customCur = customCurricula.find(c => c.code === curriculumCode);
  if (customCur && customCur.content && !docs.some(d => d.docCategory === 'curriculum' && d.title.includes(customCur.label))) {
    docs.unshift({
      id: `cur-custom-${customCur.code}`,
      title: `Curriculum: ${customCur.label}`,
      content: customCur.content,
      source: 'Saved Curriculum Standard',
      docCategory: 'curriculum',
      curriculumCode: customCur.code,
      gradeLevel,
      subject
    });
  }

  const curriculaFiles = docs.filter(f => f.docCategory === 'curriculum');
  const materialFiles = docs.filter(f => f.docCategory !== 'curriculum');
  const ordered = [...curriculaFiles, ...materialFiles];

  const combinedMaterials = ordered.length > 1
    ? ordered.map((f, idx) => {
        const roleHeader = f.docCategory === 'curriculum' ? '📘 CURRICULUM STANDARD' : '📄 COURSE MATERIAL';
        return `=== [${roleHeader} ${idx + 1}: ${f.title} (${f.source || 'Teacher Studio'})] ===\n${f.content}`;
      }).join('\n\n')
    : (explicitMaterials !== null ? String(explicitMaterials).trim() : (editorMat || lastLoadedMaterialText || ordered[0]?.content || '')).trim();

  return {
    loadedDocuments: ordered,
    combinedMaterials,
    curriculaCount: curriculaFiles.length,
    materialsCount: materialFiles.length
  };
}

/**
 * Generates Lesson Plan Draft + 30-Problem Exercise Pool (10 Level A, 10 Level B, 10 Level C)
 * grounded in ALL Block 1 loaded curriculum documents, material documents, and teacher instructions.
 */
async function triggerGenerateLessonDraft(options = {}) {
  const { preserveHeaderFields = false, explicitMaterials = null, explicitCourseName = null } = options;
  activePrepSection = 'lessonPlan';

  const {
    loadedDocuments,
    combinedMaterials: materials,
    curriculaCount,
    materialsCount
  } = collectAllLoadedDocumentsForDraft(explicitMaterials);

  const parsedWindow = parseUnifiedLessonPlanWindow();
  const teacherInstructions = parsedWindow.teacherInstructions;
  const manualTitle = (document.getElementById('titleInput')?.value || '').trim();

  // Guard 1: Never generate a Lesson Plan if the teacher hasn't entered or selected anything
  if (!materials && loadedDocuments.length === 0 && !teacherInstructions && !manualTitle && !explicitCourseName) {
    updateLessonPlanStatusPill('⚠️ Please import/type reference materials in Block 1 or enter a Lesson Plan Title first', false);
    return;
  }

  // Guard 2: If Block 1 only contains bare numbers (like "1 2 3 5") with no words/formulas and no Title/Instructions, do not invent a Lesson Plan
  if (materials && !/[a-zA-Z\\=]/.test(materials) && !teacherInstructions && !manualTitle && !explicitCourseName) {
    updateLessonPlanStatusPill(`⚠️ Block 1 only contains numbers ("${materials.slice(0, 24)}") — Please add a topic or Lesson Plan Title first`, false);
    showActiveMaterialBadge(`⚠️ Block 1 only has numbers ("${materials.slice(0, 24)}"). Please type or dictate a topic, formula, or Lesson Plan Title before generating a Lesson Plan.`);
    return;
  }

  const btn = document.getElementById('generateLessonDraftBtn');
  const origHtml = btn ? btn.innerHTML : '';
  const totalDocsCount = loadedDocuments.length;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = totalDocsCount > 1
      ? `⏳ Synthesizing ${totalDocsCount} Loaded Documents (${curriculaCount} Curriculum, ${materialsCount} Material) into Lesson Plan & 30-Problem Pool...`
      : '⏳ Generating Lesson Plan & 30-Problem Pool (10 per Tier A/B/C)...';
  }
  updateLessonPlanStatusPill(
    totalDocsCount > 1
      ? `⏳ Generating Lesson Plan from all ${totalDocsCount} Loaded Documents (${curriculaCount} Curriculum, ${materialsCount} Material)...`
      : '⏳ Generating Lesson Plan & 30 Problems...',
    false
  );

  try {
    const gradeLevel = document.getElementById('gradeSelect')?.value || 'Grade 12';
    const subject = document.getElementById('subjectSelect')?.value || 'Mathematics';
    const curriculum = document.getElementById('curriculumSelect')?.value || 'canada';
    const titleHint = preserveHeaderFields ? manualTitle : '';
    const courseName = explicitCourseName || lastLoadedCourseName || `${subject} (${gradeLevel}) ${titleHint}`.trim();

    const res = await fetch('/api/lesson-plan/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseName,
        gradeLevel,
        subject,
        curriculum,
        materials,
        loadedDocuments,
        teacherInstructions
      })
    });
    const data = await res.json();
    if (data.success && data.draft) {
      const d = data.draft;
      if (!preserveHeaderFields) {
        if (d.title) {
          document.getElementById('titleInput').value = d.title;
        }
        if (d.subject && document.getElementById('subjectSelect')) {
          document.getElementById('subjectSelect').value = d.subject;
        }
        if (d.gradeLevel && document.getElementById('gradeSelect')) {
          const gMatch = String(d.gradeLevel).match(/Grade\s+\d+/i);
          if (gMatch) document.getElementById('gradeSelect').value = gMatch[0];
        }
        const stepsArr = (Array.isArray(d.socraticSteps) && d.socraticSteps.length > 0)
          ? d.socraticSteps
          : (Array.isArray(d.targetMilestones) ? d.targetMilestones : []);
        setUnifiedLessonPlanWindow({
          learningGoal: d.learningGoal || '',
          milestones: stepsArr,
          teacherInstructions
        });
      }

      if (d.exercisePool) {
        const repsLimit = Number(document.getElementById('repetitionsPerTierSelect')?.value || 3);
        currentExercisePool = {
          diagnostic: (d.exercisePool.diagnostic || []).map(x => ({ ...x, selected: true })),
          A: (d.exercisePool.levelA || []).map((x, idx) => ({ ...x, selected: idx < repsLimit })),
          B: (d.exercisePool.levelB || []).map((x, idx) => ({ ...x, selected: idx < repsLimit })),
          C: (d.exercisePool.levelC || []).map((x, idx) => ({ ...x, selected: idx < repsLimit }))
        };
        window.selectLevelCard(selectedExerciseTab);
      }

      const totalCount = (currentExercisePool.A?.length || 0) + (currentExercisePool.B?.length || 0) + (currentExercisePool.C?.length || 0);
      const repsLimit = Number(document.getElementById('repetitionsPerTierSelect')?.value || 3);
      const usedMeta = d.documentsUsed || {
        totalCount: totalDocsCount,
        curriculaCount,
        materialsCount,
        allTitles: loadedDocuments.map(x => x.title)
      };
      const docsSummary = usedMeta.totalCount > 1
        ? ` • All ${usedMeta.totalCount} Docs Used (${usedMeta.curriculaCount} Curriculum, ${usedMeta.materialsCount} Material)`
        : '';
      updateLessonPlanStatusPill(`✓ Ready: "${d.title}"${docsSummary} (${totalCount} Problems Generated • ${repsLimit}/10 Selected per Tier)`, true);
      if (attachedMaterialSource || usedMeta.totalCount > 0) {
        const namesLabel = (usedMeta.allTitles && usedMeta.allTitles.length > 0)
          ? usedMeta.allTitles.join(' + ')
          : attachedMaterialSource;
        showActiveMaterialBadge(`📚 Used All ${usedMeta.totalCount || 1} Loaded Document(s) (${namesLabel}) — ✓ Lesson Plan "${d.title}" & ${totalCount}-Problem Pool (${repsLimit} per tier selected) generated below!`);
      }
      await saveCurrentLessonPlanToLibrary();
    }
  } catch (err) {
    console.warn('Error generating lesson draft:', err);
    updateLessonPlanStatusPill('⚠️ Generation Error — Please Retry', false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

/**
 * Load Ontario MHF4U Curriculum & Templates (Tab 2 & Existing Lesson Plan Dropdown)
 */
async function loadMHF4UCurriculum() {
  try {
    const res = await fetch('/api/curriculum/MHF4U');
    const data = await res.json();
    if (data.success && data.curriculum) {
      mhf4uCurriculum = data.curriculum;
      populateUnitSelector();
    }
  } catch (err) {
    console.error('Failed to load MHF4U curriculum:', err);
  }
}

function populateUnitSelector() {
  const unitSelect = document.getElementById('unitSelect');
  const lessonSelect = document.getElementById('lessonSelect');
  if (!unitSelect || !mhf4uCurriculum) return;

  unitSelect.innerHTML = mhf4uCurriculum.units.map((u, idx) =>
    `<option value="${u.id}" ${idx === 0 ? 'selected' : ''}>Unit ${u.number}: ${u.title}</option>`
  ).join('');

  unitSelect.addEventListener('change', () => populateLessonSelector(unitSelect.value));
  lessonSelect?.addEventListener('change', () => {
    const unit = mhf4uCurriculum.units.find(u => u.id === unitSelect.value);
    const lesson = unit?.lessons.find(l => l.id === lessonSelect.value);
    if (lesson) selectMHF4ULesson(lesson);
  });

  document.getElementById('applyMhf4uLessonBtn')?.addEventListener('click', async () => {
    const unit = mhf4uCurriculum.units.find(u => u.id === unitSelect.value);
    let lesson = unit?.lessons.find(l => l.id === lessonSelect?.value) || currentSelectedLesson;
    if (!lesson && lessonSelect?.value) {
      for (const u of mhf4uCurriculum.units) {
        const found = u.lessons?.find(l => l.id === lessonSelect.value);
        if (found) {
          lesson = found;
          break;
        }
      }
    }
    if (!lesson && unit?.lessons?.length > 0) {
      lesson = unit.lessons[0];
    }
    if (lesson) {
      await applyExistingMhf4uLessonToStudio(lesson);
      document.getElementById('tabBtnStudio')?.click();
    }
  });

  populateLessonSelector(unitSelect.value || mhf4uCurriculum.units[0]?.id || 'unit-1-polynomial-functions', null, false);
}

function populateLessonSelector(unitId, defaultLessonId = null, autoSelectLesson = true) {
  const lessonSelect = document.getElementById('lessonSelect');
  const unit = mhf4uCurriculum?.units.find(u => u.id === unitId);
  if (!lessonSelect || !unit) return;

  lessonSelect.innerHTML = unit.lessons.map(l =>
    `<option value="${l.id}" ${l.id === defaultLessonId ? 'selected' : ''}>${l.title}</option>`
  ).join('');

  if (autoSelectLesson) {
    const targetLesson = unit.lessons.find(l => l.id === defaultLessonId) || unit.lessons[0];
    if (targetLesson) selectMHF4ULesson(targetLesson);
  }
}

function selectMHF4ULesson(lesson) {
  currentSelectedLesson = lesson;
  const expList = document.getElementById('expectationsList');
  if (expList && lesson.specificExpectations) {
    expList.innerHTML = lesson.specificExpectations.map(exp => `<li>${exp}</li>`).join('');
    renderMathSafe(expList);
  }
}

async function applyExistingMhf4uLessonToStudio(lesson) {
  if (!lesson) return;
  document.getElementById('titleInput').value = lesson.title;
  document.getElementById('curriculumSelect').value = 'canada';
  document.getElementById('gradeSelect').value = 'Grade 12';
  document.getElementById('subjectSelect').value = 'Mathematics';

  const goalText = (lesson.overallExpectations || []).join(' ') || `Master ${lesson.title}`;
  const stepsArr = Array.isArray(lesson.specificExpectations)
    ? lesson.specificExpectations.map((s, i) => `Step ${i + 1}: ${s}`)
    : [];
  setUnifiedLessonPlanWindow({
    learningGoal: goalText,
    milestones: stepsArr
  });

  if (lesson.materialsSnippet && materialStudioEditor) {
    materialStudioEditor.setValue(lesson.materialsSnippet);
    attachedMaterialSource = `Ontario MHF4U Curriculum (${lesson.title})`;
    showActiveMaterialBadge(`📘 ${attachedMaterialSource}`);
  }

  await triggerGenerateLessonDraft({ preserveHeaderFields: true });
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    templates = data.templates || [];
    renderTemplates();
  } catch (err) {
    console.error('Failed to load templates:', err);
  }
}

function renderTemplates() {
  const grid = document.getElementById('templateGrid');
  if (!grid) return;
  grid.innerHTML = '';

  templates.forEach(tpl => {
    const card = document.createElement('div');
    card.className = `template-card ${tpl.id === activeTemplateId ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="template-subject">${tpl.subject || 'STEM'} • ${tpl.gradeLevel}</div>
      <div class="template-title">${tpl.title}</div>
      <div class="template-desc">${tpl.topic}</div>
    `;
    card.addEventListener('click', async () => {
      await applyTemplateToStudio(tpl);
      renderTemplates();
      document.getElementById('tabBtnStudio')?.click();
    });
    grid.appendChild(card);
  });
}

async function applyTemplateToStudio(tpl) {
  if (!tpl) return;
  activeTemplateId = tpl.id;
  document.getElementById('titleInput').value = tpl.title;
  if (tpl.curriculum && document.getElementById('curriculumSelect')) {
    document.getElementById('curriculumSelect').value = tpl.curriculum;
  }
  if (tpl.gradeLevel && document.getElementById('gradeSelect')) {
    document.getElementById('gradeSelect').value = tpl.gradeLevel;
  }
  if (tpl.subject && document.getElementById('subjectSelect')) {
    document.getElementById('subjectSelect').value = tpl.subject;
  }
  setUnifiedLessonPlanWindow({
    learningGoal: tpl.learningGoal || '',
    milestones: tpl.targetMilestones || []
  });
  if (tpl.courseMaterials && materialStudioEditor) {
    materialStudioEditor.setValue(tpl.courseMaterials);
    attachedMaterialSource = tpl.courseMaterialsSource || `Template: ${tpl.title}`;
    showActiveMaterialBadge(`📚 ${attachedMaterialSource}`);
  }
  // Automatically generate the 10-per-tier Exercise Pool matching this template while keeping its exact title/goal/milestones!
  await triggerGenerateLessonDraft({ preserveHeaderFields: true });
}

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    models = data.models || [];
    const select = document.getElementById('modelSelect');
    if (select && models.length > 0) {
      select.innerHTML = models.map(m =>
        `<option value="${m.provider}:${m.id}" ${m.id === 'gemini-3.1-flash-lite' ? 'selected' : ''}>${m.name} (${m.badge})</option>`
      ).join('');
    }
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

async function loadMaterialLibrary(selectItemId = '') {
  try {
    const res = await fetch('/api/materials-library');
    const data = await res.json();
    materialLibrary = data.library || [];
    customCurricula = data.customCurricula || [];
    renderMaterialLibraryDropdown(selectItemId);
    renderCustomCurriculaInDropdown();
  } catch (err) {
    console.error('Failed to load material library:', err);
  }
}

function renderMaterialLibraryDropdown(selectItemId = '') {
  const select = document.getElementById('materialLibrarySelect');
  if (!select) return;

  const customItems = materialLibrary.filter(m => m.isCustomSaved);
  const builtInItems = materialLibrary.filter(m => !m.isCustomSaved);

  select.innerHTML = `<option value="">+ Add Material or Curriculum from Library (${materialLibrary.length})...</option>`;

  if (customItems.length > 0) {
    const grpCustom = document.createElement('optgroup');
    grpCustom.label = `⭐ Saved in Library by Teacher (${customItems.length})`;
    customItems.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      const catIcon = item.docCategory === 'curriculum' ? '📘' : '📄';
      const typeTag = item.recognizedType ? `${item.recognizedType} • ` : '';
      const tag = item.curriculum || item.subject || 'Course';
      opt.textContent = `⭐ ${catIcon} [${tag}] ${item.title} (${typeTag}${item.gradeLevel || 'Grade 12'})`;
      grpCustom.appendChild(opt);
    });
    select.appendChild(grpCustom);
  }

  const grpBuiltIn = document.createElement('optgroup');
  grpBuiltIn.label = `📘 Pre-Loaded Curricula & Reference Materials (${builtInItems.length})`;
  builtInItems.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    const tag = item.curriculum || item.subject || 'Course';
    opt.textContent = `[${tag}] ${item.title}`;
    grpBuiltIn.appendChild(opt);
  });
  select.appendChild(grpBuiltIn);

  if (selectItemId && materialLibrary.some(m => m.id === selectItemId)) {
    select.value = selectItemId;
  }
}

/**
 * Adds a file/resource (Curriculum or Course Material) into the Multi-File Studio Stack,
 * runs automatic recognition, and combines all loaded files in the WYSIWYG Material Studio editor.
 */
async function addLoadedFileToStudio({ title = '', content = '', source = 'Teacher Studio', explicitCategory = '' } = {}) {
  // If the teacher already typed custom notes into the editor before loading their first file, preserve those notes in the stack
  if (loadedStudioFiles.length === 0 && materialStudioEditor) {
    const existingTyped = materialStudioEditor.getValue().trim();
    if (existingTyped && existingTyped !== lastLoadedMaterialText && existingTyped !== String(content || '').trim()) {
      loadedStudioFiles.push({
        id: `file-typed-${Date.now().toString(36)}`,
        title: 'Teacher Typed Notes',
        content: existingTyped,
        source: 'Block 1 Editor',
        docCategory: 'material',
        recognizedType: 'Teacher Reference Notes & Examples',
        curriculum: 'Canada Ontario OSS',
        curriculumCode: document.getElementById('curriculumSelect')?.value || 'canada',
        gradeLevel: document.getElementById('gradeSelect')?.value || 'Grade 12',
        subject: document.getElementById('subjectSelect')?.value || 'Mathematics',
        formulasCount: 0
      });
    }
  }

  const modeSel = document.getElementById('loadTargetCategorySelect')?.value || 'auto';
  const categoryHint = explicitCategory || (modeSel === 'auto' ? '' : modeSel);

  const rec = await recognizeAndDisplayMaterial({
    title,
    content,
    source,
    categoryHint
  });

  const resolvedCategory = categoryHint || rec?.docCategory || 'material';
  const fileEntry = {
    id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: title || rec?.title || 'Loaded File',
    content: String(content || '').trim(),
    source: source || 'Teacher Studio',
    docCategory: resolvedCategory,
    recognizedType: rec?.recognizedType || (resolvedCategory === 'curriculum' ? 'Curriculum Standard & Expectations' : 'Formula Reference Sheet & Worked Examples'),
    curriculum: rec?.curriculum || 'Canada Ontario OSS',
    curriculumCode: rec?.curriculumCode || 'canada',
    gradeLevel: rec?.gradeLevel || 'Grade 12',
    subject: rec?.subject || 'Mathematics',
    formulasCount: rec?.formulasCount || 0
  };

  // Avoid exact duplicate title+source; replace if same title+source, otherwise append to stack
  const existingIdx = loadedStudioFiles.findIndex(f => f.title === fileEntry.title && f.source === fileEntry.source);
  if (existingIdx >= 0) {
    loadedStudioFiles[existingIdx] = fileEntry;
  } else {
    loadedStudioFiles.push(fileEntry);
  }

  syncLoadedFilesToStudioEditor();
  return fileEntry;
}

function syncLoadedFilesToStudioEditor() {
  renderLoadedStudioFilesList();

  if (loadedStudioFiles.length === 0) {
    return;
  }

  // Combine Curricula first, then Course Materials
  const curriculaFiles = loadedStudioFiles.filter(f => f.docCategory === 'curriculum');
  const materialFiles = loadedStudioFiles.filter(f => f.docCategory !== 'curriculum');
  const ordered = [...curriculaFiles, ...materialFiles];

  const combinedText = ordered
    .map((f, idx) => {
      const roleHeader = f.docCategory === 'curriculum' ? '📘 CURRICULUM STANDARD' : '📄 COURSE MATERIAL';
      return ordered.length > 1
        ? `=== [${roleHeader} ${idx + 1}: ${f.title} (${f.source})] ===\n${f.content}`
        : f.content;
    })
    .join('\n\n');

  lastLoadedMaterialText = combinedText;
  const allTitles = ordered.map(f => f.title).join(' + ');
  const latest = loadedStudioFiles[loadedStudioFiles.length - 1];
  lastLoadedCourseName = `${latest.subject || 'Course'} (${latest.gradeLevel || 'Grade 12'}) ${allTitles}`;
  materialStudioEditor?.setValue(combinedText);

  const curCount = curriculaFiles.length;
  const matCount = materialFiles.length;
  const namesList = loadedStudioFiles.map(f => f.title).join(' + ');
  attachedMaterialSource = `${loadedStudioFiles.length} Loaded File(s): ${namesList}`;

  showActiveMaterialBadge(
    `📂 ${loadedStudioFiles.length} File(s) Loaded (${curCount} Curriculum, ${matCount} Material): ${namesList} — Push "✨ Propose Lesson Plan Draft & Generate 30-Problem Pool" on the right when ready.`
  );
  updateLessonPlanStatusPill(
    `${loadedStudioFiles.length} File(s) Loaded (${curCount} Curriculum, ${matCount} Material) — Push "✨ Propose Lesson Plan Draft" to Generate`,
    false
  );
}

function renderLoadedStudioFilesList() {
  const container = document.getElementById('loadedStudioFilesContainer');
  const listEl = document.getElementById('loadedStudioFilesList');
  const totalEl = document.getElementById('loadedFilesTotalCount');
  const curEl = document.getElementById('loadedCurriculaCount');
  const matEl = document.getElementById('loadedMaterialsCount');
  if (!container || !listEl) return;

  if (loadedStudioFiles.length === 0) {
    container.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  const curCount = loadedStudioFiles.filter(f => f.docCategory === 'curriculum').length;
  const matCount = loadedStudioFiles.filter(f => f.docCategory !== 'curriculum').length;

  container.style.display = 'block';
  if (totalEl) totalEl.textContent = String(loadedStudioFiles.length);
  if (curEl) curEl.textContent = String(curCount);
  if (matEl) matEl.textContent = String(matCount);

  listEl.innerHTML = loadedStudioFiles.map((f) => {
    const isCur = f.docCategory === 'curriculum';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.5rem 0.7rem; background:#ffffff; border:1px solid ${isCur ? '#ceead6' : '#d2e3fc'}; border-left:4px solid ${isCur ? '#1e8e3e' : '#1a73e8'}; border-radius:6px;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap; margin-bottom:0.15rem;">
            <button type="button" class="toggle-file-cat-btn" data-file-id="${f.id}" title="Click to switch role between Curriculum and Material" style="border:1px solid ${isCur ? '#1e8e3e' : '#1a73e8'}; background:${isCur ? '#e6f4ea' : '#e8f0fe'}; color:${isCur ? '#137333' : '#1967d2'}; border-radius:4px; padding:0.1rem 0.45rem; font-size:0.68rem; font-weight:700; cursor:pointer;">
              ${isCur ? '📘 Curriculum' : '📄 Material'} ⇄
            </button>
            <span class="badge badge-blue" style="font-size:0.65rem;">${f.recognizedType}</span>
            <span style="font-size:0.7rem; color:#5f6368; font-weight:600;">${f.gradeLevel} • ${f.subject}</span>
          </div>
          <div style="font-size:0.8rem; font-weight:700; color:#202124; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${f.title} <span style="font-weight:400; font-size:0.72rem; color:#5f6368;">(${f.source})</span>
          </div>
        </div>
        <div style="display:flex; gap:0.35rem; align-items:center; flex-shrink:0;">
          <button type="button" class="btn btn-secondary save-single-file-lib-btn" data-file-id="${f.id}" style="font-size:0.7rem; padding:0.22rem 0.5rem; white-space:nowrap;" title="Save this item to the Curriculum / Material Library dropdown">
            💾 Save to Library
          </button>
          <button type="button" class="remove-loaded-file-btn" data-file-id="${f.id}" style="background:#fff8f8; border:1px solid #f5c2c7; color:#c5221f; border-radius:4px; padding:0.2rem 0.45rem; font-size:0.72rem; font-weight:700; cursor:pointer;" title="Remove this file">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.toggle-file-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = loadedStudioFiles.find(x => x.id === btn.getAttribute('data-file-id'));
      if (target) {
        target.docCategory = target.docCategory === 'curriculum' ? 'material' : 'curriculum';
        target.recognizedType = target.docCategory === 'curriculum'
          ? 'Curriculum Standard & Expectations'
          : 'Formula Reference Sheet & Worked Examples';
        syncLoadedFilesToStudioEditor();
      }
    });
  });

  listEl.querySelectorAll('.save-single-file-lib-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = loadedStudioFiles.find(x => x.id === btn.getAttribute('data-file-id'));
      if (target) {
        btn.textContent = '⏳...';
        await saveCurrentMaterialToLibrary(target);
        btn.textContent = '✅ Saved';
      }
    });
  });

  listEl.querySelectorAll('.remove-loaded-file-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-file-id');
      loadedStudioFiles = loadedStudioFiles.filter(x => x.id !== id);
      if (loadedStudioFiles.length === 0) {
        clearAllMaterialsAndResetStudio();
      } else {
        syncLoadedFilesToStudioEditor();
      }
    });
  });
}

function renderCustomCurriculaInDropdown() {
  const curSelect = document.getElementById('curriculumSelect');
  if (!curSelect || !Array.isArray(customCurricula)) return;
  customCurricula.forEach(c => {
    if (!c.code || !c.label) return;
    const exists = Array.from(curSelect.options).some(o => o.value === c.code);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = `⭐ ${c.label}`;
      curSelect.appendChild(opt);
    }
  });
}

/**
 * Automatically recognizes the document type, curriculum, grade, and subject of loaded material
 * and displays the recognition banner with a 1-click Save to Library & Dropdown action.
 */
async function recognizeAndDisplayMaterial({ title = '', content = '', source = 'Teacher Studio', categoryHint = '' } = {}) {
  try {
    const res = await fetch('/api/materials/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, source, categoryHint })
    });
    const data = await res.json();
    if (data.success && data.recognized) {
      const rec = data.recognized;
      lastRecognizedMeta = { ...rec, content };
      const card = document.getElementById('materialRecognitionCard');
      const typeBadge = document.getElementById('recTypeBadge');
      const curBadge = document.getElementById('recCurriculumBadge');
      const summaryEl = document.getElementById('recMetaSummary');
      const titleInp = document.getElementById('saveMaterialTitleInput');

      if (typeBadge) typeBadge.textContent = `🔍 ${rec.recognizedType}`;
      if (curBadge) curBadge.textContent = `📘 ${rec.curriculum}`;
      if (summaryEl) summaryEl.textContent = `${rec.gradeLevel} • ${rec.subject} (${rec.formulasCount || 0} formulas/rules detected)`;
      if (titleInp) titleInp.value = rec.title || title || `${rec.gradeLevel} ${rec.subject} Material`;
      if (card) card.style.display = 'block';

      // Auto-sync Curriculum, Grade Level, and Subject dropdowns
      const curSelect = document.getElementById('curriculumSelect');
      if (curSelect && rec.curriculumCode) {
        const hasOpt = Array.from(curSelect.options).some(o => o.value === rec.curriculumCode);
        if (hasOpt) curSelect.value = rec.curriculumCode;
      }
      if (rec.gradeLevel && document.getElementById('gradeSelect')) {
        document.getElementById('gradeSelect').value = rec.gradeLevel;
      }
      if (rec.subject && document.getElementById('subjectSelect')) {
        document.getElementById('subjectSelect').value = rec.subject;
      }
      return rec;
    }
  } catch (err) {
    console.warn('Could not recognize material metadata:', err);
  }
  return null;
}

async function saveCurrentMaterialToLibrary(customItem = null) {
  const editorText = materialStudioEditor ? materialStudioEditor.getValue().trim() : '';
  const content = (customItem?.content || editorText || lastLoadedMaterialText || '').trim();
  if (!content) {
    updateLessonPlanStatusPill('⚠️ Please enter or load curriculum/material in Block 1 before saving to the Library', false);
    return null;
  }

  const titleInp = document.getElementById('saveMaterialTitleInput');
  const titleVal = (customItem?.title || titleInp?.value || lastRecognizedMeta?.title || attachedMaterialSource || 'Saved Course Material').trim();
  const curriculumCode = customItem?.curriculumCode || document.getElementById('curriculumSelect')?.value || lastRecognizedMeta?.curriculumCode || 'canada';
  const gradeLevel = customItem?.gradeLevel || document.getElementById('gradeSelect')?.value || lastRecognizedMeta?.gradeLevel || 'Grade 12';
  const subject = customItem?.subject || document.getElementById('subjectSelect')?.value || lastRecognizedMeta?.subject || 'Mathematics';

  const btn1 = document.getElementById('saveMaterialToLibraryBtn');
  const btn2 = document.getElementById('confirmSaveMaterialBtn');
  if (btn1) btn1.textContent = '⏳ Saving...';
  if (btn2) btn2.textContent = '⏳ Saving...';

  try {
    const res = await fetch('/api/materials-library/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleVal,
        content,
        source: customItem?.source || attachedMaterialSource || 'Teacher Studio',
        docCategory: customItem?.docCategory || (document.getElementById('loadTargetCategorySelect')?.value === 'curriculum' ? 'curriculum' : (lastRecognizedMeta?.docCategory || 'material')),
        curriculumCode,
        curriculum: customItem?.curriculum || lastRecognizedMeta?.curriculum,
        recognizedType: customItem?.recognizedType || lastRecognizedMeta?.recognizedType,
        gradeLevel,
        subject
      })
    });
    const data = await res.json();
    if (data.success && data.saved) {
      materialLibrary = data.library || materialLibrary;
      customCurricula = data.customCurricula || customCurricula;
      renderMaterialLibraryDropdown(data.saved.id);
      renderCustomCurriculaInDropdown();
      showActiveMaterialBadge(`✅ Saved to Library & Dropdown: "[${data.saved.curriculum}] ${data.saved.title}" (${data.saved.recognizedType})`);
      if (btn1) {
        btn1.textContent = '✅ Saved in Library!';
        setTimeout(() => { btn1.textContent = '💾 Save to Library & Dropdown'; }, 2200);
      }
      if (btn2) {
        btn2.textContent = '✅ Added to Dropdown!';
        setTimeout(() => { btn2.textContent = '➕ Add to Dropdown & Save in Library'; }, 2200);
      }
      return data.saved;
    }
  } catch (err) {
    console.warn('Error saving material to library:', err);
  }
  if (btn1) btn1.textContent = '💾 Save to Library & Dropdown';
  if (btn2) btn2.textContent = '➕ Add to Dropdown & Save in Library';
  return null;
}

/**
 * Requirement 2: Load & Save Created Lesson Plans in the Library
 */
async function loadSavedLessonPlansLibrary(selectPlanId = '') {
  try {
    const res = await fetch('/api/lesson-plans-library');
    const data = await res.json();
    savedLessonPlans = data.lessonPlans || [];
    renderSavedLessonPlansDropdown(selectPlanId);
  } catch (err) {
    console.warn('Could not load saved lesson plans library:', err);
  }
}

function renderSavedLessonPlansDropdown(selectPlanId = '') {
  const select = document.getElementById('savedLessonPlansSelect');
  if (select) {
    select.innerHTML = `<option value="">⭐ Select a Saved Lesson Plan from Library (${savedLessonPlans.length} saved)...</option>`;
    savedLessonPlans.forEach(plan => {
      const opt = document.createElement('option');
      opt.value = plan.id;
      opt.textContent = `⭐ [${plan.gradeLevel || 'Grade 12'} ${plan.subject || 'STEM'}] ${plan.title}`;
      select.appendChild(opt);
    });
    if (selectPlanId && savedLessonPlans.some(p => p.id === selectPlanId)) {
      select.value = selectPlanId;
    }
  }

  // Also inject/update optgroup at top of #existingLessonPlanSelect
  const existingSelect = document.getElementById('existingLessonPlanSelect');
  if (existingSelect) {
    let savedGroup = existingSelect.querySelector('optgroup[data-saved-library="true"]');
    if (!savedGroup) {
      savedGroup = document.createElement('optgroup');
      savedGroup.setAttribute('data-saved-library', 'true');
      existingSelect.insertBefore(savedGroup, existingSelect.children[1] || null);
    }
    savedGroup.label = `⭐ Saved Lesson Plans Library (${savedLessonPlans.length})`;
    savedGroup.innerHTML = '';
    savedLessonPlans.forEach(plan => {
      const opt = document.createElement('option');
      opt.value = `saved:${plan.id}`;
      opt.textContent = `⭐ ${plan.title} (${plan.gradeLevel || 'Grade 12'} • ${plan.subject || 'Course'})`;
      savedGroup.appendChild(opt);
    });
  }
}

async function saveCurrentLessonPlanToLibrary() {
  const payload = buildPayloadFromForm();
  if (!payload.title || payload.title === 'Socratic Lesson Plan') {
    const editorMat = materialStudioEditor ? materialStudioEditor.getValue().trim() : '';
    if (!editorMat) {
      updateLessonPlanStatusPill('⚠️ Please enter a Lesson Plan Title or generate a Lesson Plan before saving', false);
      return null;
    }
  }

  const btn = document.getElementById('saveLessonPlanToLibraryBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Saving Lesson Plan...';
  }

  try {
    const res = await fetch('/api/lesson-plans-library/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        teacherInstructions: lessonInstructionsEditor ? lessonInstructionsEditor.getValue() : '',
        repetitionsPerTier: Number(document.getElementById('repetitionsPerTierSelect')?.value || 3),
        exercisePool: {
          diagnostic: currentExercisePool.diagnostic || [],
          levelA: currentExercisePool.A || [],
          levelB: currentExercisePool.B || [],
          levelC: currentExercisePool.C || []
        }
      })
    });
    const data = await res.json();
    if (data.success && data.saved) {
      savedLessonPlans = data.lessonPlans || savedLessonPlans;
      renderSavedLessonPlansDropdown(data.saved.id);
      updateLessonPlanStatusPill(`✅ Saved Lesson Plan "${data.saved.title}" in Library!`, true);
      if (btn) {
        btn.textContent = '✅ Saved in Library!';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '💾 Save Lesson Plan to Library';
        }, 2200);
      }
      return data.saved;
    }
  } catch (err) {
    console.warn('Error saving lesson plan to library:', err);
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = '💾 Save Lesson Plan to Library';
  }
  return null;
}

async function applySavedLessonPlanToStudio(plan) {
  if (!plan) return;
  document.getElementById('titleInput').value = plan.title || '';
  if (plan.curriculum && document.getElementById('curriculumSelect')) {
    document.getElementById('curriculumSelect').value = plan.curriculum;
  }
  if (plan.gradeLevel && document.getElementById('gradeSelect')) {
    document.getElementById('gradeSelect').value = plan.gradeLevel;
  }
  if (plan.subject && document.getElementById('subjectSelect')) {
    document.getElementById('subjectSelect').value = plan.subject;
  }
  setUnifiedLessonPlanWindow({
    learningGoal: plan.learningGoal || '',
    milestones: plan.targetMilestones || [],
    teacherInstructions: plan.teacherInstructions || ''
  });
  if (Array.isArray(plan.loadedDocuments) && plan.loadedDocuments.length > 0) {
    loadedStudioFiles = plan.loadedDocuments.map(d => ({ ...d }));
    renderLoadedStudioFilesList();
  }
  if (plan.courseMaterials && materialStudioEditor) {
    lastLoadedMaterialText = plan.courseMaterials;
    materialStudioEditor.setValue(plan.courseMaterials);
    attachedMaterialSource = plan.courseMaterialsSource || `Saved Lesson Plan: ${plan.title}`;
    showActiveMaterialBadge(`⭐ Loaded from Saved Lesson Plan: ${plan.title}`);
  }
  if (plan.levelConfigs) {
    applyLevelConfigsToForm(plan.levelConfigs);
  }
  if (plan.repetitionsPerTier && document.getElementById('repetitionsPerTierSelect')) {
    document.getElementById('repetitionsPerTierSelect').value = String(plan.repetitionsPerTier);
  }

  const repsLimit = Number(document.getElementById('repetitionsPerTierSelect')?.value || 3);
  if (plan.exercisePool && ((plan.exercisePool.levelA?.length || 0) > 0 || (plan.exercisePool.A?.length || 0) > 0)) {
    const pA = plan.exercisePool.levelA || plan.exercisePool.A || [];
    const pB = plan.exercisePool.levelB || plan.exercisePool.B || [];
    const pC = plan.exercisePool.levelC || plan.exercisePool.C || [];
    currentExercisePool = {
      diagnostic: (plan.exercisePool.diagnostic || []).map(x => ({ ...x, selected: true })),
      A: pA.map((x, idx) => ({ ...x, selected: x.selected !== undefined ? x.selected : idx < repsLimit })),
      B: pB.map((x, idx) => ({ ...x, selected: x.selected !== undefined ? x.selected : idx < repsLimit })),
      C: pC.map((x, idx) => ({ ...x, selected: x.selected !== undefined ? x.selected : idx < repsLimit }))
    };
    window.selectLevelCard(selectedExerciseTab);
    updateLessonPlanStatusPill(`⭐ Loaded Saved Lesson Plan: "${plan.title}"`, true);
  } else {
    await triggerGenerateLessonDraft({ preserveHeaderFields: true });
  }
}

/**
 * Requirement 3: Level A / B / C Descriptions & Socratic AI Prompts Editor (Below Block 1 on Left)
 */
const DEFAULT_LEVEL_CONFIGS = {
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
};

function getLevelConfigsFromForm() {
  return {
    A: {
      title: 'Level A — Foundational',
      description: (document.getElementById('levelDescInputA')?.value || DEFAULT_LEVEL_CONFIGS.A.description).trim(),
      prompt: (document.getElementById('levelPromptInputA')?.value || DEFAULT_LEVEL_CONFIGS.A.prompt).trim()
    },
    B: {
      title: 'Level B — Standard',
      description: (document.getElementById('levelDescInputB')?.value || DEFAULT_LEVEL_CONFIGS.B.description).trim(),
      prompt: (document.getElementById('levelPromptInputB')?.value || DEFAULT_LEVEL_CONFIGS.B.prompt).trim()
    },
    C: {
      title: 'Level C — Advanced',
      description: (document.getElementById('levelDescInputC')?.value || DEFAULT_LEVEL_CONFIGS.C.description).trim(),
      prompt: (document.getElementById('levelPromptInputC')?.value || DEFAULT_LEVEL_CONFIGS.C.prompt).trim()
    }
  };
}

function applyLevelConfigsToForm(cfg = DEFAULT_LEVEL_CONFIGS) {
  ['A', 'B', 'C'].forEach(lvl => {
    const descEl = document.getElementById(`levelDescInput${lvl}`);
    const promptEl = document.getElementById(`levelPromptInput${lvl}`);
    if (descEl && cfg[lvl]?.description) descEl.value = cfg[lvl].description;
    if (promptEl && cfg[lvl]?.prompt) promptEl.value = cfg[lvl].prompt;
  });
}

function initLevelPromptsStudioControls() {
  document.getElementById('resetLevelPromptsBtn')?.addEventListener('click', () => {
    applyLevelConfigsToForm(DEFAULT_LEVEL_CONFIGS);
  });

  document.getElementById('autoTailorLevelPromptsBtn')?.addEventListener('click', () => {
    const topic = (document.getElementById('titleInput')?.value || attachedMaterialSource || 'the current lesson topic').trim();
    const subj = document.getElementById('subjectSelect')?.value || 'Mathematics';
    const tailored = {
      A: {
        description: `Foundational (${topic}): Single-step rule identification and guided substitution with step-by-step verification.`,
        prompt: `For ${topic} (${subj} Level A), guide the student step by step. Ask them to state the exact formula from the Reference Sheet first, substitute values in an intermediate step, and never accept a bare number without steps.`
      },
      B: {
        description: `Standard Curriculum (${topic}): Multi-step problem solving combining rules in proper operational priority.`,
        prompt: `For ${topic} (${subj} Level B), require the student to justify which operation or law comes first and write every intermediate step connected by '=' before reaching the final result.`
      },
      C: {
        description: `Advanced Mastery (${topic}): Complex equations, domain restrictions, extraneous root verification, and proofs.`,
        prompt: `For ${topic} (${subj} Level C), provide minimal Socratic hints. Require full multi-step derivation, explicit domain/boundary condition checks, and justification for rejecting any extraneous solutions.`
      }
    };
    applyLevelConfigsToForm(tailored);
    const btn = document.getElementById('autoTailorLevelPromptsBtn');
    if (btn) {
      btn.textContent = '✅ Tailored A/B/C Prompts!';
      setTimeout(() => { btn.textContent = '✨ Auto-Tailor to Topic'; }, 2000);
    }
  });
}

/**
 * Google Drive Cloud Picker Modal Controller
 */
async function openGoogleDriveModal(searchQuery = '') {
  const modal = document.getElementById('googleDriveModal');
  const listEl = document.getElementById('driveFilesList');
  if (!modal || !listEl) return;

  modal.style.display = 'flex';
  listEl.innerHTML = `<div style="padding:1rem; text-align:center; color:#5f6368; font-size:0.84rem;">⏳ Connecting to Google Drive...</div>`;

  try {
    const accessToken = localStorage.getItem('socrates_AccessToken') || '';
    const res = await fetch(`/api/google-drive/files?q=${encodeURIComponent(searchQuery)}&accessToken=${encodeURIComponent(accessToken)}`);
    const data = await res.json();
    const files = data.files || [];

    if (files.length === 0) {
      listEl.innerHTML = `<div style="padding:1rem; text-align:center; color:#5f6368; font-size:0.84rem;">No matching files found in Google Drive.</div>`;
      return;
    }

    listEl.innerHTML = files.map(file => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; padding:0.7rem 0.85rem; border:1px solid #dadce0; border-radius:8px; background:#ffffff;">
        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; gap:0.45rem;">
            <span class="badge badge-blue" style="font-size:0.68rem;">${file.fileType || 'Drive File'}</span>
            <strong style="font-size:0.85rem; color:#202124; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${file.title}</strong>
          </div>
          <div style="font-size:0.74rem; color:#5f6368; margin-top:0.15rem;">
            📁 ${file.folder || 'My Drive'} • Updated ${file.updatedAt || 'Recently'}
          </div>
        </div>
        <button type="button" class="btn btn-primary import-drive-file-btn" data-drive-id="${file.id}" style="font-size:0.76rem; padding:0.35rem 0.8rem; white-space:nowrap;">
          ☁️ Import to Material Studio
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.import-drive-file-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fileObj = files.find(f => f.id === btn.getAttribute('data-drive-id'));
        if (!fileObj) return;
        prepMethodsUsed.add('google_drive');
        updatePrepMethodsBadges();
        if (fileObj.subject && document.getElementById('subjectSelect')) {
          document.getElementById('subjectSelect').value = fileObj.subject;
        }
        if (fileObj.gradeLevel && document.getElementById('gradeSelect')) {
          document.getElementById('gradeSelect').value = fileObj.gradeLevel;
        }
        const driveContent = fileObj.content || '';
        await addLoadedFileToStudio({
          title: fileObj.title,
          content: driveContent,
          source: `Google Drive (${fileObj.title})`
        });
        btn.textContent = `✅ Added (${loadedStudioFiles.length} in Studio)`;
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div style="padding:1rem; color:#c5221f; font-size:0.82rem;">Failed to load Google Drive files: ${err.message}</div>`;
  }
}

function buildPayloadFromForm() {
  const modelVal = (document.getElementById('modelSelect')?.value || 'gemini:gemini-3.1-flash-lite').split(':');
  const parsedWindow = parseUnifiedLessonPlanWindow();
  const milestonesRaw = document.getElementById('milestonesInput')?.value || '';
  const targetMilestones = parsedWindow.targetMilestones.length > 0
    ? parsedWindow.targetMilestones
    : milestonesRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const learningGoalVal = parsedWindow.learningGoal || (document.getElementById('goalInput')?.value || '');

  const entryModeRadio = document.querySelector('input[name="adaptiveEntryMode"]:checked');
  const entryMode = entryModeRadio ? entryModeRadio.value : 'AUTO_DIAGNOSE';
  const repetitionsPerTier = Number(document.getElementById('repetitionsPerTierSelect')?.value || 3);

  // Filter selected exercises from the generated pool
  const selectedPool = {
    diagnostic: currentExercisePool.diagnostic || [],
    levelA: (currentExercisePool.A || []).filter(x => x.selected !== false),
    levelB: (currentExercisePool.B || []).filter(x => x.selected !== false),
    levelC: (currentExercisePool.C || []).filter(x => x.selected !== false)
  };

  // Ensure each tier has at least repetitionsPerTier problems (never collapse to 1 item if pool exists)
  ['A', 'B', 'C'].forEach(t => {
    const key = `level${t}`;
    const fullTier = currentExercisePool[t] || [];
    if (selectedPool[key].length === 0 && fullTier.length > 0) {
      selectedPool[key] = fullTier.slice(0, repetitionsPerTier);
    } else if (selectedPool[key].length === 0) {
      if (t === 'A') {
        selectedPool[key] = [
          { id: 'A1', problem: 'Simplify into a single logarithm and evaluate: $\\log_2(4) + \\log_2(8)$', targetAnswer: '5', hint: 'Use the Product Law: $\\log_2(4 \\cdot 8) = \\log_2(32) = 5$.' },
          { id: 'A2', problem: 'Simplify into a single logarithm and evaluate: $\\log_3(27) - \\log_3(3)$', targetAnswer: '2', hint: 'Use the Quotient Law: $\\log_3(27 / 3) = \\log_3(9) = 2$.' },
          { id: 'A3', problem: 'Rewrite as a single logarithm and evaluate: $2\\log_5(5)$', targetAnswer: '2', hint: 'Use the Power Law: $\\log_5(5^2) = \\log_5(25) = 2$.' }
        ];
      } else if (t === 'B') {
        selectedPool[key] = [
          { id: 'B1', problem: 'Simplify into a single numerical value: $2\\log_3(6) - \\log_3(4)$', targetAnswer: '2', hint: 'Apply the Power Law first: $2\\log_3(6) = \\log_3(36)$, then divide by $4$.' },
          { id: 'B2', problem: 'Simplify into a single numerical value: $3\\log_2(4) - \\log_2(8)$', targetAnswer: '3', hint: 'Rewrite $3\\log_2(4) = \\log_2(64)$, then apply Quotient Law.' },
          { id: 'B3', problem: 'Simplify into a single numerical value: $\\frac{1}{2}\\log_4(16) + \\log_4(8)$', targetAnswer: '5/2', hint: 'Power Law: $\\frac{1}{2}\\log_4(16) = \\log_4(4) = 1$. Then $\\log_4(8) = \\frac{3}{2}$ because $4^{3/2} = 8$.' }
        ];
      } else {
        selectedPool[key] = [
          { id: 'C1', problem: 'Solve for $x$ and verify domain restrictions ($x > 1$): $\\log_2(x - 1) + \\log_2(x + 2) = 2$', targetAnswer: 'x = 2 (reject x = -3)', hint: 'Combine into $\\log_2((x-1)(x+2)) = 2 \\implies (x-1)(x+2) = 4$.' },
          { id: 'C2', problem: 'Solve for $x$ and check for extraneous roots: $2\\log_3(x) - \\log_3(x - 2) = 2$', targetAnswer: 'x = 3 or x = 6', hint: 'Rewrite as $\\log_3\\left(\\frac{x^2}{x-2}\\right) = 2 \\implies x^2 = 9(x - 2)$.' },
          { id: 'C3', problem: 'Solve for $x$ over the valid domain: $\\log_4(x + 3) + \\log_4(x - 3) = 2$', targetAnswer: 'x = 5 (reject x = -5)', hint: 'Combine via Product Law: $\\log_4(x^2 - 9) = 2 \\implies x^2 - 9 = 16$.' }
        ];
      }
    }
  });

  const primaryExercise = selectedPool[`level${selectedExerciseTab}`]?.[0] || selectedPool.levelA[0] || selectedPool.levelB[0];
  const titleVal = document.getElementById('titleInput')?.value.trim() || 'Laws of Logarithms (Product, Quotient, Power Rules)';
  const subjectVal = document.getElementById('subjectSelect')?.value || 'Mathematics';
  const gradeVal = document.getElementById('gradeSelect')?.value || 'Grade 12';

  const resolvedMilestones = targetMilestones.length > 0
    ? targetMilestones
    : [
        'Step 1 (Diagnostic Check): Verify basic logarithm definition ($b^y = x \\Longleftrightarrow \\log_b(x) = y$)',
        'Step 2 (Power Law): Absorb scalar coefficients into exponents ($2\\log_3(6) = \\log_3(36)$)',
        'Step 3 (Quotient & Product Laws): Combine same-base logarithms ($\\log_3(36) - \\log_3(4) = \\log_3(9) = 2$)',
        'Step 4 (Mastery Verification): Solve adaptive problems step by step and check domain restrictions ($x > 0$)'
      ];

  const {
    loadedDocuments: resolvedLoadedDocs,
    combinedMaterials: multiFileCombinedMaterials
  } = collectAllLoadedDocumentsForDraft();
  const editorMatVal = materialStudioEditor ? materialStudioEditor.getValue().trim() : '';
  const resolvedMaterials = multiFileCombinedMaterials || editorMatVal || lastLoadedMaterialText || `**Reference Sheet: Product, Quotient, and Power Laws of Logarithms (MHF4U Grade 12)**\n\n1. **Product Law**: $\\log_b(xy) = \\log_b(x) + \\log_b(y)$\n   Base Example: $\\log_2(4) + \\log_2(8) = \\log_2(32) = 5$\n\n2. **Quotient Law**: $\\log_b(x/y) = \\log_b(x) - \\log_b(y)$\n   Base Example: $\\log_3(27/3) = \\log_3(9) = 2$\n\n3. **Power Law**: $\\log_b(x^k) = k \\cdot \\log_b(x)$\n   Base Multi-Step Example: $2\\log_3(6) - \\log_3(4) = \\log_3(6^2) - \\log_3(4) = \\log_3(36/4) = \\log_3(9) = 2$`;

  return {
    title: titleVal,
    curriculum: document.getElementById('curriculumSelect')?.value || 'canada',
    gradeLevel: gradeVal,
    subject: subjectVal,
    courseName: `${subjectVal} (${gradeVal})`,
    topic: titleVal,
    learningGoal: learningGoalVal || `Master ${titleVal}`,
    prompt: primaryExercise.problem,
    initialHint: primaryExercise.hint || 'Start by identifying the core rule from the reference sheet.',
    socraticStyle: document.getElementById('styleSelect')?.value || 'guided_scaffold',
    studentMode: document.getElementById('studentModeSelect')?.value || 'step_by_step',
    currentLevel: selectedExerciseTab,
    adaptiveConfig: {
      autoDiagnoseNewStudent: entryMode === 'AUTO_DIAGNOSE',
      startingLevel: entryMode === 'AUTO_DIAGNOSE' ? 'AUTO' : selectedExerciseTab,
      repetitionsPerTier
    },
    exercisePool: selectedPool,
    exerciseBank: {
      A: selectedPool.levelA[0],
      B: selectedPool.levelB[0],
      C: selectedPool.levelC[0]
    },
    referenceExercise: primaryExercise,
    specificExpectations: currentSelectedLesson?.specificExpectations || resolvedMilestones,
    selectedProvider: modelVal[0] || 'gemini',
    selectedModel: modelVal[1] || 'gemini-3.1-flash-lite',
    targetMilestones: resolvedMilestones,
    levelConfigs: getLevelConfigsFromForm(),
    loadedDocuments: resolvedLoadedDocs,
    courseMaterialsSource: attachedMaterialSource || 'Block 1 — Teacher Material Studio',
    courseMaterials: resolvedMaterials,
    teacherTelemetry: {
      materialPrepTimeSec,
      lessonPlanPrepTimeSec,
      totalPrepTimeSec: materialPrepTimeSec + lessonPlanPrepTimeSec,
      prepMethodsUsed: Array.from(prepMethodsUsed)
    },
    courseId: classroomContext.courseId,
    itemId: classroomContext.itemId,
    itemType: classroomContext.itemType,
    loginHint: classroomContext.loginHint
  };
}

function resetBlock2LessonPlanOnly() {
  activeTemplateId = '';
  currentSelectedLesson = null;
  const existingPlanSelect = document.getElementById('existingLessonPlanSelect');
  if (existingPlanSelect) {
    existingPlanSelect.value = '';
    existingPlanSelect.selectedIndex = 0;
  }
  const titleInput = document.getElementById('titleInput');
  if (titleInput) titleInput.value = '';
  const goalHidden = document.getElementById('goalInput');
  if (goalHidden) goalHidden.value = '';
  if (goalEditor) {
    goalEditor.clear();
    goalEditor.setValue('');
  }
  const msHidden = document.getElementById('milestonesInput');
  if (msHidden) msHidden.value = '';
  if (milestonesEditor) {
    milestonesEditor.clear();
    milestonesEditor.setValue('');
  }
  currentExercisePool = { diagnostic: [], A: [], B: [], C: [] };
  window.selectLevelCard('A');
}

function clearAllMaterialsAndResetStudio() {
  lastLoadedMaterialText = '';
  lastLoadedCourseName = '';
  attachedMaterialSource = '';
  activeTemplateId = '';
  loadedStudioFiles = [];
  renderLoadedStudioFilesList();
  const recCard = document.getElementById('materialRecognitionCard');
  if (recCard) recCard.style.display = 'none';

  if (materialStudioEditor) {
    materialStudioEditor.clear();
    materialStudioEditor.setValue('');
  }
  studioImages = [];
  renderHandwrittenGallery();

  const voiceInput = document.getElementById('voiceTranscriptInput');
  if (voiceInput) voiceInput.value = '';
  const voiceDrawer = document.getElementById('voiceDictationDrawer');
  if (voiceDrawer) voiceDrawer.style.display = 'none';

  const fileInput = document.getElementById('studioFileUploadInput');
  if (fileInput) fileInput.value = '';
  const directCamInput = document.getElementById('directCameraMaterialInput');
  if (directCamInput) directCamInput.value = '';

  const libSelect = document.getElementById('materialLibrarySelect');
  if (libSelect) {
    libSelect.value = '';
    libSelect.selectedIndex = 0;
  }

  const badge = document.getElementById('activeMaterialBadge');
  const nameEl = document.getElementById('activeMaterialName');
  if (nameEl) nameEl.textContent = '';
  if (badge) badge.style.display = 'none';

  const instrHidden = document.getElementById('teacherLessonInstructions');
  if (instrHidden) instrHidden.value = '';
  if (lessonInstructionsEditor) {
    lessonInstructionsEditor.clear();
    lessonInstructionsEditor.setValue('');
  }

  resetBlock2LessonPlanOnly();
  updateLessonPlanStatusPill('Blank — Waiting for Material or Selection', false);
}

function setupEventListeners() {
  // Save Material to Library & Dropdown buttons
  document.getElementById('saveMaterialToLibraryBtn')?.addEventListener('click', async () => {
    await saveCurrentMaterialToLibrary();
  });
  document.getElementById('confirmSaveMaterialBtn')?.addEventListener('click', async () => {
    await saveCurrentMaterialToLibrary();
  });

  // Save & Load Lesson Plans in Library (Requirement 2)
  document.getElementById('saveLessonPlanToLibraryBtn')?.addEventListener('click', async () => {
    await saveCurrentLessonPlanToLibrary();
  });
  document.getElementById('savedLessonPlansSelect')?.addEventListener('change', async (e) => {
    const planId = e.target.value;
    if (!planId) return;
    const plan = savedLessonPlans.find(p => p.id === planId);
    if (plan) {
      await applySavedLessonPlanToStudio(plan);
    }
  });

  // Find in Internet by Teacher Query Drawer (Requirement 1)
  const internetDrawer = document.getElementById('internetSearchDrawer');
  const internetQueryInput = document.getElementById('internetQueryInput');
  const internetResultsList = document.getElementById('internetSearchResultsList');

  document.getElementById('openInternetSearchDrawerBtn')?.addEventListener('click', () => {
    if (!internetDrawer) return;
    const isHidden = internetDrawer.style.display === 'none';
    internetDrawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden) internetQueryInput?.focus();
  });

  document.getElementById('closeInternetSearchDrawerBtn')?.addEventListener('click', () => {
    if (internetDrawer) internetDrawer.style.display = 'none';
  });

  async function executeInternetCurriculumSearch() {
    const query = (internetQueryInput?.value || '').trim();
    if (!query || !internetResultsList) return;
    const btn = document.getElementById('executeInternetSearchBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Searching & Recognizing...';
    }
    internetResultsList.innerHTML = `<div style="padding:0.65rem; font-size:0.8rem; color:#5f6368;">🌐 Searching curriculum standards & reference sheets for "<strong>${query}</strong>"...</div>`;

    try {
      const res = await fetch('/api/materials/search-internet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          curriculum: document.getElementById('curriculumSelect')?.value || '',
          gradeLevel: document.getElementById('gradeSelect')?.value || '',
          subject: document.getElementById('subjectSelect')?.value || ''
        })
      });
      const data = await res.json();
      const results = data.results || [];
      if (results.length === 0) {
        internetResultsList.innerHTML = `<div style="padding:0.65rem; font-size:0.8rem; color:#5f6368;">No results found for "${query}".</div>`;
      } else {
        internetResultsList.innerHTML = results.map((item, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.65rem; padding:0.65rem 0.75rem; background:#ffffff; border:1px solid #d7aefb; border-radius:8px;">
            <div style="flex:1; min-width:0;">
              <div style="display:flex; gap:0.35rem; align-items:center; flex-wrap:wrap; margin-bottom:0.2rem;">
                <span class="badge badge-blue" style="font-size:0.66rem;">${item.recognizedType || 'Curriculum & Reference'}</span>
                <span class="badge badge-green" style="font-size:0.66rem;">${item.curriculum || 'Standard'}</span>
                <span style="font-size:0.7rem; color:#5f6368;">${item.gradeLevel || 'Grade 12'} • ${item.subject || 'STEM'}</span>
              </div>
              <div style="font-size:0.82rem; font-weight:700; color:#202124;">${item.title}</div>
              <div style="font-size:0.74rem; color:#5f6368; margin-top:0.15rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(item.excerpt || item.content || '').slice(0, 120)}...</div>
            </div>
            <button type="button" class="btn btn-primary load-internet-result-btn" data-res-idx="${idx}" style="font-size:0.74rem; padding:0.32rem 0.7rem; background:#7627bb; border-color:#7627bb; white-space:nowrap;">
              📥 Load &amp; Save to Library
            </button>
          </div>
        `).join('');

        internetResultsList.querySelectorAll('.load-internet-result-btn').forEach(b => {
          b.addEventListener('click', async () => {
            const picked = results[Number(b.getAttribute('data-res-idx'))];
            if (!picked) return;
            prepMethodsUsed.add('internet_search');
            updatePrepMethodsBadges();
            const added = await addLoadedFileToStudio({
              title: picked.title,
              content: picked.content,
              source: picked.source || 'Internet Search'
            });
            await saveCurrentMaterialToLibrary(added || picked);
            b.textContent = `✅ Added (${loadedStudioFiles.length} in Studio)`;
          });
        });
      }
    } catch (err) {
      internetResultsList.innerHTML = `<div style="padding:0.65rem; font-size:0.8rem; color:#c5221f;">Search error: ${err.message}</div>`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔍 Search & Recognize';
      }
    }
  }

  document.getElementById('executeInternetSearchBtn')?.addEventListener('click', executeInternetCurriculumSearch);
  internetQueryInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeInternetCurriculumSearch();
    }
  });

  // 1a. Curriculum Standard Dropdown (#curriculumSelect in Block 1) -> Also attaches curriculum standard to Loaded Files when selected
  document.getElementById('curriculumSelect')?.addEventListener('change', async (e) => {
    const code = e.target.value;
    if (!code) return;
    const customCur = customCurricula.find(c => c.code === code);
    const matchingLib = materialLibrary.find(m => m.curriculumCode === code);
    const label = e.target.options[e.target.selectedIndex]?.textContent?.replace(/^[⭐🇨🇦🇺🇸🌍🇬🇧\s]+/, '') || code;
    const curContent = customCur?.content || matchingLib?.content || `Official Curriculum Standard Selected: ${label}\n- Align all Socratic scaffolding, terminology, and multi-step derivations with ${label}.`;
    await addLoadedFileToStudio({
      title: `Curriculum: ${label}`,
      content: curContent,
      source: 'Curriculum Standard Library',
      explicitCategory: 'curriculum'
    });
  });

  // 1b. Course Material Library Select -> Adds selected item into the Multi-File Stack (supports selecting multiple items!)
  document.getElementById('materialLibrarySelect')?.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;
    const item = materialLibrary.find(m => m.id === selectedId);
    if (item && materialStudioEditor) {
      prepMethodsUsed.add('course_library');
      updatePrepMethodsBadges();
      const matText = item.content || item.excerpt || '';
      await addLoadedFileToStudio({
        title: item.title,
        content: matText,
        source: item.source || `Course Library (${item.title})`,
        explicitCategory: item.docCategory || ''
      });
      // Reset dropdown back to prompt so the teacher can immediately select a 2nd or 3rd file to add!
      e.target.value = '';
    }
  });

  // Also ensure changing #subjectSelect manually clears any mismatched prior Lesson Plan
  document.getElementById('subjectSelect')?.addEventListener('change', (e) => {
    const newSubj = e.target.value;
    const curTitle = (document.getElementById('titleInput')?.value || '').toLowerCase();
    if (!curTitle) return;
    const isMathTitle = /logarithm|quadratic|vertex|parabola|vector|polynomial|trig/i.test(curTitle);
    const isChemTitle = /limiting reactant|stoichiometr|molar/i.test(curTitle);
    const isBioTitle = /photosynthes|calvin|atp/i.test(curTitle);
    const isPhysTitle = /newton|force|kinematic/i.test(curTitle);
    if (
      (newSubj === 'Chemistry' && !isChemTitle) ||
      (newSubj === 'Biology' && !isBioTitle) ||
      (newSubj === 'Physics' && !isPhysTitle) ||
      (newSubj === 'Mathematics' && (isChemTitle || isBioTitle || isPhysTitle))
    ) {
      resetBlock2LessonPlanOnly();
      updateLessonPlanStatusPill(`Subject set to ${newSubj} — Push "✨ Propose Lesson Plan Draft" to Generate`, false);
    }
  });

  // 2. Existing Lesson Plan Dropdown (#existingLessonPlanSelect) in Block 2
  document.getElementById('existingLessonPlanSelect')?.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!val) {
      // Reset to blank custom lesson plan
      document.getElementById('titleInput').value = '';
      goalEditor?.setValue('');
      milestonesEditor?.setValue('');
      currentExercisePool = { diagnostic: [], A: [], B: [], C: [] };
      window.selectLevelCard(selectedExerciseTab);
      updateLessonPlanStatusPill('Blank — Waiting for Material or Selection', false);
      return;
    }

    const [sourceType, id] = val.split(':');
    if (sourceType === 'saved') {
      const plan = savedLessonPlans.find(p => p.id === id);
      if (plan) {
        await applySavedLessonPlanToStudio(plan);
      }
    } else if (sourceType === 'tpl') {
      const tpl = templates.find(t => t.id === id);
      if (tpl) {
        await applyTemplateToStudio(tpl);
      }
    } else if (sourceType === 'mhf4u' && mhf4uCurriculum) {
      for (const unit of mhf4uCurriculum.units || []) {
        const found = (unit.lessons || []).find(l => l.id === id);
        if (found) {
          await applyExistingMhf4uLessonToStudio(found);
          break;
        }
      }
    } else if (sourceType === 'lib') {
      const item = materialLibrary.find(m => m.id === id);
      if (item && materialStudioEditor) {
        const libText = item.content || item.excerpt || '';
        materialStudioEditor.setValue(libText);
        attachedMaterialSource = `Course Library: ${item.title}`;
        showActiveMaterialBadge(`📚 ${item.title}`);
        if (item.subject && document.getElementById('subjectSelect')) {
          document.getElementById('subjectSelect').value = item.subject;
        }
        await triggerGenerateLessonDraft({
          preserveHeaderFields: false,
          explicitMaterials: libText,
          explicitCourseName: `${item.subject || 'Course'} (${item.gradeLevel || 'Grade 12'}) ${item.title}`
        });
      }
    }
  });

  // Clear Lesson Plan Title button
  document.getElementById('clearTitleBtn')?.addEventListener('click', () => {
    const titleInput = document.getElementById('titleInput');
    if (titleInput) {
      titleInput.value = '';
      titleInput.focus();
    }
  });

  // 3. Google Drive Cloud Picker Modal (Opens Google Drive — NEVER local file input!)
  document.getElementById('openDrivePickerBtn')?.addEventListener('click', () => {
    openGoogleDriveModal('');
  });

  document.getElementById('closeDriveModalBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('googleDriveModal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('driveSearchBtn')?.addEventListener('click', () => {
    const q = document.getElementById('driveSearchInput')?.value || '';
    openGoogleDriveModal(q);
  });

  document.getElementById('driveSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openGoogleDriveModal(e.target.value || '');
    }
  });

  document.getElementById('importDriveUrlBtn')?.addEventListener('click', async () => {
    const urlVal = document.getElementById('driveDirectUrlInput')?.value.trim() || '';
    if (!urlVal) return;
    prepMethodsUsed.add('google_drive');
    updatePrepMethodsBadges();
    const docText = `Imported Google Drive Document: ${urlVal}\n\n(Add or synthesize specific notes from your shared document above.)`;
    await addLoadedFileToStudio({
      title: `Google Drive Link (${urlVal.slice(0, 42)})`,
      content: docText,
      source: 'Google Drive Link'
    });
    const modal = document.getElementById('googleDriveModal');
    if (modal) modal.style.display = 'none';
  });

  // 4. Classroom Stream Drawer -> Attaches material into Block 1 (Teacher clicks Generate button in Block 2 when ready)
  const streamBtn = document.getElementById('openClassroomStreamBtn');
  const streamDrawer = document.getElementById('classroomStreamDrawer');
  const streamList = document.getElementById('classroomStreamList');
  streamBtn?.addEventListener('click', async () => {
    if (!streamDrawer || !streamList) return;
    streamDrawer.style.display = 'block';
    streamList.innerHTML = `<div style="font-size:0.8rem; color:#5f6368;">Loading materials from Google Classroom...</div>`;
    try {
      const res = await fetch(`/api/classroom-materials?courseId=${encodeURIComponent(classroomContext.courseId)}`);
      const data = await res.json();
      if (data.success && data.materials) {
        streamList.innerHTML = data.materials.map(item => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0.75rem; background:#ffffff; border-radius:6px; border:1px solid #dadce0;">
            <div>
              <div style="font-size:0.82rem; font-weight:600; color:#202124;">📄 ${item.title}</div>
              <div style="font-size:0.72rem; color:#5f6368;">${item.sourceType} • ${item.author}</div>
            </div>
            <button type="button" class="btn btn-secondary attach-stream-item-btn" data-id="${item.id}" style="padding:0.3rem 0.7rem; font-size:0.75rem;">
              📥 Import to Material Studio
            </button>
          </div>
        `).join('');

        streamList.querySelectorAll('.attach-stream-item-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const mat = data.materials.find(m => m.id === btn.dataset.id);
            if (mat && materialStudioEditor) {
              prepMethodsUsed.add('classroom_stream');
              updatePrepMethodsBadges();
              const textContent = mat.extractedContent || mat.extractedText || '';
              await addLoadedFileToStudio({
                title: mat.title,
                content: textContent,
                source: `Classroom Stream (${mat.title})`
              });
              btn.textContent = `✅ Added (${loadedStudioFiles.length} in Studio)`;
            }
          });
        });
      }
    } catch (err) {
      streamList.innerHTML = `<div style="color:#c5221f; font-size:0.8rem;">Error loading materials: ${err.message}</div>`;
    }
  });

  document.getElementById('closeStreamDrawerBtn')?.addEventListener('click', () => {
    if (streamDrawer) streamDrawer.style.display = 'none';
  });

  // 5. Clear Material Buttons (#clearMaterialBtn and #clearStudioAlwaysBtn) -> Completely resets Block 1 & Block 2
  document.getElementById('clearMaterialBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearAllMaterialsAndResetStudio();
  });
  document.getElementById('clearStudioAlwaysBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearAllMaterialsAndResetStudio();
  });

  // 6. Preview Student View
  document.getElementById('previewStudentBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const hasTitle = Boolean((document.getElementById('titleInput')?.value || '').trim());
    const hasMaterials = Boolean((materialStudioEditor ? materialStudioEditor.getValue().trim() : '') || lastLoadedMaterialText);
    if ((currentExercisePool.A || []).length === 0) {
      if (!hasTitle && !hasMaterials) {
        updateLessonPlanStatusPill('⚠️ Please click "✨ Propose Lesson Plan Draft & Generate 30-Problem Pool" (or select an Existing Lesson Plan) before previewing', false);
        document.getElementById('generateLessonDraftBtn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      await triggerGenerateLessonDraft({ preserveHeaderFields: false });
    }
    const payload = {
      ...buildPayloadFromForm(),
      attachToClassroom: false,
      isPreviewOnly: true
    };
    const res = await fetch('/api/preview-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success && data.attachment) {
      try {
        sessionStorage.setItem('socrates_teacherReturnUrl', window.location.href);
      } catch (err) {}
      window.location.href = `/student-work.html?attachmentId=${data.attachment.id}&preview=true`;
    }
  });

  // Prevent accidental Enter key form submissions from ever attaching to Google Classroom
  document.getElementById('activityForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
  });

  // 7. Explicitly Attach to Google Classroom Assignment ONLY when clicking #attachBtn
  document.getElementById('attachBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('attachBtn');
    const bannerEl = document.getElementById('attachmentStatusBannerText');
    const originalText = '📎 Attach Activity to Assignment';

    // CRITICAL: If in a real Google Classroom context and no fresh token is cached locally,
    // trigger requestGoogleAccessToken SYNCHRONOUSLY right here on the click gesture (before any await!)
    let preflightTokenPromise = null;
    if (!isSimulatedContext() && !hasFreshLocalToken() && window.google?.accounts?.oauth2?.initTokenClient) {
      preflightTokenPromise = requestGoogleAccessToken(true);
    }

    btn.innerHTML = '⏳ Saving & Attaching to Google Classroom...';
    btn.disabled = true;
    if (bannerEl) {
      bannerEl.innerHTML = '⏳ <strong>Attaching Activity...</strong> Saving and linking to Google Classroom Assignment.';
    }

    if (preflightTokenPromise) {
      await preflightTokenPromise;
    }

    // If the teacher clicks Attach before generating/selecting a Lesson Plan in Block 2, auto-generate it now so Attach always works
    let hasTitle = Boolean((document.getElementById('titleInput')?.value || '').trim());
    if ((currentExercisePool.A || []).length === 0 && !hasTitle) {
      try {
        await generateAiLessonPlanDraft();
      } catch (genErr) {}
      hasTitle = Boolean((document.getElementById('titleInput')?.value || '').trim());
      if (!hasTitle) {
        const subj = document.getElementById('subjectSelect')?.value || 'Mathematics';
        const grd = document.getElementById('gradeSelect')?.value || 'Grade 12';
        const titleEl = document.getElementById('titleInput');
        if (titleEl) titleEl.value = `${grd} ${subj} — Socratic Inquiry Activity`;
      }
    }

    try {
      let accessToken = localStorage.getItem('socrates_AccessToken') || '';
      const buildAttachPayload = (token) => ({
        ...buildPayloadFromForm(),
        attachToClassroom: true,
        userClickedAttachButton: true,
        addOnToken: classroomContext.addOnToken,
        accessToken: token
      });

      let res = await fetch('/api/attachment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Socrates-Explicit-Attach': 'true'
        },
        body: JSON.stringify(buildAttachPayload(accessToken))
      });
      let data = await res.json();

      // If Google Classroom returned 401 (expired token), clear local token, get a fresh token, and retry immediately
      if (data.needsOAuthRetry && window.google?.accounts?.oauth2?.initTokenClient) {
        try {
          localStorage.removeItem('socrates_AccessToken');
          localStorage.removeItem('socrates_AccessToken_ts');
        } catch (err) {}
        const freshToken = await requestGoogleAccessToken(true);
        if (freshToken) {
          res = await fetch('/api/attachment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Socrates-Explicit-Attach': 'true'
            },
            body: JSON.stringify(buildAttachPayload(freshToken))
          });
          data = await res.json();
        }
      }

      if (data.success && data.attachment) {
        if (!isSimulatedContext() && data.classroomApiAttached === false) {
          // Provide a direct 1-click synchronous OAuth authorization & attach button if popup was blocked after await
          if (bannerEl) {
            bannerEl.innerHTML = `🔑 <strong style="color:#b06000;">One more click to confirm Google Classroom permission:</strong> <button type="button" id="confirmOAuthAttachBtn" class="btn btn-primary" style="margin-left:8px; padding:0.32rem 0.85rem; font-size:0.78rem;">🔑 Authorize &amp; Attach Link Now</button>`;
            document.getElementById('confirmOAuthAttachBtn')?.addEventListener('click', async () => {
              const tok = await requestGoogleAccessToken(true);
              if (tok) {
                document.getElementById('attachBtn')?.click();
              }
            });
          }
          btn.innerHTML = '🔑 Click to Authorize & Attach to Assignment';
          btn.disabled = false;
          return;
        }

        // Update the banner to "✅ Attached to Assignment"
        setAttachmentBannerConnected(data.attachment);
        const notifyMsg = {
          type: 'CLASSROOM_ADDON_ATTACHMENT_CREATED',
          attached: true,
          attachmentId: data.attachment.id,
          title: data.attachment.title,
          studentWorkUrl: `${window.location.origin}/student-work.html?attachmentId=${data.attachment.id}`,
          teacherReviewUrl: `${window.location.origin}/teacher-review.html?attachmentId=${data.attachment.id}`
        };
        fullWindowBridge?.notifyClassroomIframe(notifyMsg);

        // If running inside the Google Classroom iframe directly, send the official closeIframe postMessage
        // so Google Classroom closes the modal and commits/displays the attachment link in the assignment
        if (window.parent && window.parent !== window) {
          try {
            window.parent.postMessage({ type: 'Classroom', action: 'closeIframe' }, '*');
          } catch (postErr) {}
        }

        if (urlParams.get('autoOpenStudentOnAttach') === '1') {
          setTimeout(() => {
            window.location.href = `/student-work.html?attachmentId=${data.attachment.id}`;
          }, 500);
        } else if (urlParams.get('fullWindow') === '1' && !isSimulatedContext()) {
          // Close the full-page tab after showing confirmation so focus returns to Google Classroom
          // and Google Classroom's requestAnimationFrame immediately renders the new attachment card
          setTimeout(() => {
            try { window.close(); } catch (e) {}
          }, 850);
        }
      } else {
        throw new Error(data.error || 'Failed to attach');
      }
    } catch (err) {
      if (bannerEl) {
        bannerEl.innerHTML = `⚠️ <strong style="color:#c5221f;">Could not attach:</strong> ${err.message}`;
      }
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });
}

/**
 * Request Google OAuth 2.0 access token via Google Identity Services when needed for Classroom API
 */
function requestGoogleAccessToken(interactive = true) {
  return new Promise((resolve) => {
    if (!window.google?.accounts?.oauth2?.initTokenClient) {
      resolve('');
      return;
    }
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val || '');
    };
    const timer = setTimeout(() => finish(''), 8000);
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: CLASSROOM_OAUTH_SCOPES,
        hint: classroomContext.loginHint || urlParams.get('login_hint') || '',
        prompt: '',
        callback: (tokenResponse) => {
          clearTimeout(timer);
          if (tokenResponse && tokenResponse.access_token) {
            try {
              localStorage.setItem('socrates_AccessToken', tokenResponse.access_token);
              localStorage.setItem('socrates_AccessToken_ts', String(Date.now()));
              fetch('/api/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  accessToken: tokenResponse.access_token,
                  loginHint: classroomContext.loginHint || ''
                })
              }).catch(() => {});
            } catch (e) {}
            finish(tokenResponse.access_token);
          } else {
            finish('');
          }
        },
        error_callback: () => {
          clearTimeout(timer);
          finish('');
        }
      });
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      clearTimeout(timer);
      finish('');
    }
  });
}

/**
 * Updates #attachmentStatusBannerText, #attachmentActionFooterBox, #attachBtn, and #lessonPlanStatusPill
 * to reflect that the activity is now attached to the assignment.
 */
function setAttachmentBannerConnected(attachment) {
  if (!attachment || !attachment.id) return;
  const bannerEl = document.getElementById('attachmentStatusBannerText');
  const footerBox = document.getElementById('attachmentActionFooterBox');
  const attachBtn = document.getElementById('attachBtn');
  const safeTitle = (attachment.title || 'Socratic Activity').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const returnToClassroomBtnHtml = (urlParams.get('fullWindow') === '1' && !isSimulatedContext())
    ? `<button type="button" id="returnToClassroomTabBtn" class="btn btn-primary" style="background:#137333; border-color:#137333; padding:0.28rem 0.75rem; font-size:0.76rem; margin-left:10px;">↩️ Return to Google Classroom Assignment</button>`
    : '';
  if (bannerEl) {
    bannerEl.innerHTML = `✅ <strong style="color:#137333;">Attached to Assignment:</strong> "${safeTitle}" — <a href="/student-work.html?attachmentId=${encodeURIComponent(attachment.id)}&preview=true" style="color:#137333; font-weight:700; text-decoration:underline; margin-left:6px;">👁️ Preview Student View ➔</a> <a href="/teacher-review.html?attachmentId=${encodeURIComponent(attachment.id)}" style="color:#1967d2; font-weight:700; text-decoration:underline; margin-left:8px;">📊 Results &amp; Review ➔</a>${returnToClassroomBtnHtml}`;
    document.getElementById('returnToClassroomTabBtn')?.addEventListener('click', () => {
      try { window.close(); } catch (e) {}
    });
  }
  if (footerBox) {
    footerBox.style.background = '#e6f4ea';
    footerBox.style.borderColor = '#ceead6';
  }
  if (attachBtn) {
    attachBtn.innerHTML = '✅ Attached to Assignment!';
    attachBtn.style.background = '#137333';
    attachBtn.style.borderColor = '#137333';
    attachBtn.disabled = false;
  }
  updateLessonPlanStatusPill(`✅ Attached to Assignment: "${attachment.title || 'Activity'}"`, true);
  try {
    sessionStorage.setItem('socrates_teacherReturnUrl', window.location.href);
    sessionStorage.setItem('socrates_attachedActivity', JSON.stringify({
      id: attachment.id,
      title: attachment.title || 'Socratic Activity',
      courseId: classroomContext.courseId,
      itemId: classroomContext.itemId
    }));
  } catch (e) {}
}
