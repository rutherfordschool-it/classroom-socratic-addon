/**
 * SocratesAI — Inline WYSIWYG Math & Text Editor
 * Provides natural live math typing (5/6 -> fraction, x^2 -> power, log_3 -> logarithm)
 * directly in the flow of regular English/natural text, without requiring a separate Preview box.
 */

const DOLLAR_RE = /\$(?!\s)([^$\n]+?)(?<!\s)\$/g;
const ZW = '\u200B';

function cleanLatex(latex) {
  return (latex || '').replace(/\\placeholder(\[[^\]]*\])?\{[^{}]*\}/g, '').trim();
}

function hasUserContent(latex) {
  const stripped = cleanLatex(latex)
    .replace(/\\(?:log|ln|sin|cos|tan|sqrt|frac|left|right)\b/g, '')
    .replace(/[_^(){}]/g, '')
    .trim();
  return stripped.length > 0;
}

const HEAD_RE = /^(\\(?:log|sin|cos|tan|ln))([_^])(?:\{(\\placeholder\{\}|[^{}\\]*)\}|([^\\{}\s]))(\\left\((.*)\\right\))$/;

const TOKEN = '(\\d+(?:\\.\\d+)?|(?<![A-Za-z])[A-Za-z]|\\([^()]{1,40}\\))';
const stripParens = s => (/^\(.*\)$/.test(s) ? s.slice(1, -1) : s);

