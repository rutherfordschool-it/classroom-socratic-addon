import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CURRICULA, ACTIVITY_TEMPLATES, CURRICULUM_MATERIAL_LIBRARY } from '../data/curricula.js';
import { llmService } from '../services/llmService.js';
import { SocraticPromptEngine } from '../services/promptEngine.js';
import { classroomService } from '../services/classroomService.js';
import { lessonPlanService } from '../services/lessonPlanService.js';
import { materialIngestionService } from '../services/materialIngestionService.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesJsonPath = path.join(__dirname, '..', 'data', 'templates.json');

function getTemplates() {
  try {
    if (fs.existsSync(templatesJsonPath)) {
      return JSON.parse(fs.readFileSync(templatesJsonPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[API] Could not read templates.json, falling back to curricula.js', e.message);
  }
  return ACTIVITY_TEMPLATES;
}

export const apiRouter = express.Router();

/**
 * Returns curriculum for Ontario MHF4U Advanced Functions (5 units)
 */
apiRouter.get('/curriculum/:courseId?', (req, res) => {
  const courseId = req.params.courseId || 'MHF4U';
  const curriculum = lessonPlanService.getCurriculum(courseId);
  res.json({
    success: true,
    curriculum
  });
});

/**
 * Returns specific lesson plan with Expectations & Exercise Bank (A, B, C)
 */
apiRouter.get('/curriculum/:courseId/lesson/:lessonId', (req, res) => {
  const { courseId, lessonId } = req.params;
  const lesson = lessonPlanService.getLesson(courseId, lessonId);
  if (!lesson) {
    return res.status(404).json({ success: false, error: 'Lesson not found' });
  }
  res.json({ success: true, lesson });
});

/**
 * Returns materials published in this Google Classroom (Stream announcements & Classwork)
 */
apiRouter.get('/classroom-materials', async (req, res) => {
  try {
    const courseId = req.query.courseId || 'test-class-math';
    const materials = await materialIngestionService.getClassroomMaterials({ courseId });
    res.json({
      success: true,
      materials
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Returns teacher's Google Drive files (queries Google Drive v3 API if accessToken present, or Classroom Drive folder)
 */
apiRouter.get('/google-drive/files', async (req, res) => {
  try {
    const accessToken = req.query.accessToken || req.headers['x-google-access-token'] || '';
    const query = req.query.q || '';
    const files = await materialIngestionService.getGoogleDriveFiles({ accessToken, query });
    res.json({
      success: true,
      files
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Generates a fresh parallel exercise for student mastery check based on Level A/B/C
 */
apiRouter.post('/generate-similar-exercise', async (req, res) => {
  try {
    const {
      level = 'B',
      topic = 'Laws of Logarithms',
      template = 'Simplify: k*log_b(M) - log_b(N)',
      specificExpectation = 'Apply Quotient and Power laws',
      provider = 'gemini'
    } = req.body;

    const prompt = SocraticPromptEngine.buildSimilarExercisePrompt({
      level,
      topic,
      template,
      specificExpectation
    });

    const reply = await llmService.chat({
      provider,
      model: 'gemini-3.1-flash-lite',
      systemPrompt: 'You are an assessment generator that outputs strictly valid JSON.',
      messages: [{ role: 'user', content: prompt }]
    });

    let generatedExercise = null;
    try {
      const cleaned = reply.content.replace(/```json/g, '').replace(/```/g, '').trim();
      generatedExercise = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fallback clean mathematical problem
      generatedExercise = {
        level,
        problem: level === 'A' 
          ? 'Simplify into a single logarithm: $\\log_3(9) + \\log_3(27)$' 
          : 'Simplify into a single numerical value: $3\\log_2(4) - \\log_2(8)$',
        targetAnswer: level === 'A' ? '5' : '3',
        hint: 'Use the Power Law first, then the Quotient Law.',
        solutionSteps: [
          'Step 1: Apply Power Law',
          'Step 2: Apply Quotient Law',
          'Step 3: Evaluate result'
        ]
      };
    }

    res.json({
      success: true,
      exercise: generatedExercise
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Returns curricula standards for US and Canada
 */
apiRouter.get('/curricula', (req, res) => {
  res.json({
    success: true,
    curricula: CURRICULA
  });
});

/**
 * Returns pre-built activity templates
 */
apiRouter.get('/templates', (req, res) => {
  res.json({
    success: true,
    templates: getTemplates()
  });
});

/**
 * Returns curated + teacher-saved high school course materials & curricula library
 */
apiRouter.get('/materials-library', (req, res) => {
  const custom = classroomService.getCustomMaterials();
  const merged = [...custom, ...CURRICULUM_MATERIAL_LIBRARY];
  res.json({
    success: true,
    library: merged,
    customCurricula: classroomService.getCustomCurricula()
  });
});

/**
 * Recognizes the type and metadata (curriculum, grade, subject, formulas) of any loaded material
 */
apiRouter.post('/materials/recognize', (req, res) => {
  const recognized = classroomService.recognizeMaterialMetadata(req.body || {});
  res.json({
    success: true,
    recognized
  });
});

/**
 * Saves a loaded/recognized material or curriculum into the persistent library and returns updated list
 */
apiRouter.post('/materials-library/save', (req, res) => {
  const saved = classroomService.saveMaterialToLibrary(req.body || {});
  const custom = classroomService.getCustomMaterials();
  res.json({
    success: true,
    saved,
    library: [...custom, ...CURRICULUM_MATERIAL_LIBRARY],
    customCurricula: classroomService.getCustomCurricula()
  });
});

/**
 * Searches/retrieves curriculum standards & reference materials from the Internet / Knowledge Base by teacher query
 */
apiRouter.post('/materials/search-internet', async (req, res) => {
  try {
    const { query = '', curriculum = '', gradeLevel = '', subject = '' } = req.body || {};
    const q = String(query || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'Please enter a search query' });
    }

    // 1. Find matching pre-loaded items in CURRICULUM_MATERIAL_LIBRARY + customMaterials
    const allKnown = [...classroomService.getCustomMaterials(), ...CURRICULUM_MATERIAL_LIBRARY];
    const qLower = q.toLowerCase();
    const keywords = qLower.split(/\s+/).filter(w => w.length >= 2);
    const matchedKnown = allKnown.filter(item => {
      const hay = `${item.title} ${item.curriculum} ${item.subject} ${item.gradeLevel} ${item.content}`.toLowerCase();
      return keywords.some(kw => hay.includes(kw));
    });

    // 2. Synthesize a tailored curriculum & reference resource directly matching the teacher's query
    const meta = classroomService.recognizeMaterialMetadata({
      title: q,
      content: q,
      source: 'Internet Curriculum & Open Educational Resources Search',
      curriculumHint: curriculum,
      gradeHint: gradeLevel,
      subjectHint: subject
    });

    let synthesizedContent = '';
    try {
      const reply = await llmService.chat({
        provider: config.defaultProvider,
        model: 'gemini-3.1-flash-lite',
        systemPrompt: 'You are an expert STEM and Humanities curriculum specialist. Write a structured Reference Sheet & Curriculum Guide with exact LaTeX formulas ($...$) and 2 step-by-step worked examples for the requested topic.',
        messages: [
          {
            role: 'user',
            content: `Create a high-school Reference Sheet & Curriculum Standard Summary for teacher query: "${q}" (${meta.curriculum}, ${meta.gradeLevel}, ${meta.subject}). Include:
1. Official Curriculum Expectations & Learning Outcomes
2. Key Formulas / Laws / Definitions (using inline LaTeX $...$)
3. Two Step-by-Step Worked Examples showing intermediate steps.`
          }
        ]
      });
      if (reply && reply.content && !/⚠️/.test(reply.content)) {
        synthesizedContent = reply.content.trim();
      }
    } catch (e) {
      // Fallback below
    }

    if (!synthesizedContent) {
      synthesizedContent = `**Curriculum & Reference Guide: ${q} (${meta.curriculum} • ${meta.gradeLevel} ${meta.subject})**

1. **Curriculum Expectations & Core Concepts**:
   - Understand the foundational definitions, properties, and algebraic/analytical rules of **${q}**.
   - Justify each intermediate transformation step rather than stating a final numerical answer without proof.

2. **Key Formulas & Operational Rules**:
   - State the governing rule or identity before substituting values.
   - Verify domain restrictions, units, and boundary conditions at the final step.

3. **Step-by-Step Worked Example**:
   - **Step 1 (Identify Rule)**: Write the general formula applicable to ${q}.
   - **Step 2 (Substitute & Simplify)**: Substitute the given parameters and simplify step by step using $=$ signs.
   - **Step 3 (Verify)**: Confirm that the solution satisfies all conditions of the problem.`;
    }

    const webSynthItem = {
      id: `web-${Date.now().toString(36)}`,
      title: `${q} — ${meta.curriculum} (${meta.gradeLevel})`,
      curriculum: meta.curriculum,
      curriculumCode: meta.curriculumCode,
      recognizedType: 'Web Curriculum Standard & Reference Sheet',
      subject: meta.subject,
      gradeLevel: meta.gradeLevel,
      source: 'Internet Curriculum & OER Search (OpenStax / Ministry Standards)',
      content: synthesizedContent,
      excerpt: synthesizedContent.slice(0, 220)
    };

    const results = [webSynthItem, ...matchedKnown.slice(0, 4)];
    res.json({
      success: true,
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Returns saved Lesson Plans from the persistent library
 */
apiRouter.get('/lesson-plans-library', (req, res) => {
  res.json({
    success: true,
    lessonPlans: classroomService.getSavedLessonPlans()
  });
});

/**
 * Saves a Lesson Plan into the persistent library
 */
apiRouter.post('/lesson-plans-library/save', (req, res) => {
  const saved = classroomService.saveLessonPlanToLibrary(req.body || {});
  res.json({
    success: true,
    saved,
    lessonPlans: classroomService.getSavedLessonPlans()
  });
});

/**
 * Returns LLM models list (Gemini, Claude, ChatGPT) and API keys status
 */
apiRouter.get('/models', (req, res) => {
  res.json({
    success: true,
    defaultProvider: config.defaultProvider,
    models: llmService.getAvailableModels(),
    hasGeminiKey: config.hasGeminiKey,
    hasAnthropicKey: config.hasAnthropicKey,
    hasOpenaiKey: config.hasOpenaiKey,
    isAnyConfigured: config.isAnyLLMConfigured
  });
});

/**
 * Chat endpoint for student Socratic dialogue
 */
apiRouter.post('/chat', async (req, res) => {
  try {
    const {
      attachmentId,
      messages = [],
      provider = config.defaultProvider,
      model,
      customContext = {}
    } = req.body;

    // Load the stored lesson plan. The tutor's configuration comes ONLY from the stored attachment, so a
    // student's browser cannot rewrite the tutor's instructions; only per-session state is taken from the client.
    let activityConfig = {};
    if (attachmentId) {
      const att = classroomService.getAttachment(attachmentId);
      if (att) {
        activityConfig = att;
      }
    }
    const sessionState = {
      currentLevel: ['A', 'B', 'C'].includes(customContext.currentLevel) ? customContext.currentLevel : undefined,
      diagnosticStatus: ['IN_DIAGNOSTIC', 'COMPLETED'].includes(customContext.diagnosticStatus) ? customContext.diagnosticStatus : undefined,
      studentMode: ['step_by_step', 'solo_answer', 'general_blueprint'].includes(customContext.studentMode) ? customContext.studentMode : undefined
    };

    const merged = {
      curriculum: activityConfig.curriculum || customContext.curriculum || 'canada',
      gradeLevel: activityConfig.gradeLevel || customContext.gradeLevel || 'Grade 12',
      subject: activityConfig.subject || customContext.subject || 'Mathematics',
      courseName: activityConfig.courseName || customContext.courseName || 'Advanced Functions (MHF4U)',
      topic: activityConfig.topic || customContext.topic || 'Laws of Logarithms (Quotient, Power, Product)',
      learningGoal: activityConfig.learningGoal || customContext.learningGoal || 'Master Laws of Logarithms to simplify expressions',
      overallExpectations: activityConfig.overallExpectations || [],
      specificExpectations: activityConfig.specificExpectations || [],
      studentMode: sessionState.studentMode || activityConfig.studentMode || 'step_by_step',
      currentLevel: sessionState.currentLevel || activityConfig.currentLevel || 'B',
      diagnosticStatus: sessionState.diagnosticStatus || 'COMPLETED',
      targetMilestones: activityConfig.targetMilestones || [],
      courseMaterials: activityConfig.courseMaterials || '',
      referenceExercise: activityConfig.referenceExercise || null,
      levelConfigs: activityConfig.levelConfigs || null
    };

    const systemPrompt = SocraticPromptEngine.buildSystemPrompt(merged);

    const activeProvider = provider || activityConfig.selectedProvider || 'gemini';
    const activeModel = model || activityConfig.selectedModel || 'gemini-3.1-flash-lite';

    const reply = await llmService.chat({
      provider: activeProvider,
      model: activeModel,
      systemPrompt,
      messages
    });

    res.json({
      success: true,
      reply
    });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Evaluates student session transcript to generate teacher rubric and grade recommendations
 */
apiRouter.post('/evaluate-session', async (req, res) => {
  try {
    const {
      courseName = 'MHF4U Advanced Functions',
      topic = 'Laws of Logarithms',
      learningGoal = 'Demonstrate comprehension',
      targetMilestones = [],
      specificExpectations = [],
      currentLevel = 'B',
      transcript = [],
      provider = config.defaultProvider
    } = req.body;

    const prompt = SocraticPromptEngine.buildTeacherReviewPrompt({
      courseName,
      topic,
      learningGoal,
      specificExpectations: specificExpectations.length > 0 ? specificExpectations : targetMilestones,
      targetMilestones,
      currentLevel,
      transcript
    });

    const evaluation = await llmService.evaluateSession({
      prompt,
      provider,
      transcript
    });

    res.json({
      success: true,
      evaluation
    });
  } catch (err) {
    console.error('Session evaluation error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Cross-window bridge map so the Google Classroom iframe knows immediately when the Full-Page tab attaches an activity
const attachmentBridgeEvents = new Map();

function handleBridgeStatusRequest(req, res) {
  const { addOnToken = '', courseId = '', itemId = '', since = '0' } = req.query;
  const minTs = Math.max(0, (Number(since) || 0) - 5000);
  let ev = null;
  if (addOnToken) {
    ev = attachmentBridgeEvents.get(`token:${addOnToken}`);
  }
  if (!ev && courseId && itemId) {
    ev = attachmentBridgeEvents.get(`item:${courseId}:${itemId}`);
  }
  if (ev && ev.timestamp >= minTs) {
    return res.json({ success: true, ...ev });
  }
  res.json({ success: true, attached: false });
}

apiRouter.get('/attachment/bridge-status', handleBridgeStatusRequest);
apiRouter.get('/bridge-status', handleBridgeStatusRequest);

/**
 * Get attachment details.
 * By default the answer key (targetAnswer / hint / solution steps) is STRIPPED so a student's browser never
 * receives it. Teacher tools that need the keys must ask with ?include=answers.
 * NOTE: without Google sign-in verification (planned) this is a convention, not an access-control boundary.
 */
apiRouter.get('/attachment/:id', (req, res) => {
  let attachment = classroomService.getAttachment(req.params.id);
  if (!attachment) {
    // Graceful fallback to default MHF4U Logarithms attachment if container recycled
    attachment = classroomService.getAttachment('att-demo-socratic-01');
  }
  if (!attachment) {
    return res.status(404).json({ success: false, error: 'Attachment not found' });
  }
  const includeAnswers = req.query.include === 'answers';
  res.json({
    success: true,
    attachment: includeAnswers ? attachment : classroomService.toStudentSafeAttachment(attachment)
  });
});

/**
 * Server-side answer check for one problem. The student's browser sends its answer and receives only
 * { correct, showedWork } — the answer key never leaves the server.
 */
apiRouter.post('/attachment/:id/check-answer', (req, res) => {
  const { tier = 'A', index = 0, answer = '', steps = [], hasPhoto = false } = req.body || {};
  const verdict = classroomService.gradeStudentAnswer({
    attachmentId: req.params.id,
    tier: String(tier),
    index: Number(index) || 0,
    answer: String(answer || '').slice(0, 4000),
    steps: Array.isArray(steps) ? steps.slice(0, 50).map(s => String(s || '').slice(0, 4000)) : [],
    hasPhoto: Boolean(hasPhoto)
  });
  res.json({
    success: true,
    gradable: verdict.gradable,
    correct: verdict.correct,
    showedWork: verdict.showedWork
  });
});

/**
 * Where the shared data lives (Google Drive folder) and the results sheet for an assignment
 */
apiRouter.get('/storage-info', (req, res) => {
  res.json({ success: true, storage: classroomService.getStorageInfo() });
});

apiRouter.get('/attachment/:id/results.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="results-${encodeURIComponent(req.params.id)}.csv"`);
  res.send(classroomService.buildResultsCsv(req.params.id));
});

/**
 * Returns all student submissions for an attachment
 */
apiRouter.get('/attachment/:id/submissions', (req, res) => {
  const submissions = classroomService.getSubmissionsForAttachment(req.params.id);
  res.json({ success: true, submissions });
});

/**
 * Save / Create Teacher Preview Session (NEVER calls Google Classroom addOnAttachments API)
 */
apiRouter.post('/preview-session', (req, res) => {
  const attachment = classroomService.createAttachment({
    ...req.body,
    attachToClassroom: false,
    isPreviewOnly: true
  });
  res.json({ success: true, attachment, preview: true });
});

function isSimulatedClassroomContext({ courseId = '', itemId = '', addOnToken = '' } = {}) {
  if (!courseId || !itemId || !addOnToken) return true;
  return (
    courseId === 'test-class-math' ||
    courseId === 'course-calc-101' ||
    itemId === 'assignment-draft-01' ||
    itemId === 'assignment-derive-quad' ||
    addOnToken === 'simulated-addon-token' ||
    addOnToken === 'mock-teacher-token' ||
    String(addOnToken).startsWith('mock-') ||
    String(addOnToken).startsWith('sim-')
  );
}

const oauthTokensPath = path.join(__dirname, '..', 'data', 'oauth_tokens.json');
let oauthTokensMemory = {};
try {
  if (fs.existsSync(oauthTokensPath)) {
    oauthTokensMemory = JSON.parse(fs.readFileSync(oauthTokensPath, 'utf-8'));
  }
} catch (e) {
  console.warn('[OAuthCache] Could not read oauth_tokens.json:', e.message);
}

function getCachedOAuthToken(loginHint = '') {
  const entry = (loginHint && oauthTokensMemory[loginHint]) || oauthTokensMemory.default || null;
  if (!entry || !entry.accessToken) return null;
  return entry;
}

function saveCachedOAuthToken(accessToken, loginHint = '') {
  if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 20) return;
  const record = {
    accessToken,
    loginHint: loginHint || 'default',
    updatedAt: Date.now()
  };
  oauthTokensMemory.default = record;
  if (loginHint) {
    oauthTokensMemory[loginHint] = record;
  }
  try {
    fs.writeFileSync(oauthTokensPath, JSON.stringify(oauthTokensMemory, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[OAuthCache] Could not write oauth_tokens.json:', e.message);
  }
}

apiRouter.get('/oauth/token', (req, res) => {
  const loginHint = req.query.loginHint || '';
  const entry = getCachedOAuthToken(loginHint);
  if (!entry || !entry.accessToken) {
    return res.json({ success: true, accessToken: '', updatedAt: 0 });
  }
  const ageMs = Date.now() - (entry.updatedAt || 0);
  if (ageMs > 50 * 60 * 1000) {
    return res.json({ success: true, accessToken: '', updatedAt: entry.updatedAt || 0, expired: true });
  }
  res.json({ success: true, accessToken: entry.accessToken, updatedAt: entry.updatedAt });
});

apiRouter.post('/oauth/token', (req, res) => {
  const { accessToken = '', loginHint = '' } = req.body || {};
  if (accessToken) {
    saveCachedOAuthToken(accessToken, loginHint);
  }
  res.json({ success: true });
});

/**
 * Clean up any pre-existing/unconfirmed addOnAttachments on a Google Classroom coursework draft
 * when explicitly requested.
 */
apiRouter.post('/attachment/clear-draft', async (req, res) => {
  const { courseId, itemId, addOnToken, accessToken } = req.body || {};
  if (isSimulatedClassroomContext({ courseId, itemId, addOnToken })) {
    return res.json({ success: true, cleared: 0 });
  }
  res.json({ success: true, cleared: 0 });
});

/**
 * Save / Create attachment (ONLY attaches to Google Classroom when explicitly requested via #attachBtn)
 */
apiRouter.post('/attachment', async (req, res) => {
  const attachment = classroomService.createAttachment(req.body);
  const {
    courseId,
    itemId,
    itemType = 'courseWork',
    addOnToken,
    accessToken,
    loginHint = '',
    attachToClassroom,
    userClickedAttachButton
  } = req.body;
  const isExplicitAttachHeader = req.headers['x-socrates-explicit-attach'] === 'true';

  if (accessToken) {
    saveCachedOAuthToken(accessToken, loginHint);
  }
  const cachedTokenObj = getCachedOAuthToken(loginHint);
  const effectiveAccessToken = accessToken || (cachedTokenObj ? cachedTokenObj.accessToken : '');

  let classroomApiResult = null;
  let classroomApiAttached = false;

  if (
    attachToClassroom === true &&
    userClickedAttachButton === true &&
    isExplicitAttachHeader &&
    !isSimulatedClassroomContext({ courseId, itemId, addOnToken })
  ) {
    try {
      const endpointSegment =
        itemType === 'courseWorkMaterials'
          ? 'courseWorkMaterials'
          : itemType === 'announcements'
          ? 'announcements'
          : 'courseWork';
      const baseApiUrl = `https://classroom.googleapis.com/v1/courses/${courseId}/${endpointSegment}/${itemId}/addOnAttachments`;
      const createApiUrl = `${baseApiUrl}?addOnToken=${encodeURIComponent(addOnToken)}`;
      const payload = {
        title: `SocratesAI: ${attachment.title}`,
        maxPoints: 100,
        studentViewUri: {
          uri: `${config.baseUrl}/student-work.html?attachmentId=${attachment.id}`
        },
        teacherViewUri: {
          uri: `${config.baseUrl}/teacher-review.html?attachmentId=${attachment.id}`
        }
      };

      const headers = { 'Content-Type': 'application/json' };
      if (effectiveAccessToken) {
        headers['Authorization'] = `Bearer ${effectiveAccessToken}`;
      }

      console.log(`[ClassroomAPI] Creating attachment for course ${courseId}, item ${itemId} (${endpointSegment})`);
      let gRes = await fetch(createApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      let gData = await gRes.json();
      console.log('[ClassroomAPI] addOnAttachments response:', gRes.status, gData);

      // If 401 UNAUTHENTICATED and we have a different server-cached token, retry with server-cached token
      if (
        gRes.status === 401 &&
        cachedTokenObj?.accessToken &&
        cachedTokenObj.accessToken !== effectiveAccessToken
      ) {
        console.log('[ClassroomAPI] 401 on client token, retrying with server-cached OAuth token...');
        headers['Authorization'] = `Bearer ${cachedTokenObj.accessToken}`;
        const retryRes = await fetch(createApiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const retryData = await retryRes.json();
        console.log('[ClassroomAPI] server-cached token retry response:', retryRes.status, retryData);
        if (retryRes.status < 400) {
          gRes = retryRes;
          gData = retryData;
        }
      }

      // If project attachment limit exceeded on this coursework item, clean up old attachments and retry
      if (gRes.status === 400 && (gData?.error?.message?.includes('ProjectAttachmentLimitExceeded') || gData?.error?.status === 'FAILED_PRECONDITION')) {
        console.log('[ClassroomAPI] Limit exceeded, attempting to clean up old attachments on this coursework draft...');
        try {
          const listRes = await fetch(baseApiUrl, { method: 'GET', headers });
          const listData = await listRes.json();
          console.log('[ClassroomAPI] Existing addOnAttachments list:', listRes.status, listData);

          if (listData?.addOnAttachments && listData.addOnAttachments.length > 0) {
            for (const oldAtt of listData.addOnAttachments) {
              const delUrl = `${baseApiUrl}/${oldAtt.id}`;
              const delRes = await fetch(delUrl, { method: 'DELETE', headers });
              console.log(`[ClassroomAPI] Deleted old attachment ${oldAtt.id}: status ${delRes.status}`);
            }

            gRes = await fetch(createApiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            });
            gData = await gRes.json();
            console.log('[ClassroomAPI] Retry addOnAttachments create after cleanup:', gRes.status, gData);
          }
        } catch (cleanupErr) {
          console.warn('[ClassroomAPI] Cleanup error:', cleanupErr.message);
        }
      }

      classroomApiResult = gData;
      classroomApiAttached = gRes.status < 400 && Boolean(gData && !gData.error);
      if (classroomApiAttached && gData?.id) {
        // Remember Classroom's own attachment id: it is required later to send grades back to Classroom
        attachment.classroomAttachmentId = gData.id;
        attachment.courseId = courseId;
        attachment.itemId = itemId;
        attachment.itemType = itemType;
        classroomService.attachmentsStore.set(attachment.id, attachment);
        classroomService.saveStoreToFile();
      }

      if (gRes.status >= 400) {
        return res.json({
          success: true,
          attachment,
          classroomApiAttached: false,
          needsOAuthRetry: gRes.status === 401,
          classroomApiError: gData?.error?.message || 'Google Classroom API returned non-200 status',
          limitExceeded: gData?.error?.message?.includes('ProjectAttachmentLimitExceeded') || gData?.error?.status === 'FAILED_PRECONDITION',
          classroomApiResult: gData
        });
      }
    } catch (e) {
      console.warn('[ClassroomAPI] Could not call addOnAttachments:', e.message);
    }
  } else if (attachToClassroom === true && userClickedAttachButton === true) {
    classroomApiAttached = true;
  }

  if (classroomApiAttached) {
    const bridgeEvent = {
      type: 'CLASSROOM_ADDON_ATTACHMENT_CREATED',
      attached: true,
      classroomApiAttached: true,
      attachmentId: attachment.id,
      title: attachment.title,
      courseId,
      itemId,
      addOnToken,
      studentWorkUrl: `${config.baseUrl}/student-work.html?attachmentId=${attachment.id}`,
      teacherReviewUrl: `${config.baseUrl}/teacher-review.html?attachmentId=${attachment.id}`,
      timestamp: Date.now()
    };
    if (addOnToken) {
      attachmentBridgeEvents.set(`token:${addOnToken}`, bridgeEvent);
    }
    if (courseId && itemId) {
      attachmentBridgeEvents.set(`item:${courseId}:${itemId}`, bridgeEvent);
    }
  }

  res.json({
    success: true,
    attachment,
    classroomApiAttached,
    classroomApiResult
  });
});

/**
 * Clear student submissions (all or for a specific attachmentId)
 */
apiRouter.post('/submissions/clear', (req, res) => {
  const { attachmentId = null } = req.body || {};
  const result = classroomService.clearSubmissions(attachmentId);
  res.json({ success: true, ...result });
});

/**
 * Get student submission
 */
apiRouter.get('/submission/:id', (req, res) => {
  const submission = classroomService.getSubmission(req.params.id);
  if (!submission) {
    return res.status(404).json({ success: false, error: 'Submission not found' });
  }
  res.json({ success: true, submission });
});

/**
 * Save student submission progress
 */
apiRouter.post('/submission/:id/save', (req, res) => {
  const updated = classroomService.updateSubmission(req.params.id, req.body);
  res.json({ success: true, submission: updated });
});

/**
 * Grade passback endpoint for teacher review
 */
apiRouter.post('/grade-passback', async (req, res) => {
  try {
    const {
      submissionId,
      assignedGrade,
      teacherComment,
      accessToken = '',
      loginHint = ''
    } = req.body;

    const grade = Number(assignedGrade);
    if (!submissionId || !Number.isFinite(grade) || grade < 0 || grade > 100) {
      return res.status(400).json({ success: false, error: 'A submissionId and a grade between 0 and 100 are required' });
    }

    // Prefer the token sent by the teacher's browser, otherwise the one cached when they attached the activity
    const cached = getCachedOAuthToken(loginHint);
    const result = await classroomService.passGradeToClassroom({
      submissionId,
      assignedGrade: grade,
      teacherComment,
      accessToken: accessToken || cached?.accessToken || ''
    });

    res.json({ success: result.success !== false, result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Block 1: Process & synthesize multimodal teacher materials (typed + voice dictation + handwritten photos)
 */
apiRouter.post('/materials/process-multimodal', async (req, res) => {
  try {
    const {
      typedText = '',
      voiceTranscript = '',
      instructions = '',
      images = [],
      provider = config.defaultProvider
    } = req.body;

    const prompt = SocraticPromptEngine.buildMaterialSynthesisPrompt({
      typedText,
      voiceTranscript,
      instructions
    });

    const result = await llmService.synthesizeTeacherMaterials({
      prompt,
      typedText,
      voiceTranscript,
      instructions,
      images,
      provider
    });

    res.json({
      success: true,
      result
    });
  } catch (err) {
    console.error('[API] process-multimodal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Block 2: Generate AI Lesson Plan Draft & Expanded Exercise Pool (Diagnostic + Levels A/B/C)
 */
apiRouter.post('/lesson-plan/generate-draft', async (req, res) => {
  try {
    const {
      courseName = 'MHF4U Advanced Functions',
      gradeLevel = 'Grade 12',
      materials = '',
      teacherInstructions = '',
      provider = config.defaultProvider
    } = req.body;

    const prompt = SocraticPromptEngine.buildLessonPlanDraftPrompt({
      courseName,
      gradeLevel,
      materials,
      teacherInstructions
    });

    const draft = await llmService.generateLessonPlanDraft({
      prompt,
      courseName,
      gradeLevel,
      materials,
      teacherInstructions,
      provider
    });

    res.json({
      success: true,
      draft
    });
  } catch (err) {
    console.error('[API] generate-draft error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Point 7: Get automatic student performance cohorts (A / B / C) and teacher prep telemetry
 */
apiRouter.get('/attachment/:id/cohorts', (req, res) => {
  try {
    const summary = classroomService.getCohortSummary(req.params.id);
    res.json({
      success: true,
      ...summary,
      storage: classroomService.getStorageInfo(),
      resultsSheetUrl: classroomService.getResultsSheetUrl(req.params.id)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Mobile QR Bridge: Create session for phone camera upload (Teacher Block 1 or Student Handwritten Solution)
 */
apiRouter.post('/mobile-bridge/create', (req, res) => {
  const { mode = 'student_solution', targetId = '' } = req.body || {};
  const session = classroomService.createMobileSession({ mode, targetId });
  res.json({ success: true, session });
});

/**
 * Mobile QR Bridge: Poll session uploads
 */
apiRouter.get('/mobile-bridge/:token', (req, res) => {
  const session = classroomService.getMobileSession(req.params.token);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, session });
});

/**
 * Mobile QR Bridge: Upload photo from phone camera
 */
apiRouter.post('/mobile-bridge/:token/upload', (req, res) => {
  const { mimeType = 'image/jpeg', data, note = '' } = req.body || {};
  if (!data) {
    return res.status(400).json({ success: false, error: 'Missing image data' });
  }
  const upload = classroomService.saveMobileUpload(req.params.token, { mimeType, data, note });
  res.json({ success: true, upload });
});
