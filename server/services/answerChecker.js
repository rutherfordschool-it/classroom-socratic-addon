/**
 * Server-side answer checking for Socratic exercises.
 *
 * Grading must only ever happen on the server, against the answer key stored with the lesson plan:
 * the student's browser never receives `targetAnswer`.
 *
 * checkAnswer() returns { gradable, correct }:
 *   - gradable=false when the problem has no usable answer key (empty / generator placeholder) so the
 *     teacher can review it manually instead of the student being marked wrong.
 */

const PLACEHOLDER_TARGET = /^(?:n\/a|tbd|none|valid solution|step-by-step|identify key pattern|complete multi-step|full verification)/i;
const ARROW_SPLIT = /=>|->|⇒|\\longrightarrow|\\rightarrow|\\implies/;
const REJECT_CLAUSE = /\([^)]*(?:reject|extraneous|invalid|discard|domain)[^)]*\)|(?:reject|extraneous|invalid|discard)[^,;)]*/gi;

/** Lower-cases and flattens LaTeX / unicode math into a compact comparable string. */
export function normalizeMath(input = '') {
  let s = String(input || '').toLowerCase();
  s = s.replace(/\[handwritten photo[^\]]*\]/g, '');
  s = s.replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, '');
  s = s.replace(/\\implies|\\longrightarrow|\\rightarrow|\\to\b|⇒/g, '->');
  s = s.replace(/\\cdot|\\times|·|×/g, '*');
  s = s.replace(/\\dfrac|\\tfrac/g, '\\frac');
  for (let i = 0; i < 6; i++) {
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
  }
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
  s = s.replace(/\\(log|ln|sin|cos|tan)/g, '$1');
  s = s.replace(/\\le(?:q)?\b|≤/g, '<=').replace(/\\ge(?:q)?\b|≥/g, '>=');
  s = s.replace(/[{]/g, '(').replace(/[}]/g, ')');
  s = s.replace(/[−–]/g, '-');
  s = s.replace(/\$/g, '').replace(/\s+/g, '');
  return s;
}

