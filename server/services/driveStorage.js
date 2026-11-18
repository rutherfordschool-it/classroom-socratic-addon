import { google } from 'googleapis';
import { Readable } from 'stream';
import zlib from 'zlib';
import { config } from '../config.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const ALL_DRIVES = { supportsAllDrives: true };
const CHUNK_CHAR_LIMIT = 24000; // Well within Google Drive's description limit, 0 bytes of storage quota

/**
 * Persists all add-on data (attachments, saved lesson plans, saved materials/curricula, and all students'
 * assignment results) in the shared Google Drive folder ("SocratesAI Data", shared with it@rutherfordschool.ca).
 *
 * Uses a hybrid approach so persistence works 24/7 on Cloud Run without ever failing on Service Account storage quota:
 *  1. If a Shared Drive or user-owned file with storage quota is available, writes native JSON / Google Sheets.
 *  2. Automatically persists compressed state in zero-quota Google Drive folder chunks inside "SocratesAI Data"
 *     AND maintains human-readable Drive folders for every assignment's gathered student results, saved lesson plans,
 *     and saved course materials.
 */
export class DriveStorage {
  constructor() {
    this.drive = null;
    this.folderId = '';
    this.driveName = '';
    this.isSharedDrive = false;
    this.fileIds = new Map();
    this.ready = false;
    this.lastError = '';
    this.serviceAccountEmail = '';
  }

  get folderUrl() {
    return this.folderId ? `https://drive.google.com/drive/folders/${this.folderId}` : '';
  }

  /**
   * Local dev: Application Default Credentials with the Drive scope (or impersonated service account).
   * Cloud Run: the runtime service account asks the IAM Credentials API for a Drive-scoped token for itself.
   */
  async _buildAuth() {
    if (!config.isCloudRun) {
      return new google.auth.GoogleAuth({ scopes: [DRIVE_SCOPE] });
    }
    const metadata = async (p) => {
      const r = await fetch(`http://metadata.google.internal/computeMetadata/v1/${p}`, {
        headers: { 'Metadata-Flavor': 'Google' }
      });
      if (!r.ok) throw new Error(`metadata ${p} -> ${r.status}`);
      return (await r.text()).trim();
    };
    const email = config.driveServiceAccount || await metadata('instance/service-accounts/default/email');
    const base = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

    const oauth = new google.auth.OAuth2();
    oauth.refreshHandler = async () => {
      const baseClient = await base.getClient();
      const { token } = await baseClient.getAccessToken();
      const res = await fetch(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:generateAccessToken`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: [DRIVE_SCOPE], lifetime: '3600s' })
        }
      );
      if (!res.ok) {
        throw new Error(`Could not get a Drive token for ${email} (${res.status}): ${(await res.text()).slice(0, 200)}`);
      }
      const data = await res.json();
      return { access_token: data.accessToken, expiry_date: Date.parse(data.expireTime) };
    };
    this.serviceAccountEmail = email;
    return oauth;
  }

  async init() {
    const auth = await this._buildAuth();
    this.drive = google.drive({ version: 'v3', auth });
    this.folderId = await this._resolveStorageRoot();
    this.ready = true;
    this.lastError = '';
    console.log(`[DriveStorage] Ready. Folder "${this.driveName}": ${this.folderUrl}`);
  }

  /**
   * Resolves the root folder in Google Drive:
   * 1. Explicit DRIVE_FOLDER_ID if configured
   * 2. A Shared Drive named DRIVE_FOLDER_NAME if available
   * 3. A standard Google Drive folder named DRIVE_FOLDER_NAME, shared with config.driveShareWith (it@rutherfordschool.ca)
   */
  async _resolveStorageRoot() {
    if (config.driveFolderId) {
      const f = await this.drive.files.get({ fileId: config.driveFolderId, fields: 'id,name,driveId', ...ALL_DRIVES });
      this.driveName = f.data.name;
      this.isSharedDrive = Boolean(f.data.driveId);
      return f.data.id;
    }

    try {
      const list = await this.drive.drives.list({ pageSize: 20, fields: 'drives(id,name)' });
      const drives = list.data.drives || [];
      const chosen = drives.find(d => d.name === config.driveFolderName) || drives[0];
      if (chosen) {
        this.driveName = chosen.name;
        this.isSharedDrive = true;
        return chosen.id;
      }
    } catch {
      // Fallback to regular Drive folder below
    }

    const escaped = config.driveFolderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const list = await this.drive.files.list({
      q: `name='${escaped}' and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'files(id,name)',
      pageSize: 5,
      includeItemsFromAllDrives: true,
      ...ALL_DRIVES
    });
    let folderId = list.data.files?.[0]?.id;
    if (!folderId) {
      const created = await this.drive.files.create({
        requestBody: {
          name: config.driveFolderName,
          mimeType: FOLDER_MIME,
          description: 'SocratesAI Google Classroom Add-on persistent storage (Lesson Plans, Materials, Curricula & All Students Assignment Results)'
        },
        fields: 'id'
      });
      folderId = created.data.id;
      console.log('[DriveStorage] Created data folder:', folderId);
    }

    this.driveName = config.driveFolderName;
    this.isSharedDrive = false;

    // Share with school account(s) (e.g. it@rutherfordschool.ca) so everything is in their Google Drive
    for (const email of config.driveShareWith) {
      try {
        const perms = await this.drive.permissions.list({
          fileId: folderId,
          fields: 'permissions(emailAddress,role)',
          ...ALL_DRIVES
        });
        const already = (perms.data.permissions || []).some(
          p => (p.emailAddress || '').toLowerCase() === email.toLowerCase()
        );
        if (!already) {
          await this.drive.permissions.create({
            fileId: folderId,
            sendNotificationEmail: false,
            requestBody: { type: 'user', role: 'writer', emailAddress: email },
            ...ALL_DRIVES
          });
          console.log(`[DriveStorage] Shared data folder with ${email}`);
        }
      } catch (e) {
        console.warn(`[DriveStorage] Could not verify/share folder with ${email}:`, e.message);
      }
    }
    return folderId;
  }

