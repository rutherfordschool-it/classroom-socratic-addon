import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsFilePath = path.join(__dirname, '..', 'data', 'prompts', 'socratic_system_prompts.json');

let cachedPrompts = null;
function getPrompts() {
  if (!cachedPrompts) {
    try {
      const raw = fs.readFileSync(promptsFilePath, 'utf-8');
      cachedPrompts = JSON.parse(raw);
    } catch (e) {
      console.error('[PromptEngine] Error reading socratic_system_prompts.json:', e);
      throw e;
    }
  }
  return cachedPrompts;
}

/**
 * High School Socratic Prompt Engine for US and Canadian Curricula.
 * Loads all system prompts, pedagogical directives, and guardrails from external JSON.
 */
export class SocraticPromptEngine {
  /**
   * Generates the system prompt tailored to lesson plan expectations, difficulty level, and student mode.
   */
  static buildSystemPrompt({
    curriculum = 'canada',
    gradeLevel = 'Grade 12',
    subject = 'Mathematics',
    courseName = 'Advanced Functions (MHF4U)',
    topic = 'Product, Quotient, and Power Laws of Logarithms',
    learningGoal = 'Understand and apply the laws of logarithms to simplify expressions',
    overallExpectations = [],
    specificExpectations = [],
    studentMode = 'step_by_step', // 'step_by_step' | 'solo_answer' | 'general_blueprint'
    currentLevel = 'B', // 'A' | 'B' | 'C'
    targetMilestones = [],
    courseMaterials = '',
    referenceExercise = null,
    diagnosticStatus = 'COMPLETED',
    levelConfigs = null
  }) {
    const data = getPrompts().systemPrompt;
    const currConfig = data.curricula[curriculum] || data.curricula.canada;
    const curriculumName = currConfig.curriculumName;
    const spellingConvention = currConfig.spellingConvention;

    const list = specificExpectations.length > 0 ? specificExpectations : targetMilestones;
    const expectationsText = list.length > 0 
      ? list.map((e, idx) => `  ${idx + 1}. ${e}`).join('\n')
      : '  1. Understand the core rule\n  2. Apply the rule to simplify the expression';

    let materialsSection = '';
    if (courseMaterials && courseMaterials.trim()) {
      materialsSection = data.materialsSectionTemplate.replace('{{materialsText}}', courseMaterials.trim());
    }

    let exerciseSection = '';
    if (referenceExercise) {
      exerciseSection = data.exerciseSectionTemplate
        .replace(/\{\{level\}\}/g, currentLevel)
        .replace('{{problem}}', referenceExercise.problem || '')
        .replace('{{targetAnswer}}', referenceExercise.targetAnswer || 'N/A');
    }

    let diagnosticDirective = '';
    if (data.diagnosticSectionTemplate) {
      diagnosticDirective = data.diagnosticSectionTemplate.replace('{{diagnosticStatus}}', diagnosticStatus);
    }

    const modeDirective = data.modes[studentMode] || data.modes.step_by_step;
    const guardrailsText = (data.guardrails || []).join('\n');

    let prompt = data.baseTemplate;
    prompt = prompt
      .replace('{{courseName}}', courseName)
      .replace('{{gradeLevel}}', gradeLevel)
      .replace('{{curriculumName}}', curriculumName)
      .replace('{{topic}}', topic)
      .replace(/\{\{currentLevel\}\}/g, currentLevel)
      .replace('{{spellingConvention}}', spellingConvention)
      .replace('{{expectationsText}}', expectationsText)
      .replace('{{materialsSection}}', materialsSection)
      .replace('{{exerciseSection}}', exerciseSection)
      .replace('{{diagnosticDirective}}', diagnosticDirective)
      .replace('{{modeDirective}}', modeDirective)
      .replace('{{guardrailsText}}', guardrailsText)
      .replace('{{milestoneProgress}}', '1')
      .replace('{{masteryLevel}}', '50')
      .replace('{{studentMode}}', studentMode);

    const activeLvlCfg = levelConfigs?.[currentLevel];
    if (activeLvlCfg && (activeLvlCfg.description || activeLvlCfg.prompt)) {
      prompt += `\n\n[TEACHER CUSTOM LEVEL ${currentLevel} CONFIGURATION]\n- Level ${currentLevel} Description: ${activeLvlCfg.description || ''}\n- Level ${currentLevel} Socratic Prompt Directive: ${activeLvlCfg.prompt || ''}`;
    }

    prompt += `\n\n[CRITICAL PEDAGOGICAL RULE — STEP-BY-STEP PROOF REQUIRED]\nA single bare number (e.g., "5" or "2") without intermediate steps is NOT acceptable as a complete answer. Always require the student to show how they applied the mathematical law or formula step by step (either across consecutive chat steps or as a chained equation like $\\log_2(4 \\cdot 8) = \\log_2(32) = 5$) to prove their conceptual understanding.`;

    return prompt;
  }

  /**
   * Generates a prompt for synthesizing multimodal teacher materials (typed, voice dictation, handwritten photos).
   */
  static buildMaterialSynthesisPrompt({
    typedText = '',
    voiceTranscript = '',
    instructions = ''
  }) {
    const tpl = getPrompts().materialStudioSynthesizer?.template || '';
    return tpl
      .replace('{{typedText}}', typedText || '(None)')
      .replace('{{voiceTranscript}}', voiceTranscript || '(None)')
      .replace('{{instructions}}', instructions || 'Organize into clear theory definitions and base worked examples with $LaTeX$.');
  }