/** Evaluates + - * / ^ ( ) sqrt( ) arithmetic safely (no eval). Returns a number or null. */
export function evalArithmetic(expr = '') {
  const s = String(expr || '');
  if (!s) return null;
  let i = 0;
  const peek = () => s[i];
  const fail = () => { throw new Error('bad-expr'); };
  const expect = (ch) => { if (s[i] !== ch) fail(); i++; };

  function parseExpr() {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parsePow();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = parsePow();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function parsePow() {
    const base = parseUnary();
    if (peek() === '^') {
      i++;
      return Math.pow(base, parsePow());
    }
    return base;
  }
  function parseUnary() {
    if (peek() === '-') { i++; return -parseUnary(); }
    if (peek() === '+') { i++; return parseUnary(); }
    return parseAtom();
  }
  function parseAtom() {
    if (s.startsWith('sqrt(', i)) {
      i += 5;
      const v = parseExpr();
      expect(')');
      return Math.sqrt(v);
    }
    if (peek() === '(') {
      i++;
      const v = parseExpr();
      expect(')');
      return v;
    }
    const m = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    return Number(m[0]);
  }

  try {
    const v = parseExpr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

const decimalsOf = (numStr = '') => (String(numStr).split('.')[1] || '').length;

function numbersEqual(a, b, decimals = 0) {
  const tol = decimals >= 2 ? 0.5 * Math.pow(10, -decimals) : 1e-9 * Math.max(1, Math.abs(b));
  return Math.abs(a - b) <= tol;
}

/** Text after the last arrow ("=>", "->", "\implies"...) – i.e. the student's final statement. */
function finalSegment(normalized = '') {
  const parts = normalized.split(ARROW_SPLIT);
  return parts[parts.length - 1] || '';
}

/** Text after the last "=" that is an equals sign (not part of <=, >= or !=). */
const afterLastEquals = (str = '') => {
  let idx = -1;
  for (let k = 0; k < str.length; k++) {
    if (str[k] === '=' && str[k - 1] !== '<' && str[k - 1] !== '>' && str[k - 1] !== '!') idx = k;
  }
  return idx >= 0 ? str.slice(idx + 1) : str;
};

/** Pulls the numeric solution set out of text like "x=3 or x=6", "3,6", "x=2 (reject x=-3)". */
function extractSolutionSet(rawText = '') {
  const stripped = String(rawText).replace(REJECT_CLAUSE, ' ');
  const norm = normalizeMath(stripped);
  const segment = finalSegment(norm);
  const pieces = segment.split(/or|and|,|;/).filter(Boolean);
  const values = [];
  for (const piece of pieces) {
    const rhs = afterLastEquals(piece);
    const v = evalArithmetic(rhs);
    if (v !== null) values.push(Math.round(v * 1e9) / 1e9);
  }
  return new Set(values);
}

function rejectedValues(rawTarget = '') {
  const found = new Set();
  const clauses = String(rawTarget).match(REJECT_CLAUSE) || [];
  for (const clause of clauses) {
    for (const m of clause.matchAll(/-?\d+(?:\.\d+)?/g)) found.add(Number(m[0]));
  }
  return found;
}

const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

export function checkAnswer(studentRaw = '', targetRaw = '') {
  const student = String(studentRaw || '').trim();
  const target = String(targetRaw || '').trim();

  if (!target || PLACEHOLDER_TARGET.test(target)) {
    return { gradable: false, correct: false };
  }
  const ns = normalizeMath(student);
  const nt = normalizeMath(target);
  if (!ns) return { gradable: true, correct: false };
  if (ns === nt) return { gradable: true, correct: true };

  // ── 1. Numeric target with optional unit / percent, e.g. "5", "2.5", "5/2", "22.0 g", "80.0%" ──
  const numUnit = /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(%?)\s*(.*)$/s.exec(target);
  if (numUnit) {
    const remainder = numUnit[3].trim();
    const looksLikeUnit = /^[a-z°µ%/0-9²³ .-]{0,14}$/i.test(remainder) &&
      !/\b(?:and|or|law|rule|reject|extraneous|domain)\b/i.test(remainder);
    if (looksLikeUnit) {
      const targetNum = evalArithmetic(normalizeMath(numUnit[1]));
      const isPercent = numUnit[2] === '%';
      const decimals = decimalsOf(numUnit[1]);
      const rhs = afterLastEquals(finalSegment(ns));
      // Drop a trailing unit such as "mol", "g", "%" before evaluating the number
      const studentNum = evalArithmetic(rhs.replace(/[a-z°µ%][a-z0-9°µ%/]*$/i, ''));
      if (targetNum !== null && studentNum !== null) {
        const ok = numbersEqual(studentNum, targetNum, decimals) || (isPercent && numbersEqual(studentNum, targetNum / 100, decimals + 2));
        return { gradable: true, correct: ok };
      }
      return { gradable: true, correct: false };
    }

    // ── 2. Multi-part answer such as "2 and Product Law" (all numbers + named rules must appear) ──
    if (/[a-z]{3,}/i.test(remainder) && !/[<>=]/.test(remainder)) {
      const mainPart = target.replace(/\([^)]*\)/g, '').trim();
      const expectedNums = mainPart.match(/-?\d+(?:\.\d+)?/g) || [];
      const allNums = expectedNums.every(n => {
        const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?<![\\d.])${esc}(?![\\d.])`).test(student);
      });
      if (!allNums) return { gradable: true, correct: false };
      for (const rule of ['product', 'quotient', 'power']) {
        if (new RegExp(rule, 'i').test(mainPart) && !new RegExp(rule, 'i').test(student)) {
          return { gradable: true, correct: false };
        }
      }
      return { gradable: true, correct: true };
    }
  }

  // ── 3. Solution-set target: "x = 2 (reject x = -3)", "x = 3 or x = 6", "x = 16" ──
  const mainTarget = target.replace(REJECT_CLAUSE, ' ').trim();
  const targetSet = extractSolutionSet(mainTarget);
  const looksLikeSolutionTarget = /^(?:[a-z]\s*=\s*)?[-+]?[\d.(]/i.test(mainTarget) &&
    !/[<>]/.test(mainTarget) && targetSet.size > 0;
  if (looksLikeSolutionTarget) {
    const studentSet = extractSolutionSet(student);
    const forbidden = rejectedValues(target);
    for (const v of studentSet) {
      if (forbidden.has(v) && !targetSet.has(v)) return { gradable: true, correct: false };
    }
    return { gradable: true, correct: sameSet(studentSet, targetSet) };
  }

  // ── 4. Symbolic target: compare the right-hand side of the final statement ──
  const strip = (s) => afterLastEquals(finalSegment(s)).replace(/^\((.*)\)$/, '$1');
  const studentRhs = strip(ns);
  const targetRhs = strip(nt);
  if (studentRhs && studentRhs === targetRhs) return { gradable: true, correct: true };
  const sv = evalArithmetic(studentRhs);
  const tv = evalArithmetic(targetRhs);
  if (sv !== null && tv !== null) return { gradable: true, correct: numbersEqual(sv, tv, 2) };
  return { gradable: true, correct: false };
}

export function isAnswerCorrect(studentRaw, targetRaw) {
  return checkAnswer(studentRaw, targetRaw).correct;
}

/** A step counts as "work" when it is more than a bare number: math structure, or a short written explanation. */
export function looksLikeWorkStep(step = '') {
  const raw = String(step || '');
  const clean = raw
    .replace(/\$|\\left|\\right|\\cdot|\s+/g, '')
    .replace(/^x=/i, '')
    .replace(/^=/, '');
  if (!clean) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(clean)) return false;
  const hasMathStructure = /=|->|⇒|\\Longrightarrow|\\implies|\\log|\blog|\bln\b|\\frac|\\sqrt|[+\-*/^]/i.test(raw);
  const wordCount = raw.trim().split(/\s+/).length;
  return hasMathStructure || wordCount >= 3;
}
