import dotenv from 'dotenv';
dotenv.config();

const port = process.env.PORT || 3000;
const isCloudRun = Boolean(process.env.K_SERVICE);

// Keys that are accidentally pasted together with other KEY=VALUE pairs would silently break every API call.
// Keep only the first whitespace-delimited token so a malformed variable fails loudly in the logs instead.
function cleanKey(value) {
  const raw = String(value || '').trim();
  if (/\s/.test(raw)) {
    console.warn('[Config] An API key environment variable contains whitespace; using only its first token. Please fix the variable.');
  }
  return raw.split(/\s+/)[0] || '';
}

const geminiApiKey = cleanKey(process.env.GEMINI_API_KEY);
const anthropicApiKey = cleanKey(process.env.ANTHROPIC_API_KEY);
const openaiApiKey = cleanKey(process.env.OPENAI_API_KEY);

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  isCloudRun,
  // Public origin of this service (used in links we hand to Google Classroom)
  baseUrl: (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),

  // Classroom Add-on specific credentials
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  classroomProjectNumber: process.env.GOOGLE_CLASSROOM_ADDON_PROJECT_NUMBER || '',

  // LLM Providers
  geminiApiKey,
  anthropicApiKey,
  openaiApiKey,

  defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'gemini',

  // Model identifiers (override with environment variables when Google/Anthropic/OpenAI retire a model)
  models: {
    geminiFast: process.env.GEMINI_MODEL_FAST || 'gemini-3.1-flash-lite',
    geminiPro: process.env.GEMINI_MODEL_PRO || 'gemini-3.1-pro-preview',
    claudeSonnet: process.env.CLAUDE_MODEL_SONNET || 'claude-3-5-sonnet-20241022',
    claudeHaiku: process.env.CLAUDE_MODEL_HAIKU || 'claude-3-5-haiku-20241022',
    openaiFlagship: process.env.OPENAI_MODEL_FLAGSHIP || 'gpt-4o',
    openaiMini: process.env.OPENAI_MODEL_MINI || 'gpt-4o-mini'
  },

  // Persistence: Google Drive on Cloud Run (or when STORAGE_BACKEND=drive), local JSON file otherwise
  storageBackend: (process.env.STORAGE_BACKEND || (isCloudRun ? 'drive' : 'file')).toLowerCase(),
  driveFolderName: process.env.DRIVE_FOLDER_NAME || 'SocratesAI Data',
  driveFolderId: process.env.DRIVE_FOLDER_ID || '',
  driveServiceAccount: process.env.DRIVE_SERVICE_ACCOUNT || '',
  driveShareWith: (process.env.DRIVE_SHARE_WITH || 'it@rutherfordschool.ca')
    .split(',').map(s => s.trim()).filter(Boolean),

  // Status flags
  hasGeminiKey: Boolean(geminiApiKey && geminiApiKey !== 'your-gemini-api-key-here'),
  hasAnthropicKey: Boolean(anthropicApiKey && anthropicApiKey !== 'your-anthropic-api-key-here'),
  hasOpenaiKey: Boolean(openaiApiKey && openaiApiKey !== 'your-openai-api-key-here'),

  get isAnyLLMConfigured() {
    return this.hasGeminiKey || this.hasAnthropicKey || this.hasOpenaiKey;
  }
};