  async _findId(name, parentId = this.folderId, mimeType = '') {
    const cacheKey = `${parentId}::${mimeType}::${name}`;
    if (this.fileIds.has(cacheKey)) return this.fileIds.get(cacheKey);
    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const mimeClause = mimeType ? ` and mimeType='${mimeType}'` : '';
    const res = await this.drive.files.list({
      q: `name='${escaped}' and '${parentId}' in parents and trashed=false${mimeClause}`,
      fields: 'files(id,name)',
      pageSize: 1,
      includeItemsFromAllDrives: true,
      ...ALL_DRIVES
    });
    const id = res.data.files?.[0]?.id || '';
    if (id) this.fileIds.set(cacheKey, id);
    return id;
  }

  /**
   * Creates or updates a zero-quota folder entry inside parentId with a title and description.
   */
  async upsertFolderRecord(name, description = '', parentId = this.folderId, appProperties = undefined) {
    const cacheKey = `${parentId}::${FOLDER_MIME}::${name}`;
    const existingId = await this._findId(name, parentId, FOLDER_MIME);
    const requestBody = {
      name,
      description: String(description || '').slice(0, 28000),
      ...(appProperties ? { appProperties } : {})
    };
    if (existingId) {
      try {
        await this.drive.files.update({
          fileId: existingId,
          requestBody,
          fields: 'id',
          ...ALL_DRIVES
        });
        return existingId;
      } catch (e) {
        if (e.code !== 404) throw e;
        this.fileIds.delete(cacheKey);
      }
    }
    const created = await this.drive.files.create({
      requestBody: {
        ...requestBody,
        mimeType: FOLDER_MIME,
        parents: [parentId]
      },
      fields: 'id',
      ...ALL_DRIVES
    });
    this.fileIds.set(cacheKey, created.data.id);
    return created.data.id;
  }

