import { checkAnswer, looksLikeWorkStep } from '../server/services/answerChecker.js';

let fail = 0;
const t = (name, student, target, expectCorrect, expectGradable = true) => {
  const r = checkAnswer(student, target);
  const ok = r.correct === expectCorrect && r.gradable === expectGradable;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: "${student}" vs "${target}" -> ${JSON.stringify(r)}`);
};

// Integer targets
t('A1 chain', '\\log_2(4\\cdot 8) = \\log_2(32) = 5', '5', true);
t('A1 wrong', '\\log_2(32) = 4', '5', false);
t('substring false positive', '123123', '2', false);
t('131231 vs 3', '131231', '3', false);
t('chained eq mid-number', '2+3=5', '5', true);
t('rhs not target', '5 = 6', '5', false);
// B3 fix: 5/2
t('B3 fraction', '1 + 3/2 = 5/2', '5/2', true);
t('B3 decimal', '\\frac{1}{2}\\log_4(16)+\\log_4(8) = 2.5', '5/2', true);
t('B3 latex frac', '= \\frac{5}{2}', '5/2', true);
t('B3 old wrong key', '2', '5/2', false);
// Solution sets
t('C1 correct', 'x = 2', 'x = 2 (reject x = -3)', true);
t('C1 gave rejected root too', 'x = 2 or x = -3', 'x = 2 (reject x = -3)', false);
t('C1 only rejected', 'x = -3', 'x = 2 (reject x = -3)', false);
t('C2 both roots', 'x = 3 or x = 6', 'x = 3 or x = 6', true);
t('C2 one root', 'x = 3', 'x = 3 or x = 6', false);
t('C2 reversed', 'x=6, x=3', 'x = 3 or x = 6', true);
t('C3', 'x = 5', 'x = 5 (reject x = -5)', true);
// Units / percent
t('mol', '36/18 = 2.0 mol', '2.0 mol', true);
t('percent', '40/50*100 = 80%', '80.0%', true);
t('percent wrong', '70%', '80.0%', false);
// Diagnostic multi-part
t('diag ok', 'log_3(9) = 2, Product Law', '2 and Product Law', true);
t('diag missing rule', '2', '2 and Product Law', false);
// Ungradable
t('placeholder', '5', 'Step-by-step derivation', false, false);
t('empty', '5', '', false, false);
// Symbolic
t('symbolic ok', 'log_b(x+3)', 'log_b(x + 3)', true);
t('symbolic wrong', 'log_b(x-3)', 'log_b(x + 3)', false);

// Work detection
const w = (s, e) => { const r = looksLikeWorkStep(s); const ok = r === e; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  work "${s}" -> ${r}`); };
w('5', false); w('x=2', false); w('-3.5', false);
w('\\log_2(32) = 5', true); w('I used the product law first', true); w('2+3', true);
console.log(fail === 0 ? '\nALL PASSED' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
