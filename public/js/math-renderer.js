/**
 * Math and LaTeX Renderer with KaTeX & Natural Math support.
 * Supports both standard LaTeX ($...$, $$...$$) and Natural Math (e.g. log3(36), (x^2-9)/(x-3), sqrt(x), x^2, >=, <=)
 */

export const MathRenderer = {
  /**
   * Converts raw LaTeX text (with $, backslashes, \frac, etc.) into clean natural math
   * suitable for editing in teacher textareas and inputs without unsightly dollar signs or code syntax.
   */
  latexToNatural(text) {
    if (!text) return '';
    let s = String(text);

    // 1. Remove outer or inline dollar signs: $$...$$ and $...$
    s = s.replace(/\${1,2}(.*?)\${1,2}/g, '$1');
    s = s.replace(/\$/g, '');

    // 2. Parentheses / sizing wrappers: \left(, \right), etc.
    s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
    s = s.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
    s = s.replace(/\\left\{/g, '{').replace(/\\right\}/g, '}');
    s = s.replace(/\\left[.|]/g, '').replace(/\\right[.|]/g, '');

    // 3. Fractions: \frac{a}{b} -> (a)/(b)
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)'); // handles nested

    // 4. Square roots: \sqrt{x} -> sqrt(x)
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
    s = s.replace(/\\sqrt\[([^{}]+)\]\{([^{}]+)\}/g, 'root($1, $2)');

    // 5. Logarithms: \log_{b}(x) -> log_b(x), \log_b(x) -> log_b(x)
    s = s.replace(/\\log_\{([^{}]+)\}\(([^()]+)\)/g, 'log_$1($2)');
    s = s.replace(/\\log_(\w+)\(([^()]+)\)/g, 'log_$1($2)');
    s = s.replace(/\\log_\{([^{}]+)\}/g, 'log_$1');
    s = s.replace(/\\log_(\w+)/g, 'log_$1');
    s = s.replace(/\\log\b/g, 'log');
    s = s.replace(/\\ln\b/g, 'ln');

    // 6. Trigonometric functions
    s = s.replace(/\\(sin|cos|tan|sec|csc|cot)\b/g, '$1');

    // 7. Operators: \ge, \le, \ne, \cdot, \times, \pm
    s = s.replace(/\\ge\b/g, '>=');
    s = s.replace(/\\le\b/g, '<=');
    s = s.replace(/\\ne\b/g, '!=');
    s = s.replace(/\\cdot\b/g, '*');
    s = s.replace(/\\times\b/g, '*');
    s = s.replace(/\\pm\b/g, '+/-');

    // 8. Greek letters: \pi -> pi, \theta -> theta
    s = s.replace(/\\pi\b/g, 'pi');
    s = s.replace(/\\theta\b/g, 'theta');

    // 9. Clean single braces around simple terms: ^{2} -> ^2, _{a} -> _a
    s = s.replace(/\^\{([a-zA-Z0-9]+)\}/g, '^$1');
    s = s.replace(/_\{([a-zA-Z0-9]+)\}/g, '_$1');

    // 10. Clean up any remaining leading backslashes on words
    s = s.replace(/\\([a-zA-Z]+)/g, '$1');

    return s.trim();
  },

  /**
   * Converts informal/natural math notation into KaTeX-compatible LaTeX expressions
   * without requiring users or teachers to manually type $ or \.
   * Carefully preserves regular English text font and spaces so sentences are never mangled.
   */
  normalizeNaturalMath(text) {
    if (!text) return '';

    // If text already has complete $...$ or $$...$$ wrappers, return as-is
    if (/\$([^\$]+)\$/.test(text)) {
      return text;
    }

    let converted = text;

    // 1. Comparison & arithmetic operators
    converted = converted.replace(/>=/g, ' \\ge ');
    converted = converted.replace(/<=/g, ' \\le ');
    converted = converted.replace(/!=/g, ' \\ne ');
    converted = converted.replace(/(?<=[a-zA-Z0-9\)])\s*\*\s*(?=[a-zA-Z0-9\(])/g, ' \\cdot ');

    // 2. Square roots: sqrt(x) or sqrt(x + 1)
    converted = converted.replace(/\bsqrt\s*\(([^()]+)\)/gi, '\\sqrt{$1}');

    // 3. Logarithms: log_3(x), log3(x), log(x), ln(x)
    converted = converted.replace(/\blog_(\w+)\s*\(([^()]+)\)/gi, '\\log_{$1}($2)');
    converted = converted.replace(/\blog(\d+)\s*\(([^()]+)\)/gi, '\\log_{$1}($2)');
    converted = converted.replace(/\blog\s*\(([^()]+)\)/gi, '\\log($1)');
    converted = converted.replace(/\bln\s*\(([^()]+)\)/gi, '\\ln($1)');

    // 4. Trigonometric functions: sin(x), cos(x), tan(x)
    converted = converted.replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(([^()]+)\)/gi, '\\$1($2)');

    // 5. Fractions: (a)/(b)
    converted = converted.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}');

    // 6. Greek letters
    converted = converted.replace(/\bpi\b/gi, '\\pi');
    converted = converted.replace(/\btheta\b/gi, '\\theta');

    // Check if text is a conversational sentence with common words
    const isSentence = /\b(the|is|into|what|solve|simplify|evaluate|express|take|look|at|for|where|rule|term|value|and|or|in|to|if|factor|determine|check|how|can|we|you)\b/i.test(converted);

    if (!isSentence) {
      // Pure formula or isolated equation: wrap entire expression in $
      return `$${converted.trim()}$`;
    }

    // In a conversational sentence: ONLY wrap the mathematical expressions!
    // Never wrap English words in $ so KaTeX does not remove spaces or alter text font.

    // Wrap multi-token math expressions (e.g. 2 \log_{3}(6) - \log_{3}(4) or x^3 - 4x^2 + x + 6)
    converted = converted.replace(/(?:(?<=\s|^|\()(?:\d+\s*)?(?:\\(?:log|sqrt|frac|sin|cos|tan|ln)|[a-zA-Z0-9_]+(?:\^[0-9a-zA-Z]+)?|\([0-9a-zA-Z_\^+\-*\/]+\))(?:\s*[-+*\/=><]\s*(?:(?:\d+\s*)?(?:\\(?:log|sqrt|frac|sin|cos|tan|ln)|[a-zA-Z0-9_]+(?:\^[0-9a-zA-Z]+)?|\([0-9a-zA-Z_\^+\-*\/]+\))))+)/g, (match) => {
      if (/\\|[\^_\=\+\-\*\/]/.test(match) && !/\b(the|is|what|into|rule)\b/i.test(match)) {
        return `$${match.trim()}$`;
      }
      return match;
    });

    // Wrap isolated single math functions or powers: \log_{2}(8) or 2\log_{3}(6) or x^3
    converted = converted.replace(/(?<![\$\w])((?:\d+\s*)?\\(?:log|sqrt|frac|sin|cos|tan|ln)\w*(?:\{[^{}]+\})*\([^()]+\))(?![\$\w])/g, '$$$1$$');
    converted = converted.replace(/(?<![\$\w])([a-zA-Z]\^[0-9a-zA-Z]+)(?![\$\w])/g, '$$$1$$');
    converted = converted.replace(/(?<![\$\w])(\([a-zA-Z]\s*[-+]\s*[0-9a-zA-Z]+\))(?![\$\w])/g, '$$$1$$');

    return converted;
  },

  /**
   * Renders math and markdown into clean HTML with KaTeX
   */
  render(text) {
    if (!text) return '';

    // First normalize natural math if needed
    let processed = this.normalizeNaturalMath(text);

    // If KaTeX is loaded in the window
    if (typeof window.katex !== 'undefined') {
      try {
        // Render display math $$...$$
        processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
          try {
            return window.katex.renderToString(formula.trim(), {
              displayMode: true,
              throwOnError: false
            });
          } catch (e) {
            return `<div class="katex-error">${formula}</div>`;
          }
        });

        // Render inline math $...$
        processed = processed.replace(/\$([^\$\n\r]+?)\$/g, (match, formula) => {
          try {
            return window.katex.renderToString(formula.trim(), {
              displayMode: false,
              throwOnError: false
            });
          } catch (e) {
            return `<span class="katex-error">${formula}</span>`;
          }
        });

        // Basic markdown formatting (bold, italics, code, linebreaks)
        processed = processed
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\n\n/g, '<p></p>')
          .replace(/\n/g, '<br/>');

        return processed;
      } catch (err) {
        console.warn('Math rendering fallback:', err);
      }
    }

    // Fallback: format plain text with basic tags
    return processed
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  },

  /**
   * Renders a live preview HTML for input fields with natural math support
   */
  renderPreview(rawText, placeholder = '<em>Live formula preview will appear here...</em>') {
    if (!rawText || !rawText.trim()) return placeholder;
    return this.render(rawText);
  },

  /**
   * Attaches an interactive math toolbar above an input or textarea
   */
  attachMathToolbar(inputEl, containerEl) {
    if (!inputEl || !containerEl) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'math-quick-toolbar';
    toolbar.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      font-size: 0.8rem;
    `;

    const label = document.createElement('span');
    label.style.cssText = 'color: #94a3b8; font-size: 0.72rem; font-weight: 600; margin-right: 4px; text-transform: uppercase;';
    label.innerText = 'Math Tools:';
    toolbar.appendChild(label);

    const buttons = [
      { label: 'x²', insert: '^2', tooltip: 'Square power' },
      { label: 'xⁿ', insert: '^(n)', tooltip: 'Power' },
      { label: 'a/b', insert: '(a)/(b)', tooltip: 'Fraction' },
      { label: '√x', insert: 'sqrt(x)', tooltip: 'Square root' },
      { label: 'logₐ(x)', insert: 'log3(x)', tooltip: 'Logarithm with base' },
      { label: 'ln(x)', insert: 'ln(x)', tooltip: 'Natural logarithm' },
      { label: 'π', insert: 'pi', tooltip: 'Pi' },
      { label: 'θ', insert: 'theta', tooltip: 'Theta' },
      { label: '≤', insert: '<=', tooltip: 'Less than or equal' },
      { label: '≥', insert: '>=', tooltip: 'Greater than or equal' },
      { label: '≠', insert: '!=', tooltip: 'Not equal' }
    ];

    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-math-chip';
      btn.title = b.tooltip;
      btn.style.cssText = `
        background: rgba(99, 102, 241, 0.12);
        color: #c7d2fe;
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 4px;
        padding: 3px 8px;
        font-size: 0.76rem;
        cursor: pointer;
        font-family: inherit;
        font-weight: 600;
        transition: all 0.15s ease;
      `;
      btn.innerText = b.label;

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(99, 102, 241, 0.25)';
        btn.style.color = '#ffffff';
        btn.style.borderColor = '#818cf8';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(99, 102, 241, 0.12)';
        btn.style.color = '#c7d2fe';
        btn.style.borderColor = 'rgba(99, 102, 241, 0.3)';
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const start = inputEl.selectionStart || 0;
        const end = inputEl.selectionEnd || 0;
        const val = inputEl.value || '';
        const selected = val.substring(start, end);

        let toInsert = b.insert;
        if (selected && b.insert.includes('x')) {
          toInsert = b.insert.replace('x', selected);
        } else if (selected && b.insert.includes('(a)/(b)')) {
          toInsert = `(${selected})/(b)`;
        }

        inputEl.value = val.substring(0, start) + toInsert + val.substring(end);
        inputEl.selectionStart = inputEl.selectionEnd = start + toInsert.length;
        inputEl.focus();

        // Dispatch input event so live preview automatically refreshes
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      });

      toolbar.appendChild(btn);
    });

    containerEl.parentNode.insertBefore(toolbar, containerEl);
  },

  /**
   * Automatically wires an input element to a live preview container
   */
  attachLivePreview(inputEl, previewEl, placeholderText) {
    if (!inputEl || !previewEl) return;
    const update = () => {
      previewEl.innerHTML = this.renderPreview(inputEl.value, placeholderText);
    };
    inputEl.addEventListener('input', update);
    inputEl.addEventListener('change', update);
    update();
  }
};