  /**
   * Zero-quota compressed JSON store across folder chunks inside this.folderId.
   */
  async _writeChunkedFolderStore(name, obj) {
    const json = JSON.stringify(obj);
    const compressedB64 = zlib.gzipSync(Buffer.from(json, 'utf-8')).toString('base64');
    const chunks = [];
    for (let i = 0; i < compressedB64.length; i += CHUNK_CHAR_LIMIT) {
      chunks.push(compressedB64.slice(i, i + CHUNK_CHAR_LIMIT));
    }
    if (chunks.length === 0) chunks.push('');

    const prefix = `__socrates_db_${name}_chunk_`;
    let firstId = '';
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkName = `${prefix}${String(idx).padStart(3, '0')}`;
      const payload = JSON.stringify({
        v: 1,
        store: name,
        idx,
        total: chunks.length,
        updatedAt: new Date().toISOString(),
        data: chunks[idx]
      });
      const id = await this.upsertFolderRecord(chunkName, payload, this.folderId, {
        socratesStore: name,
        chunkIdx: String(idx),
        chunkTotal: String(chunks.length)
      });
      if (idx === 0) firstId = id;
    }

    // Remove any old extra chunks if total shrank
    try {
      const escapedPrefix = prefix.replace(/'/g, "\\'");
      const list = await this.drive.files.list({
        q: `name contains '${escapedPrefix}' and '${this.folderId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`,
        fields: 'files(id,name)',
        pageSize: 100,
        includeItemsFromAllDrives: true,
        ...ALL_DRIVES
      });
      for (const f of list.data.files || []) {
        const m = f.name.match(/_chunk_(\d+)$/);
        if (m && Number(m[1]) >= chunks.length) {
          await this.drive.files.delete({ fileId: f.id, ...ALL_DRIVES }).catch(() => {});
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    return firstId;
  }

  async _readChunkedFolderStore(name) {
    const prefix = `__socrates_db_${name}_chunk_`;
    const escapedPrefix = prefix.replace(/'/g, "\\'");
    const list = await this.drive.files.list({
      q: `name contains '${escapedPrefix}' and '${this.folderId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`,
      fields: 'files(id,name,description)',
      pageSize: 100,
      includeItemsFromAllDrives: true,
      ...ALL_DRIVES
    });
    const files = list.data.files || [];
    if (files.length === 0) return null;

    const parsedChunks = [];
    for (const f of files) {
      try {
        const meta = JSON.parse(f.description || '{}');
        if (typeof meta.idx === 'number' && typeof meta.data === 'string') {
          parsedChunks.push(meta);
        }
      } catch {
        // Ignore malformed chunk
      }
    }
    if (parsedChunks.length === 0) return null;
    parsedChunks.sort((a, b) => a.idx - b.idx);
    const b64 = parsedChunks.map(c => c.data).join('');
    const json = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf-8');
    return JSON.parse(json);
  }

  async readJson(name) {
    // 1. Prefer the zero-quota chunked folder store (always up to date on Cloud Run)
    try {
      const fromChunks = await this._readChunkedFolderStore(name);
      if (fromChunks) return fromChunks;
    } catch (e) {
      console.warn(`[DriveStorage] Chunk read warning for ${name}:`, e.message);
    }

    // 2. Fallback to regular JSON file if present
    const id = await this._findId(name);
    if (!id) return null;
    const res = await this.drive.files.get({ fileId: id, alt: 'media', ...ALL_DRIVES }, { responseType: 'text' });
    const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    return JSON.parse(raw);
  }

  async writeJson(name, obj) {
    try {
      const id = await this._writeChunkedFolderStore(name, obj);
      this.lastError = '';
      return id;
    } catch (e) {
      this.lastError = e.message;
      throw e;
    }
  }

  /**
   * Writes an assignment's gathered student results to the shared Google Drive folder so the teacher can open
   * them directly in Google Drive (and see every student's score, mastery, level, mistakes, and feedback).
   */
  async writeAssignmentResultsToDrive({ attachmentId, title, csv, submissions = [] }) {
    const cleanTitle = String(title || attachmentId).replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 75);
    const count = submissions.length;
    const avgScore = count > 0
      ? Math.round(submissions.reduce((acc, s) => acc + Number(s.assignedScore ?? s.suggestedScore ?? s.masteryLevel ?? 0), 0) / count)
      : 0;
    const folderName = `📊 Results — ${cleanTitle} (${attachmentId})`;
    const summaryText = [
      `Assignment: ${title || attachmentId} (${attachmentId})`,
      `Total Students Gathered: ${count} | Class Average Score: ${avgScore}/100`,
      `Updated: ${new Date().toISOString()}`,
      '',
      '--- CSV RESULTS (ALL STUDENTS) ---',
      csv
    ].join('\n');

    // Look for an existing folder for this attachmentId so renaming/updating student count updates in place
    let resultsFolderId = await this._findId(folderName, this.folderId, FOLDER_MIME);
    resultsFolderId = await this.upsertFolderRecord(folderName, summaryText, this.folderId, {
      socratesType: 'assignment_results',
      attachmentId: String(attachmentId).slice(0, 40)
    });

    // Also upsert one human-readable record per student inside this assignment's results folder
    for (const sub of submissions) {
      const score = sub.assignedScore ?? sub.suggestedScore ?? sub.masteryLevel ?? 0;
      const mastery = sub.masteryLevel ?? score;
      const solved = Array.isArray(sub.solvedProblems) ? sub.solvedProblems : [];
      const verdicts = sub.aiAnalysis?.perProblem || [];
      const correctCount = verdicts.filter(v => v.correct).length;
      const studentRecordName = `👤 ${sub.studentName || 'Student'} (${sub.studentEmail || sub.submissionId}) — Score ${score}/100 • Level ${sub.currentLevel || 'A'} (${sub.status || 'IN_PROGRESS'})`;
      const detail = [
        `Student: ${sub.studentName || 'Student'} (${sub.studentEmail || 'no email'})`,
        `Submission ID: ${sub.submissionId}`,
        `Assignment: ${title || attachmentId} (${attachmentId})`,
        `Status: ${sub.status || 'IN_PROGRESS'} | Level: ${sub.currentLevel || 'A'}`,
        `AI Suggested Score: ${sub.suggestedScore ?? 0}/100 | Teacher Assigned Grade: ${sub.assignedScore ?? 'Not graded yet'}`,
        `Concept Mastery: ${mastery}% (${correctCount}/${solved.length || 0} problems correct)`,
        `Mistakes: ${sub.mistakesCount ?? 0} | Hints Used: ${sub.hintsUsedCount ?? 0} | Active Time: ${Math.round((sub.activeTimeSec || 0) / 60)} min`,
        `Teacher Feedback: ${sub.teacherFeedback || sub.aiAnalysis?.suggestedTeacherFeedback || ''}`,
        '',
        '--- Solved Problems ---',
        ...solved.map((p, i) => `${i + 1}. [${p.key || p.id || i + 1}] ${p.problem || ''} -> Answer: ${p.answer || ''}`)
      ].join('\n');
      await this.upsertFolderRecord(studentRecordName.slice(0, 180), detail, resultsFolderId).catch(() => {});
    }

    return `https://drive.google.com/drive/folders/${resultsFolderId}`;
  }

  /**
   * Syncs saved Lesson Plans and saved Materials/Curricula as human-readable entries in the same Google Drive folder.
   */
  async syncLibraryItemsToDrive({ savedLessonPlans = [], customMaterials = [] }) {
    for (const plan of savedLessonPlans.slice(0, 25)) {
      const name = `📘 Lesson Plan — ${(plan.title || plan.id).slice(0, 80)} (${plan.gradeLevel || ''} ${plan.subject || ''})`.trim();
      const desc = [
        `Title: ${plan.title}`,
        `Curriculum: ${plan.curriculum} | ${plan.gradeLevel} ${plan.subject}`,
        `Learning Goal: ${plan.learningGoal || ''}`,
        `Milestones:\n${(plan.targetMilestones || []).map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
        `Saved At: ${plan.savedAt || ''}`
      ].join('\n\n');
      await this.upsertFolderRecord(name, desc, this.folderId).catch(() => {});
    }
    for (const mat of customMaterials.slice(0, 25)) {
      const name = `${mat.docCategory === 'curriculum' ? '📘 Curriculum' : '📄 Material'} — ${(mat.title || mat.id).slice(0, 80)}`;
      const desc = [
        `Title: ${mat.title}`,
        `Type: ${mat.recognizedType || mat.docCategory} | ${mat.curriculum || ''} | ${mat.gradeLevel || ''} ${mat.subject || ''}`,
        `Content:\n${(mat.content || '').slice(0, 15000)}`
      ].join('\n\n');
      await this.upsertFolderRecord(name, desc, this.folderId).catch(() => {});
    }
  }

  fileUrl(id) {
    return id ? `https://drive.google.com/drive/folders/${id}` : '';
  }
}

export const driveStorage = new DriveStorage();
