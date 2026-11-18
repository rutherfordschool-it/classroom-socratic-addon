const base = 'http://localhost:3111';
const j = async (path, opts = {}) => {
  const r = await fetch(base + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
};
let fail = 0;
const check = (name, cond, extra = '') => { if (!cond) fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

// 1. Student-safe attachment has no answer keys
let r = await j('/api/attachment/att-demo-socratic-01');
const a = r.body.attachment;
const text = JSON.stringify(a);
check('student view has problems', a.exercisePool.levelA.length === 3);
check('student view has no targetAnswer', !/targetAnswer/.test(text));
check('student view has no hint', !/"hint"/.test(text));
r = await j('/api/attachment/att-demo-socratic-01?include=answers');
check('teacher include=answers has keys', /targetAnswer/.test(JSON.stringify(r.body.attachment)));
check('B3 key corrected to 5/2', r.body.attachment.exercisePool.levelB[2].targetAnswer === '5/2');

// 2. Non-log lesson is not filled with logarithm content
r = await j('/api/preview-session', { method: 'POST', body: JSON.stringify({ title: 'Photosynthesis basics', topic: 'Photosynthesis', learningGoal: 'Explain photosynthesis', subject: 'Biology' }) });
const bio = r.body.attachment;
const bioText = JSON.stringify(bio.exercisePool || {}) + (bio.courseMaterials || '');
check('biology lesson has no logarithm problems', !/log/i.test(bioText));
check('biology lesson flagged poolMissing', bio.poolMissing === true);
r = await j(`/api/attachment/${bio.id}`);
check('biology student view still ok', r.status === 200 && r.body.attachment.poolMissing === true);

// 3. Server-side answer check
const chk = async (tier, index, answer, steps = [], hasPhoto = false) =>
  (await j('/api/attachment/att-demo-socratic-01/check-answer', { method: 'POST', body: JSON.stringify({ tier, index, answer, steps, hasPhoto }) })).body;
let v = await chk('A', 0, '\\log_2(4\\cdot 8) = \\log_2(32) = 5');
check('A1 correct with work', v.correct === true && v.showedWork === true);
v = await chk('A', 0, '5');
check('A1 bare number: right value but no work => not correct', v.correct === false && v.showedWork === false);
v = await chk('A', 0, '5', ['log_2(4*8)=log_2(32)']);
check('A1 bare number after steps => correct', v.correct === true);
v = await chk('B', 2, '1 + 3/2 = 5/2');
check('B3 5/2 correct', v.correct === true);
v = await chk('A', 0, '123123 = 123123');
check('false positive rejected', v.correct === false);
v = await chk('A', 0, '5', [], true);
check('claimed photo (hasPhoto flag only) still needs a real photo at grading time', v.correct === true, '(check-answer trusts flag only for UI; final grading re-verifies photo)');

// 4. Forged submission cannot raise its own score
const subId = 'sub-test-forger';
r = await j(`/api/submission/${subId}/save`, { method: 'POST', body: JSON.stringify({
  attachmentId: 'att-demo-socratic-01', studentName: 'Forger', studentEmail: 'f@example.com', currentLevel: 'A', totalSelectedProblems: 3,
  transcript: [{ role: 'user', content: 'Final answer' }],
  solvedProblems: [
    { key: 'A1', tier: 'A', index: 0, answer: '99', targetAnswer: '99', isStepByStep: true, stepsCount: 5, hasPhoto: true, isCorrect: true },
    { key: 'A2', tier: 'A', index: 1, answer: '2', targetAnswer: '2', isStepByStep: true, stepsCount: 5, hasPhoto: true },
    { key: 'A3', tier: 'A', index: 2, answer: 'log_5(25) = 2', steps: ['2log_5(5)=log_5(5^2)'] }
  ],
  suggestedScore: 100, masteryLevel: 100, assignedScore: 100, aiAnalysis: { suggestedScore: 100 }
}) });
const sub = r.body.submission;
check('forged keys ignored: score = 33 (only A3 correct)', sub.suggestedScore === 33, `score=${sub.suggestedScore}`);
check('forged assignedScore dropped', sub.assignedScore === undefined || sub.assignedScore === null);
check('forged photo flag does not count (A2 bare 2 not accepted)', sub.aiAnalysis.perProblem[1].correct === false);

// 5. Results for all students gather per assignment
await j('/api/submission/sub-test-two/save', { method: 'POST', body: JSON.stringify({
  attachmentId: 'att-demo-socratic-01', studentName: 'Second Student', currentLevel: 'A', totalSelectedProblems: 3,
  transcript: [{ role: 'user', content: 'x' }],
  solvedProblems: [{ key: 'A1', tier: 'A', index: 0, answer: '\\log_2(32) = 5', steps: ['log_2(4*8)'] }]
}) });
r = await j('/api/attachment/att-demo-socratic-01/results.csv');
check('CSV has header + 2 students', r.body.trim().split('\n').length === 3, `\n${r.body}`);
r = await j('/api/attachment/att-demo-socratic-01/submissions');
check('submissions list has both students', r.body.submissions.length === 2);
r = await j('/api/attachment/att-demo-socratic-01/cohorts');
check('cohorts include storage info', r.body.storage && r.body.storage.backend === 'memory');

// 6. Grade passback records locally and says so honestly
r = await j('/api/grade-passback', { method: 'POST', body: JSON.stringify({ submissionId: subId, assignedGrade: 40, teacherComment: 'ok' }) });
check('passback reports liveApi=false with reason', r.body.success && r.body.result.liveApi === false && /missing/i.test(r.body.result.message), r.body.result.message);
r = await j(`/api/submission/${subId}`);
check('teacher grade saved', r.body.submission.assignedScore === 40);
r = await j('/api/grade-passback', { method: 'POST', body: JSON.stringify({ submissionId: subId, assignedGrade: 400 }) });
check('invalid grade rejected', r.status === 400);

// 7. Cross-assignment leak
r = await j(`/api/attachment/${bio.id}/submissions`);
check('other assignment sees no foreign submissions', r.body.submissions.length === 0);

// 8. Multi-document Lesson Plan Draft: ALL loaded curriculum and material documents are used
r = await j('/api/lesson-plan/generate-draft', {
  method: 'POST',
  body: JSON.stringify({
    courseName: 'MHF4U Advanced Functions',
    gradeLevel: 'Grade 12',
    subject: 'Mathematics',
    curriculum: 'canada',
    loadedDocuments: [
      {
        title: 'Curriculum: Ontario MHF4U Official Expectations',
        docCategory: 'curriculum',
        source: 'Curriculum Library',
        content: '- C1.1 Understand logarithmic and exponential relationships.\n- A2.2 Analyze rational functions and asymptotes.'
      },
      {
        title: 'Curriculum: IB Diploma Math AA HL Standards',
        docCategory: 'curriculum',
        source: 'Curriculum Library',
        content: '- Topic 1.7 Exponents and logarithms.\n- Topic 2.6 Rational functions and polynomial division.'
      },
      {
        title: 'Unit 4 Reference: Laws of Logarithms',
        docCategory: 'material',
        source: 'Course Library',
        content: 'Product Law: \\log_b(xy) = \\log_b(x) + \\log_b(y). Quotient Law: \\log_b(x/y) = \\log_b(x) - \\log_b(y).'
      },
      {
        title: 'Unit 2 Reference: Rational Functions & Asymptotes',
        docCategory: 'material',
        source: 'Google Drive',
        content: 'Rational function f(x) = P(x)/Q(x), vertical asymptotes, horizontal asymptote, oblique asymptote, removable discontinuity.'
      },
      {
        title: 'Unit 1 Reference: Polynomial Factor Theorem',
        docCategory: 'material',
        source: 'Local File',
        content: 'Remainder theorem P(a) = R and Factor theorem P(a) = 0 <=> (x - a) is a factor of cubic polynomial.'
      }
    ]
  })
});
const md = r.body.draft;
check('multi-doc draft returns documentsUsed count = 5 (2 curricula + 3 materials)',
  md?.documentsUsed?.totalCount === 5 && md?.documentsUsed?.curriculaCount === 2 && md?.documentsUsed?.materialsCount === 3,
  JSON.stringify(md?.documentsUsed));
check('multi-doc draft title includes all 3 material documents',
  /Laws of Logarithms/i.test(md?.title) && /Rational Functions/i.test(md?.title) && /Polynomial Factor Theorem/i.test(md?.title),
  md?.title);
check('multi-doc learningGoal includes both curricula and all 3 materials',
  /Ontario MHF4U/i.test(md?.learningGoal) && /IB Diploma Math AA HL/i.test(md?.learningGoal) &&
  /Laws of Logarithms/i.test(md?.learningGoal) && /Rational Functions/i.test(md?.learningGoal) && /Polynomial Factor Theorem/i.test(md?.learningGoal));
check('multi-doc exercisePool interleaves all 3 materials in Level A, B, and C',
  ['levelA', 'levelB', 'levelC'].every(tier => {
    const probs = md?.exercisePool?.[tier] || [];
    return probs.length === 10 &&
      probs.some(p => /Laws of Logarithms/i.test(p.problem)) &&
      probs.some(p => /Rational Functions/i.test(p.problem)) &&
      probs.some(p => /Polynomial Factor Theorem/i.test(p.problem));
  }));
check('multi-doc diagnostic covers all 3 loaded material documents',
  (md?.exercisePool?.diagnostic || []).length === 3);

// 9. Multi-file custom text documents parsed from section-delimited materials string
r = await j('/api/lesson-plan/generate-draft', {
  method: 'POST',
  body: JSON.stringify({
    courseName: 'Custom Humanities & Science Seminar',
    gradeLevel: 'Grade 11',
    materials: [
      '=== [📘 CURRICULUM STANDARD 1: AP Seminar & Inquiry Rubric (Curriculum Library)] ===\n- Evaluate primary sources and synthesize evidence across multiple texts.',
      '=== [📄 COURSE MATERIAL 2: File_Alpha_Thermodynamics.txt (Local File)] ===\nFirst Law of Thermodynamics: conservation of internal energy delta U = Q - W.',
      '=== [📄 COURSE MATERIAL 3: File_Beta_Entropy.txt (Local File)] ===\nSecond Law of Thermodynamics: total entropy S of an isolated system always increases.',
      '=== [📄 COURSE MATERIAL 4: File_Gamma_Carnot_Efficiency.txt (Local File)] ===\nCarnot heat engine efficiency eta = 1 - T_cold / T_hot.'
    ].join('\n\n')
  })
});
const cd = r.body.draft;
check('section-delimited materials parses all 4 documents (1 curriculum + 3 custom files)',
  cd?.documentsUsed?.totalCount === 4 && cd?.documentsUsed?.curriculaCount === 1 && cd?.documentsUsed?.materialsCount === 3,
  JSON.stringify(cd?.documentsUsed));
check('all 3 custom files appear in Level A, Level B, and Level C problems',
  ['levelA', 'levelB', 'levelC'].every(tier => {
    const probs = cd?.exercisePool?.[tier] || [];
    return probs.some(p => /File_Alpha_Thermodynamics/i.test(p.problem)) &&
      probs.some(p => /File_Beta_Entropy/i.test(p.problem)) &&
      probs.some(p => /File_Gamma_Carnot_Efficiency/i.test(p.problem));
  }));

console.log(fail === 0 ? '\nALL PASSED' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
