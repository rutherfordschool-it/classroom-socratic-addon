import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bridgeScript = path.join(__dirname, 'gemini_runner.py');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// HTTP statuses that mean "this model is unavailable for you right now" (retired / quota / overloaded)
const MODEL_UNAVAILABLE_STATUSES = new Set([404, 429, 500, 503]);

export class GeminiBridge {
  static async generateContent({ systemPrompt = '', messages = [], model = config.models.geminiFast }) {
    const hasMultimodalAttachments = messages.some(m => Array.isArray(m.attachments) && m.attachments.length > 0);

    // In Cloud Run / production, or with multimodal image attachments, call the REST API directly
    if (config.isCloudRun || config.nodeEnv === 'production' || hasMultimodalAttachments) {
      return GeminiBridge._fetchDirect({ systemPrompt, messages, model });
    }

    // Local dev with the optional Python proxy runner; falls back to the REST API on any failure
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ systemPrompt, messages, model });
      const py = spawn('python', [bridgeScript]);

      let stdout = '';
      let stderr = '';
      py.stdout.on('data', (d) => { stdout += d.toString(); });
      py.stderr.on('data', (d) => { stderr += d.toString(); });

      py.on('error', async (err) => {
        try {
          resolve(await GeminiBridge._fetchDirect({ systemPrompt, messages, model }));
        } catch (e) {
          reject(new Error(`Python bridge unavailable (${err.message}); REST fallback: ${e.message}`));
        }
      });

      py.on('close', async (code) => {
        if (code !== 0) {
          console.warn(`[GeminiBridge] Python bridge failed (code ${code}), trying direct fetch fallback...`);
          try {
            return resolve(await GeminiBridge._fetchDirect({ systemPrompt, messages, model }));
          } catch (e) {
            return reject(new Error(`Python bridge error: ${stderr || stdout}; Fallback: ${e.message}`));
          }
        }
        try {
          const res = JSON.parse(stdout.trim());
          if (res.error) return reject(new Error(res.error));
          resolve(res.text);
        } catch (e) {
          reject(new Error(`Failed to parse python bridge output: ${stdout}`));
        }
      });

      py.stdin.write(payload);
      py.stdin.end();
    });
  }

  static _buildPayload({ systemPrompt, messages }) {
    const contents = messages.map(m => {
      const parts = [];
      if (m.content) {
        parts.push({ text: m.content });
      }
      if (Array.isArray(m.attachments)) {
        for (const att of m.attachments) {
          if (att && att.data) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType || 'image/jpeg',
                data: att.data.replace(/^data:[^;]+;base64,/, '')
              }
            });
          }
        }
      }
      if (parts.length === 0) {
        parts.push({ text: '' });
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });

    const payload = { contents };
    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    return payload;
  }

  /**
   * Resolves a requested model name to a real Gemini model id (never silently downgrades to a retired model).
   */
  static resolveModel(model = '') {
    const m = String(model || '').trim();
    if (!m) return config.models.geminiFast;
    if (/pro/i.test(m)) return config.models.geminiPro;
    if (/flash|lite/i.test(m)) return config.models.geminiFast;
    return m.startsWith('gemini-') ? m : config.models.geminiFast;
  }

  static async _fetchDirect({ systemPrompt, messages, model }) {
    if (!config.hasGeminiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    const payload = GeminiBridge._buildPayload({ systemPrompt, messages });
    const primary = GeminiBridge.resolveModel(model);
    const candidates = primary === config.models.geminiFast ? [primary] : [primary, config.models.geminiFast];

    let lastError = null;
    for (const apiModel of candidates) {
      const res = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(apiModel)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Header (not ?key=) so the API key never appears in URLs, proxies or access logs
          'x-goog-api-key': config.geminiApiKey
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      const errText = await res.text();
      lastError = new Error(`Gemini API error ${res.status} (${apiModel}): ${errText.slice(0, 300)}`);
      if (!MODEL_UNAVAILABLE_STATUSES.has(res.status)) break;
      console.warn(`[GeminiBridge] ${apiModel} unavailable (${res.status}); trying fallback model if any`);
    }
    throw lastError;
  }
}
