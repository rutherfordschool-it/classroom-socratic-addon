import { SocraticPromptEngine } from '../server/services/promptEngine.js';

const prompt = SocraticPromptEngine.buildSystemPrompt({
  courseName: 'MHF4U Grade 12',
  gradeLevel: 'Grade 12',
  topic: 'Laws of Logarithms',
  specificExpectations: ['Power law', 'Quotient law'],
  studentMode: 'step_by_step',
  currentLevel: 'B',
  courseMaterials: 'log_b(xy) = log_b(x) + log_b(y)',
  referenceExercise: {
    problem: 'Simplify: 2 log_3(6) - log_3(4)',
    targetAnswer: '2'
  }
});

console.log('--- GENERATED PROMPT PREVIEW ---');
console.log(prompt.slice(0, 300));
console.log('...\nGuardrails check:', prompt.includes('STRICT GUARDRAILS'));
console.log('Telemetry check:', prompt.includes('<!--TELEMETRY:'));