const AUTO_RULES = [
  { re: /(?<![A-Za-z])log_?(\d+)\($/,           make: m => `\\log_{${m[1]}}\\left(#?\\right)` },
  { re: /(?<![A-Za-z])log_?([2-9]|1\d)$/,       make: m => `\\log_{${m[1]}}\\left(#?\\right)` },
  { re: /(?<![A-Za-z])log_?$/,                  make: () => '\\log_{#?}\\left(#?\\right)' },
  { re: /(?<![A-Za-z])ln_?\(?$/,                make: () => '\\ln\\left(#?\\right)' },
  { re: /(?<![A-Za-z])(sin|cos|tan)\(?$/,       make: m => `\\${m[1]}\\left(#?\\right)` },
  { re: /(?:(?<![A-Za-z])sqrt|√)\(?$/,          make: () => '\\sqrt{#?}' },
  { re: new RegExp(TOKEN + '\\/$'),             make: m => `\\frac{${stripParens(m[1])}}{#?}` },
  { re: new RegExp(TOKEN + '\\^$'),             make: m => `${m[1]}^{#?}` },
  { re: /(?<![A-Za-z])([A-Za-z])_$/,            make: m => `${m[1]}_{#?}` }
];

const TEXT_REPLACE = [
  [/<=$/, () => '≤'],
  [/>=$/, () => '≥'],
  [/!=$/, () => '≠'],
  [/~=$/, () => '≈'],
  [/\*$/, () => '·'],
  [/->$/, () => '→'],
  [/\+-$/, () => '±'],
  [/(?<![A-Za-z])pi([^A-Za-z0-9_])$/, m => 'π' + m[1]],
  [/(?<![A-Za-z])theta([^A-Za-z0-9_])$/, m => 'θ' + m[1]]
];

export const TOOLBAR_ITEMS = [
  { label: '∑ Formula', main: true, tooltip: 'Insert visual formula (Ctrl+M)' },
  { label: 'x²', latex: '#?^{2}', typed: '^2', tooltip: 'Square' },
  { label: 'xⁿ', latex: '#?^{#?}', typed: '^', tooltip: 'Exponent' },
  { label: 'a/b', latex: '\\frac{#?}{#?}', tooltip: 'Fraction' },
  { label: '√x', latex: '\\sqrt{#?}', tooltip: 'Square root' },
  { label: 'logₐ(x)', latex: '\\log_{#?}\\left(#?\\right)', tooltip: 'Logarithm with base' },
  { label: 'ln(x)', latex: '\\ln\\left(#?\\right)', tooltip: 'Natural logarithm' },
  { label: 'π', latex: '\\pi', tooltip: 'Pi' },
  { label: '≤', latex: '\\le', tooltip: 'Less than or equal' },
  { label: '≥', latex: '\\ge', tooltip: 'Greater than or equal' },
  { label: '≠', latex: '\\ne', tooltip: 'Not equal' },
  { label: '⌨', keyboard: true, tooltip: 'Virtual Math Keyboard' }
];

const inMath = e => !!(e.target && e.target.closest && e.target.closest('.math-inline'));
const isField = n => !!(n && n.nodeType === 1 && n.classList.contains('math-inline'));

export class MathTextEditor {
  constructor(wrap, { placeholder = '', small = false, compact = false, minHeight = null, initialValue = null, onEnter = null, onEnterSubmit = null, onChange = null } = {}) {
    this.wrap = wrap;
    this.onEnter = onEnter || onEnterSubmit;
    this.onChange = onChange;
    this.lastRange = null;
    this.activeField = null;

    const tb = document.createElement('div');
    tb.className = 'mte-toolbar';
    TOOLBAR_ITEMS.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mte-btn' + (t.main ? ' main' : '');
      b.textContent = t.label;
      if (t.tooltip) b.title = t.tooltip;
      b.addEventListener('mousedown', e => e.preventDefault()); // prevent losing selection in contenteditable
      b.addEventListener('click', () => this.onToolbar(t));
      tb.appendChild(b);
    });

    this.root = document.createElement('div');
    this.root.className = 'mte' + ((small || compact) ? ' small' : '');
    if (minHeight) this.root.style.minHeight = minHeight;
    this.root.contentEditable = 'true';
    this.root.spellcheck = false;
    this.root.dataset.placeholder = placeholder;

    wrap.innerHTML = '';
    wrap.appendChild(tb);
    wrap.appendChild(this.root);

    this.root.addEventListener('input', e => {
      if (!inMath(e)) {
        if (!this.autoformat()) {
          while (this.convertDollarPairs()) {}
        }
      }
      this.changed();
    });

    this.root.addEventListener('keydown', e => {
      if (!inMath(e)) this.onKeyDown(e);
    });

    this.root.addEventListener('paste', e => {
      if (!inMath(e)) this.onPaste(e);
    });

    const remember = () => {
      const sel = window.getSelection();
      if (sel.rangeCount && this.root.contains(sel.getRangeAt(0).startContainer)) {
        this.lastRange = sel.getRangeAt(0).cloneRange();
      }
    };
    ['keyup', 'mouseup'].forEach(ev => {
      this.root.addEventListener(ev, e => {
        if (!inMath(e)) remember();
      });
    });

    if (initialValue) {
      this.setValue(initialValue);
    } else {
      this.changed();
    }
  }

  // ---------------- Live math field management ----------------
  configureFieldInstance(mf) {
    if (!mf) return;
    try {
      mf.mathVirtualKeyboardPolicy = 'sandboxed';
      if (!mf._shortcutsConfigured && mf._mathfield) {
        mf._shortcutsConfigured = true;
        mf.inlineShortcuts = Object.assign({}, mf.inlineShortcuts, {
          log: '\\log_{#?}\\left(#?\\right)',
          ln: '\\ln\\left(#?\\right)',
          sin: '\\sin\\left(#?\\right)',
          cos: '\\cos\\left(#?\\right)',
          tan: '\\tan\\left(#?\\right)',
          sqrt: '\\sqrt{#?}'
        });
      }
    } catch (e) {}
  }

  makeField(latex, mode) {
    const normalized = (latex || '')
      .replace(/\\iff\b/g, '\\Longleftrightarrow')
      .replace(/\\implies\b/g, '\\Longrightarrow');
    const w = document.createElement('span');
    w.className = 'math-inline';
    w.contentEditable = 'false';
    w.dataset.mode = mode; // 'auto' (space exits) vs 'explicit' (space stays)
    if (normalized) w.dataset.init = normalized;

    const mf = document.createElement('math-field');
    mf.setAttribute('math-virtual-keyboard-policy', 'sandboxed');
    if (normalized) {
      mf.textContent = normalized;
    }
    w.appendChild(mf);
    this.wireField(w, mf);
    return w;
  }

  hydrate() {
    const applyHydration = () => {
      this.root.querySelectorAll('.math-inline[data-init]').forEach(w => {
        const mf = w.querySelector('math-field');
        const initLatex = w.dataset.init;
        if (!mf || !initLatex) return;
        try {
          this.configureFieldInstance(mf);
          mf.value = initLatex;
          if (typeof customElements !== 'undefined' && customElements.get('math-field')) {
            delete w.dataset.init;
          }
        } catch (e) {}
      });
    };
    applyHydration();
    if (typeof customElements !== 'undefined' && !customElements.get('math-field')) {
      customElements.whenDefined('math-field').then(() => applyHydration());
    }
  }

  wireField(w, mf) {
    this.configureFieldInstance(mf);

    mf.addEventListener('mount', () => {
      this.configureFieldInstance(mf);
    });

    mf.addEventListener('focus', () => {
      this.activeField = w;
      this.configureFieldInstance(mf);
    });

    mf.addEventListener('blur', () => {
      setTimeout(() => {
        const vkOpenForThis =
          window.mathVirtualKeyboard &&
          window.mathVirtualKeyboard.visible &&
          this.activeField === w;
        if (w.isConnected && document.activeElement !== mf && !vkOpenForThis && !hasUserContent(mf.value) && !w.dataset.init) {
          this.removeField(w, false);
        }
        this.changed();
      }, 0);
    });

    mf.addEventListener('input', () => {
      this.autoAdvance(mf, w);
      this.changed();
    });

    mf.addEventListener('move-out', e => {
      const d = e.detail && e.detail.direction;
      if (d === 'forward') this.exitField(w, 'after');
      else if (d === 'backward') this.exitField(w, 'before');
    });

    mf.addEventListener('keydown', e => this.onFieldKey(e, w, mf), { capture: true });
  }

  onFieldKey(e, w, mf) {
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (e.key === 'Enter' || e.key === 'Escape' || (e.ctrlKey && e.code === 'KeyM')) {
      stop();
      this.exitField(w, 'after');
      return;
    }

    if (e.key === 'Backspace') {
      if (!hasUserContent(mf.value)) {
        stop();
        this.removeField(w, true);
        return;
      }
      if (this.backspaceInLogBase(mf)) {
        stop();
        return;
      }
    }

    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      if (this.navigateHeadAndArg(mf, e.key)) {
        stop();
        return;
      }
    }

    if (e.key === '_' && (mf.value.includes('\\log_') || mf.value.includes('_{'))) {
      stop();
      return;
    }

    const trigNoExp = /^\\(sin|cos|tan|ln)\\left\((.*)\\right\)$/.exec(mf.value || '');
    if (e.key === '^' && trigNoExp && (trigNoExp[2] === '\\placeholder{}' || mf.position <= 2)) {
      stop();
      mf.value = `\\${trigNoExp[1]}^{\\placeholder{}}\\left(${trigNoExp[2]}\\right)`;
      mf._prevValue = mf.value;
      mf.position = 0;
      mf.executeCommand('moveToNextPlaceholder');
      this.changed();
      return;
    }

    if (e.key === '/' && /^\\frac\{[^{}]+\}\{\\placeholder\{\}\}$/.test(mf.value || '')) {
      stop();
      mf.executeCommand('moveToNextPlaceholder');
      return;
    }

    if (e.key === '(') {
      if (/\\left\(\\placeholder\{\}\\right\)$/.test(mf.value || '')) {
        stop();
        mf._sawParen = true;
        if (mf.position < mf.lastOffset - 2) {
          mf.executeCommand('moveToNextPlaceholder');
        }
        return;
      }
      const hm = HEAD_RE.exec(mf.value || '');
      if (hm) {
        const rawBase = hm[3] !== undefined ? hm[3] : hm[4];
        const baseLen = rawBase === '\\placeholder{}' ? 1 : rawBase.length;
        if (mf.position <= baseLen + 2) {
          stop();
          mf._sawParen = true;
          mf.position = baseLen + 3;
          return;
        }
      }
    }

    if (e.key === ')' && (mf.value || '').endsWith('\\right)') && mf.position >= mf.lastOffset - 1) {
      stop();
      if (mf.position < mf.lastOffset) {
        mf.executeCommand('moveToNextChar');
      }
      return;
    }

    if (e.key === ' ' && w.dataset.mode === 'auto') {
      stop();
      this.climbOut(mf);
      if (mf.value.includes('\\placeholder') && mf.position < mf.lastOffset) {
        mf.executeCommand('moveToNextPlaceholder');
        return;
      }
      if (mf.position >= mf.lastOffset) {
        this.exitField(w, 'after', ' ');
      }
      return;
    }

    if (e.key === '=' && this.climbOut(mf)) {
      stop();
      mf.insert('=');
      this.changed();
      return;
    }
  }

  /**
   * Auto-advance: once the base of log_b( ) or power of sin^n( ) is typed, cursor jumps to the argument.
   * Base "1" is invalid for a logarithm, so it waits for a second digit (log_10, log_12).
   * The user can still go back with ← to change the base/power and forward with → to the argument.
   */
  autoAdvance(mf, w) {
    const v = mf.value || '';
    const prev = mf._prevValue || '';
    mf._prevValue = v;

    if (w && w.dataset.mode === 'auto' && !mf._sawParen) {
      const eng =
        /^\\(sin)\\left\((g|ce)\\right\)$/.exec(v) ||
        /^\\(cos)\\left\((i|ts|ti)\\right\)$/.exec(v) ||
        /^\\(tan)\\left\((g|k)\\right\)$/.exec(v) ||
        /^\\(log)_a\\left\((ri)\\right\)$/.exec(v);
      if (eng) {
        const word = eng[1] === 'log' ? 'logari' : eng[1] + eng[2];
        this.unwrapToText(w, word);
        return;
      }
    }

    const cur = /^\\(?:log_|(?:sin|cos|tan|ln)\^)(?:\{([^{}\\]+)\}|([^\\{}\s]))\\left\(\\placeholder\{\}\\right\)$/.exec(v);
    if (!cur) return;
    const base = cur[1] !== undefined ? cur[1] : cur[2];
    if (base === '1' && v.startsWith('\\log_')) return;

    const wasWaiting =
      !prev ||
      /^\\(?:log_|(?:sin|cos|tan|ln)\^)(?:\{\\placeholder\{\}\}|\\placeholder\{\}|1|\{1\})\\left\(\\placeholder\{\}\\right\)$/.test(prev);
    if (!wasWaiting) return;

    setTimeout(() => {
      try {
        mf.executeCommand('moveToNextPlaceholder');
      } catch (e) {}
    }, 0);
  }

  /**
   * Direct ← / → navigation between log base (or trig power) and argument:
   * - Pressing ← at the start of the argument (or on an empty argument placeholder) jumps directly to the end of the base.
   * - Pressing → at the end of the base jumps directly to the start of the argument (or selects the argument placeholder).
   */
  navigateHeadAndArg(mf, key) {
    try {
      const hm = HEAD_RE.exec(mf.value || '');
      if (!hm) return false;
      const rawBase = hm[3] !== undefined ? hm[3] : hm[4];
      const arg = hm[6];
      const baseIsPh = rawBase === '\\placeholder{}';
      const argIsPh = arg === '\\placeholder{}';
      const baseLen = baseIsPh ? 1 : rawBase.length;
      const pos = mf.position;

      if (key === 'ArrowLeft') {
        if ((argIsPh && pos >= baseLen + 2) || pos === baseLen + 3 || pos === baseLen + 2) {
          if (baseIsPh) {
            mf.position = 0;
            mf.executeCommand('moveToNextPlaceholder');
          } else {
            mf.position = baseLen + 1;
          }
          return true;
        }
      } else if (key === 'ArrowRight') {
        if ((baseIsPh && pos >= 1 && pos <= 3) || pos === baseLen + 1 || pos === baseLen + 2) {
          if (argIsPh) {
            mf.position = baseLen + 2;
            mf.executeCommand('moveToNextPlaceholder');
          } else {
            mf.position = baseLen + 3;
          }
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Backspace inside the log base (or trig power) only edits the base/power.
   * By default MathLive removes the whole "log" when the last base character is deleted;
   * here an empty base becomes a placeholder.
   */
  backspaceInLogBase(mf) {
    try {
      const m = HEAD_RE.exec(mf.value || '');
      if (!m) return false;
      const rawBase = m[3] !== undefined ? m[3] : m[4];
      if (rawBase === '\\placeholder{}') {
        return mf.position >= 1 && mf.position <= 3;
      }
      const pos = mf.position;
      if (pos < 2 || pos > rawBase.length + 1) return false;
      const nb = rawBase.slice(0, pos - 2) + rawBase.slice(pos - 1);
      mf.value = nb ? `${m[1]}${m[2]}{${nb}}${m[5]}` : `${m[1]}${m[2]}{\\placeholder{}}${m[5]}`;
      mf._prevValue = mf.value;
      if (nb) {
        mf.position = pos - 1;
      } else {
        mf.position = 0;
        mf.executeCommand('moveToNextPlaceholder');
      }
      this.changed();
      return true;
    } catch (e) {
      return false;
    }
  }

  unwrapToText(w, word) {
    this.pad(w);
    const prev = w.previousSibling;
    w.remove();
    this.root.focus();
    if (prev && prev.nodeType === 3) {
      prev.data = prev.data.replace(/\u200B+$/, '') + word;
      const r = document.createRange();
      r.setStart(prev, prev.data.length);
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      this.lastRange = r.cloneRange();
    }
    this.changed();
  }

  climbOut(mf) {
    let moved = false;
    for (let i = 0; i < 6; i++) {
      const before = mf.position;
      mf.executeCommand('moveAfterParent');
      if (mf.position === before) break;
      moved = true;
    }
    return moved;
  }

  openField(w, latex) {
    const mf = w.querySelector('math-field');
    mf.focus();
    if (latex) {
      try {
        mf.insert(latex, { selectionMode: 'placeholder', focus: true });
      } catch (e) {
        mf.value = latex.replace(/#\?/g, '');
      }
    }
    this.activeField = w;
  }

  focusField(w, where) {
    const mf = w.querySelector('math-field');
    mf.focus();
    try {
      mf.position = where === 'start' ? 0 : mf.lastOffset;
    } catch (e) {}
  }

  pad(w) {
    if (!w.nextSibling || w.nextSibling.nodeType !== 3) w.after(document.createTextNode(ZW));
    if (!w.previousSibling || w.previousSibling.nodeType !== 3) w.before(document.createTextNode(ZW));
  }

  exitField(w, dir, insertText = '') {
    const mf = w.querySelector('math-field');
    if (!cleanLatex(mf.value)) {
      this.removeField(w, true);
      return;
    }
    this.pad(w);
    try {
      window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
    } catch (e) {}

    this.root.focus();
    const r = document.createRange();
    if (dir === 'before') {
      const t = w.previousSibling;
      r.setStart(t, t.data.length);
    } else {
      const t = w.nextSibling;
      let off = 0;
      while (off < t.data.length && t.data[off] === ZW) off++;
      if (insertText) {
        t.insertData(off, insertText);
        off += insertText.length;
      }
      r.setStart(t, off);
    }
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    this.lastRange = r.cloneRange();
    this.changed();
  }

  removeField(w, focusText) {
    const prev = w.previousSibling;
    w.remove();
    if (focusText) {
      this.root.focus();
      if (prev && prev.nodeType === 3) {
        const r = document.createRange();
        r.setStart(prev, prev.data.length);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    this.changed();
  }

  insertField(template, mode) {
    const range = this.getRange();
    range.deleteContents();
    const w = this.makeField('', mode);
    range.insertNode(w);
    this.pad(w);
    this.openField(w, template ? template.latex : '');
  }

  onToolbar(t) {
    const mfActive =
      this.activeField &&
      this.activeField.isConnected &&
      document.activeElement === this.activeField.querySelector('math-field');

    if (t.keyboard) {
      const vk = window.mathVirtualKeyboard;
      if (vk && vk.visible) {
        vk.hide();
        return;
      }
      if (!mfActive) {
        if (this.activeField && this.activeField.isConnected) {
          const existingMf = this.activeField.querySelector('math-field');
          if (existingMf) existingMf.focus();
        } else {
          this.insertField(null, 'explicit');
        }
      }
      setTimeout(() => {
        try {
          const activeMf = this.activeField && this.activeField.querySelector('math-field');
          if (activeMf) {
            this.configureFieldInstance(activeMf);
            activeMf.focus();
          }
          window.mathVirtualKeyboard.show();
        } catch (e) {}
      }, 50);
      return;
    }

    if (mfActive) {
      if (!t.latex) return;
      const mf = this.activeField.querySelector('math-field');
      if (t.typed && mf.executeCommand(['typedText', t.typed])) {
        mf.focus();
        return;
      }
      mf.insert(t.latex, { selectionMode: 'placeholder', focus: true });
      return;
    }

    this.insertField(t.latex ? t : null, 'explicit');
  }

  // ---------------- Text side ----------------
  getRange() {
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const live = sel.getRangeAt(0);
      if (this.root.contains(live.startContainer)) return live.cloneRange();
    }
    if (this.lastRange && this.root.contains(this.lastRange.startContainer)) return this.lastRange;
    const r = document.createRange();
    r.selectNodeContents(this.root);
    r.collapse(false);
    return r;
  }

  autoformat() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    const n = r.startContainer;
    if (n.nodeType !== 3 || !this.root.contains(n)) return false;
    const o = r.startOffset;
    const before = n.data.slice(0, o);

    for (const [pat, fn] of TEXT_REPLACE) {
      const m = pat.exec(before);
      if (m) {
        const ch = fn(m);
        n.data = before.slice(0, m.index) + ch + n.data.slice(o);
        const rr = document.createRange();
        rr.setStart(n, m.index + ch.length);
        rr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(rr);
        return true;
      }
    }

    for (const rule of AUTO_RULES) {
      const m = rule.re.exec(before);
      if (!m) continue;
      n.splitText(o);
      n.data = before.slice(0, m.index);
      const w = this.makeField('', 'auto');
      n.after(w);
      this.pad(w);
      this.openField(w, rule.make(m));
      return true;
    }
    return false;
  }

  onKeyDown(e) {
    if (e.ctrlKey && e.code === 'KeyM') {
      e.preventDefault();
      this.insertField(null, 'explicit');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.onEnter && !e.shiftKey) {
        this.onEnter();
        return;
      }
      document.execCommand('insertLineBreak');
      return;
    }

    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const { startContainer: n, startOffset: o } = sel.getRangeAt(0);
    if (n.nodeType !== 3) return;
    const afterTxt = n.data.slice(o).replace(/\u200B/g, '');
    const beforeTxt = n.data.slice(0, o).replace(/\u200B/g, '');

    if ((e.key === 'ArrowRight' || e.key === 'Delete') && !afterTxt && isField(n.nextSibling)) {
      e.preventDefault();
      this.focusField(n.nextSibling, 'start');
    } else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !beforeTxt && isField(n.previousSibling)) {
      e.preventDefault();
      this.focusField(n.previousSibling, 'end');
    }
  }

  onPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const range = this.getRange();
    range.deleteContents();
    const frag = this.buildFragment(text);
    const lastNode = frag.lastChild;
    range.insertNode(frag);
    this.hydrate();
    if (lastNode) {
      const r = document.createRange();
      r.setStartAfter(lastNode);
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    this.changed();
  }

  convertDollarPairs() {
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
      acceptNode: n =>
        n.parentElement && n.parentElement.closest('.math-inline')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT
    });
    const re = new RegExp(DOLLAR_RE.source);
    let node;
    while ((node = walker.nextNode())) {
      const m = re.exec(node.data);
      if (m) {
        const mid = node.splitText(m.index);
        mid.splitText(m[0].length);
        const w = this.makeField(m[1].trim(), 'explicit');
        mid.replaceWith(w);
        this.pad(w);
        this.hydrate();
        this.exitField(w, 'after');
        return true;
      }
    }
    return false;
  }

  // ---------------- Serialization: text with $LaTeX$ ----------------
  buildFragment(rawText) {
    // Normalize \( ... \) and \[ ... \] and clean raw markdown headers/bold markers for WYSIWYG display
    let text = String(rawText || '')
      .replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$')
      .replace(/\\\[([\s\S]+?)\\\]/g, '$$$1$$')
      .replace(/^#{1,4}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1');
    if (!text.includes('$')) {
      text = text.replace(/\(([^()$\n]*\\(?:log|ln|iff|Longleftrightarrow|implies|frac|sqrt|le|ge|ne)[^()$\n]*)\)/g, '($$$1$$)');
    }

    const frag = document.createDocumentFragment();
    let last = 0,
      m;
    DOLLAR_RE.lastIndex = 0;
    while ((m = DOLLAR_RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(document.createTextNode(ZW));
      frag.appendChild(this.makeField(m[1].trim(), 'explicit'));
      frag.appendChild(document.createTextNode(ZW));
      last = DOLLAR_RE.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  setValue(text) {
    this.activeField = null;
    try {
      if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
        window.mathVirtualKeyboard.hide();
      }
    } catch (e) {}
    this.root.innerHTML = '';
    this.root.appendChild(this.buildFragment(text || ''));
    this.hydrate();
    this.changed();
  }

  getValue() {
    let out = '';
    const walk = node => {
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) {
          out += ch.data.replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
        } else if (isField(ch)) {
          const mf = ch.querySelector('math-field');
          const latex = ch.dataset.init || (mf ? cleanLatex(mf.value) : '');
          if (latex) out += (out.endsWith('$') ? ' ' : '') + '$' + latex + '$';
        } else if (ch.tagName === 'BR') {
          out += '\n';
        } else if (ch.tagName === 'DIV' || ch.tagName === 'P') {
          if (out && !out.endsWith('\n')) out += '\n';
          walk(ch);
        } else {
          walk(ch);
        }
      });
    };
    walk(this.root);
    return out.replace(/\s+$/, '');
  }

  clear() {
    this.activeField = null;
    try {
      if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
        window.mathVirtualKeyboard.hide();
      }
    } catch (e) {}
    this.root.innerHTML = '';
    this.changed();
  }

  changed() {
    const v = this.getValue();
    this.root.dataset.empty = !v && !this.root.querySelector('.math-inline') ? 'true' : 'false';
    if (this.onChange) this.onChange(v);
  }
}

function setupGlobalVirtualKeyboard() {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
  customElements.whenDefined('math-field').then(() => {
    try {
      if (window.MathfieldElement) window.MathfieldElement.soundsDirectory = null;
    } catch (e) {}

    // Ensure MathLive uses the in-frame sandboxed virtual keyboard (even inside Google Classroom iframes)
    try {
      const probe = document.createElement('math-field');
      probe.setAttribute('math-virtual-keyboard-policy', 'sandboxed');
      probe.style.display = 'none';
      document.body.appendChild(probe);
      probe.mathVirtualKeyboardPolicy = 'sandboxed';
      probe.remove();
    } catch (e) {}

    // Configure any standalone <math-field> elements on the page
    document.querySelectorAll('math-field').forEach(mf => {
      try {
        mf.mathVirtualKeyboardPolicy = 'sandboxed';
        mf.inlineShortcuts = Object.assign({}, mf.inlineShortcuts, {
          log: '\\log_{#?}\\left(#?\\right)',
          ln: '\\ln\\left(#?\\right)',
          sin: '\\sin\\left(#?\\right)',
          cos: '\\cos\\left(#?\\right)',
          tan: '\\tan\\left(#?\\right)',
          sqrt: '\\sqrt{#?}'
        });
      } catch (e) {}
    });

    const vk = window.mathVirtualKeyboard;
    if (vk && !vk._layoutListenerBound) {
      vk._layoutListenerBound = true;
      const ensureAboveKeyboard = () => {
        if (!vk.visible) return;
        const h = (vk.boundingRect && vk.boundingRect.height) || 310;
        const el = document.activeElement;
        if (el && el !== document.body) {
          const rect = el.getBoundingClientRect();
          const limit = window.innerHeight - h - 24;
          if (rect.bottom > limit) {
            window.scrollBy(0, rect.bottom - limit);
          }
        }
      };
      const syncLayout = () => {
        const visible = !!vk.visible;
        const h = (visible && vk.boundingRect && vk.boundingRect.height) || (visible ? 310 : 0);
        const chatWrap = document.querySelector('.chat-wrapper');
        if (chatWrap) {
          chatWrap.style.height = visible ? `calc(100vh - ${h}px)` : '';
          const msgs = document.getElementById('chatMessages');
          if (msgs && visible) msgs.scrollTop = msgs.scrollHeight;
        } else {
          document.body.style.paddingBottom = visible ? `${h + 60}px` : '';
          if (visible) {
            ensureAboveKeyboard();
            setTimeout(ensureAboveKeyboard, 320);
          }
        }
      };
      vk.addEventListener('geometrychange', syncLayout);
      vk.addEventListener('virtual-keyboard-toggle', syncLayout);
    }
  });
}

setupGlobalVirtualKeyboard();