  /**
   * Generates a prompt for creating a Lesson Plan draft and an expanded Exercise Pool (Diagnostic + Levels A/B/C),
   * explicitly incorporating ALL loaded curriculum documents and ALL loaded material documents.
   */
  static buildLessonPlanDraftPrompt({
    courseName = 'High School Course',
    gradeLevel = 'Grade 12',
    subject = '',
    curriculum = '',
    materials = '',
    loadedDocuments = [],
    teacherInstructions = ''
  }) {
    const tpl = getPrompts().lessonPlanDraftGenerator?.template || '';
    const docs = Array.isArray(loadedDocuments) ? loadedDocuments.filter(d => d && (d.content || d.title)) : [];
    const curriculumDocs = docs.filter(d => d.docCategory === 'curriculum');
    const materialDocs = docs.filter(d => d.docCategory !== 'curriculum');

    let multiDocManifest = '';
    if (docs.length > 0) {
      const curLines = curriculumDocs.map((d, i) =>
        `=== [📘 CURRICULUM DOCUMENT ${i + 1} of ${curriculumDocs.length}: ${d.title || 'Curriculum Standard'} (${d.source || 'Library'})] ===\n${String(d.content || '').trim()}`
      );
      const matLines = materialDocs.map((d, i) =>
        `=== [📄 COURSE MATERIAL DOCUMENT ${i + 1} of ${materialDocs.length}: ${d.title || 'Course Material'} (${d.source || 'Teacher Studio'})] ===\n${String(d.content || '').trim()}`
      );
      multiDocManifest = [
        `LOADED DOCUMENTS MANIFEST (${docs.length} Total Document(s): ${curriculumDocs.length} Curriculum + ${materialDocs.length} Material):`,
        ...curLines,
        ...matLines
      ].filter(Boolean).join('\n\n');
    }

    const effectiveMaterials = [
      multiDocManifest,
      (!multiDocManifest || (materials && !multiDocManifest.includes(materials.slice(0, 80)))) ? materials : ''
    ].filter(Boolean).join('\n\n') || `Topic / Course: ${courseName} (${gradeLevel})`;

    const multiDocDirective = docs.length > 1
      ? `\n\nCRITICAL MULTI-DOCUMENT REQUIREMENT (${docs.length} Documents Loaded — ${curriculumDocs.length} Curriculum, ${materialDocs.length} Material):\n` +
        `- You MUST synthesize and use ALL ${docs.length} loaded documents above.\n` +
        `- Align the learningGoal, socraticSteps/targetMilestones, and specificExpectations with ALL ${curriculumDocs.length || 1} curriculum standards and ALL ${materialDocs.length || docs.length} material documents.\n` +
        `- Distribute the 10 Level A, 10 Level B, 10 Level C, and Diagnostic problems proportionally across ALL ${materialDocs.length || docs.length} loaded material documents so every loaded document is represented in every difficulty tier.`
      : '';

    return tpl
      .replace('{{courseName}}', [courseName, subject, curriculum].filter(Boolean).join(' • '))
      .replace('{{gradeLevel}}', gradeLevel)
      .replace('{{materials}}', effectiveMaterials)
      .replace(
        '{{teacherInstructions}}',
        `${teacherInstructions || 'Create a progressive Socratic lesson plan from foundational single-step problems to multi-step synthesis.'}${multiDocDirective}`
      );
  }

  /**
   * Generates a prompt to synthesize a fresh parallel exercise of difficulty level A, B, or C.
   */
  static buildSimilarExercisePrompt({
    level = 'B',
    topic = 'Product, Quotient, and Power Laws of Logarithms',
    template = 'Simplify: k*log_b(M) - log_b(N)',
    specificExpectation = 'Apply Quotient and Power laws'
  }) {
    const gen = getPrompts().similarExerciseGenerator;
    return gen.template
      .replace(/\{\{level\}\}/g, level)
      .replace('{{specificExpectation}}', specificExpectation)
      .replace('{{template}}', template);
  }

  /**
   * Generates a prompt for teacher review evaluation and gradebook passback.
   */
  static buildTeacherReviewPrompt({
    courseName,
    topic,
    learningGoal = '',
    specificExpectations = [],
    targetMilestones = [],
    transcript = [],
    currentLevel = 'B'
  }) {
    const expectationsList = specificExpectations.length > 0 ? specificExpectations : targetMilestones;
    const expectationsListStr = expectationsList.map((e, i) => `${i + 1}. ${e}`).join('\n');
    const transcriptText = transcript.map(t => {
      const imgTag = t.attachments?.length ? ` [Attached ${t.attachments.length} Handwritten Photo(s)]` : '';
      return `${t.role.toUpperCase()}${imgTag}: ${t.content}`;
    }).join('\n\n');

    const rev = getPrompts().teacherReviewEvaluation;
    return rev.template
      .replace('{{courseName}}', courseName)
      .replace('{{topic}}', topic)
      .replace('{{learningGoal}}', learningGoal)
      .replace(/\{\{currentLevel\}\}/g, currentLevel)
      .replace('{{expectationsList}}', expectationsListStr)
      .replace('{{transcriptText}}', transcriptText);
  }
}
