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

console.log(fail === 0 ? '\nALL PASSED' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
