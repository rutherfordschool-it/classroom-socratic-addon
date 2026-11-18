import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bridgeScript = path.join(__dirname, 'gemini_runner.py');

const DEFAULT_KEY = process.env.GEMINI_API_KEY || "";

export class GeminiBridge {
  static async generateContent({ systemPrompt = '', messages = [], model = 'gemini-3.1-flash-lite' }) {
    const isCloud = !!(process.env.K_SERVICE || process.env.NODE_ENV === 'production');
    const apiKey = process.env.GEMINI_API_KEY || DEFAULT_KEY;
    const hasMultimodalAttachments = messages.some(m => Array.isArray(m.attachments) && m.attachments.length > 0);

    // When running in Google Cloud Run, production, or with multimodal image attachments, use native fetch directly
    if (isCloud || hasMultimodalAttachments) {
      try {
        return await GeminiBridge._fetchDirect({ systemPrompt, messages, model, apiKey });
      } catch (err) {
        console.warn('[GeminiBridge] Direct fetch error:', err.message);
        throw err;
      }
    }

    // In local dev environment with local proxy, attempt python runner first
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ systemPrompt, messages, model });
      const py = spawn('python', [bridgeScript]);

      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (d) => { stdout += d.toString(); });
      py.stderr.on('data', (d) => { stderr += d.toString(); });

      py.on('close', async (code) => {
        if (code !== 0) {
          console.warn(`[GeminiBridge] Python bridge failed (code ${code}), trying direct fetch fallback...`);
          try {
            const fallbackText = await GeminiBridge._fetchDirect({ systemPrompt, messages, model, apiKey });
            return resolve(fallbackText);
          } catch (e) {
            return reject(new Error(`Python bridge error: ${stderr || stdout}; Fallback: ${e.message}`));
          }
        }
        try {
          const res = JSON.parse(stdout.trim());
          if (res.error) {
            return reject(new Error(res.error));
          }
          resolve(res.text);
        } catch (e) {
          reject(new Error(`Failed to parse python bridge output: ${stdout}`));
        }
      });

      py.stdin.write(payload);
      py.stdin.end();
    });
  }

  static async _fetchDirect({ systemPrompt, messages, model, apiKey }) {
    const contents = messages.map(m => {
      const parts = [];
      if (m.content) {
        parts.push({ text: m.content });
      }
      if (Array.isArray(m.attachments)) {
        for (const att of m.attachments) {
          if (att && att.data) {
            const cleanBase64 = att.data.replace(/^data:[^;]+;base64,/, '');
            parts.push({
              inlineData: {
                mimeType: att.mimeType || 'image/jpeg',
                data: cleanBase64
              }
            });
          }
        }
      }
      if (parts.length === 0) {
        parts.push({ text: '' });
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

    const payload = { contents };
    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    // Map model names to supported Gemini API endpoints
    let apiModel = 'gemini-2.0-flash';
    if (model.includes('pro')) {
      apiModel = 'gemini-1.5-pro';
    } else if (model.includes('flash')) {
      apiModel = 'gemini-2.0-flash';
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini direct API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

