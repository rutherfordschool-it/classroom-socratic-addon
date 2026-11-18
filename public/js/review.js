/**
 * Teacher Grading, Telemetry & Cohort Review Controller (Architecture v2 — 100% English, Zero Fake Data)
 * Implements:
 * - Point 7a: Student Performance Telemetry (Time spent, Mistakes, Repetitions, Hints) & Automatic Cohort Grouping (Group C / Group B / Group A)
 * - Point 7b: Teacher Preparation Time Telemetry (Block 1 Material Studio vs Block 2 Lesson Plan)
 * - Clean Empty State when no real students have submitted work yet
 * - Full Socratic Dialogue + Handwritten Photo Solution Inspection & Grade Passback
 */

import { initFullWindowBridge } from './full-window-bridge.js?v=20261113d';

const urlParams = new URLSearchParams(window.location.search);
let currentSubmissionId = urlParams.get('submissionId') || '';
const attachmentId = urlParams.get('attachmentId') || 'att-demo-socratic-01';
const courseId = urlParams.get('courseId') || 'test-class-math';
const courseWorkId = urlParams.get('courseWorkId') || 'assignment-draft-01';
const addOnToken = urlParams.get('addOnToken') || '';

let attachmentMetadata = null;
let submissionData = null;
let allSubmissions = [];
let cohortSummary = null;

document.addEventListener('DOMContentLoaded', async () => {
  initFullWindowBridge({ pageType: 'review' });
  await Promise.all([
    loadAttachmentMetadata(),
    loadCohortSummary(),
    loadSubmissionsList()
  ]);
  if (currentSubmissionId) {
    await loadSubmissionData(currentSubmissionId);
    if (cohortSummary?.cohorts) {
      renderCohortsGrid(cohortSummary.cohorts);
    }
  } else {
    renderEmptyReviewState();
  }
  setupEventListeners();
});

function renderMathSafe(el, attempt = 0) {
  if (!el) return;
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } catch (e) { /* ignore */ }
  } else if (attempt < 15) {
    setTimeout(() => renderMathSafe(el, attempt + 1), 120);
  }
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only genuine base64 raster images may be rendered; anything else (javascript:, remote URLs, SVG) is dropped. */
function safeImageSrc(data = '') {
  const str = String(data || '');
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(str) ? str : '';
}

function formatDuration(sec = 0) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const rem = (s % 60).toString().padStart(2, '0');
  return `${m}m ${rem}s`;
}

async function loadAttachmentMetadata() {
  try {
    const res = await fetch(`/api/attachment/${encodeURIComponent(attachmentId)}`);
    const data = await res.json();
    if (data.success && data.attachment) {
      attachmentMetadata = data.attachment;
      const titleSub = document.getElementById('activityTitleSub');
      if (titleSub && attachmentMetadata.title) {
        titleSub.textContent = attachmentMetadata.title;
      }
    }
  } catch (err) {
    console.warn('Could not load attachment metadata:', err);
  }
}

/**
 * Point 7a & 7b: Load Cohort Grouping (A / B / C) & Teacher Prep Telemetry
 */
async function loadCohortSummary() {
  try {
    const res = await fetch(`/api/attachment/${encodeURIComponent(attachmentId)}/cohorts`);
    const data = await res.json();
    if (data.success) {
      cohortSummary = data;
      renderResultsLink(data);
      renderTeacherPrepTelemetry(data.teacherTelemetry);
      renderCohortsGrid(data.cohorts);
    }
  } catch (err) {
    console.warn('Could not load cohort summary:', err);
  }
}

/** Shows where every student's results are stored (shared Google Drive folder / results sheet) */
function renderResultsLink(data = {}) {
  const host = document.getElementById('activityTitleSub');
  if (host) {
    let box = document.getElementById('driveResultsLink');
    if (!box) {
      box = document.createElement('div');
      box.id = 'driveResultsLink';
      box.style.cssText = 'margin-top:0.35rem; font-size:0.78rem; display:flex; gap:0.75rem; flex-wrap:wrap;';
      host.insertAdjacentElement('afterend', box);
    }
    const links = [];
    if (data.resultsSheetUrl) {
      links.push(`<a href="${escapeHtml(data.resultsSheetUrl)}" target="_blank" rel="noopener">📊 All students' results in Google Drive</a>`);
    }
    links.push(`<a href="/api/attachment/${encodeURIComponent(attachmentId)}/results.csv">⬇️ Download results (CSV)</a>`);
    if (data.storage?.driveFolderUrl) {
      links.push(`<a href="${escapeHtml(data.storage.driveFolderUrl)}" target="_blank" rel="noopener">📁 Google Drive data folder</a>`);
    }
    box.innerHTML = links.join('');
  }

  const topActionLinks = document.getElementById('driveQuickActionLinks');
  const statusBanner = document.getElementById('driveSyncStatusBanner');
  if (statusBanner && data.storage) {
    if (data.storage.driveFolderUrl) {
      statusBanner.innerHTML = `✅ Synced to Google Drive folder <strong>${escapeHtml(data.storage.driveName || 'SocratesAI Data')}</strong> (shared with school Drive).`;
    } else {
      statusBanner.textContent = `Storage mode: ${data.storage.backend || 'local'}. All student submissions are gathered below.`;
    }
  }
  if (topActionLinks) {
    const btns = [];
    if (data.resultsSheetUrl) {
      btns.push(`<a href="${escapeHtml(data.resultsSheetUrl)}" target="_blank" rel="noopener" class="btn btn-secondary" style="padding:0.32rem 0.7rem; font-size:0.76rem;">📊 Open Results in Google Drive</a>`);
    }
    if (data.storage?.driveFolderUrl) {
      btns.push(`<a href="${escapeHtml(data.storage.driveFolderUrl)}" target="_blank" rel="noopener" class="btn btn-secondary" style="padding:0.32rem 0.7rem; font-size:0.76rem;">📁 Open Google Drive Folder</a>`);
    }
    btns.push(`<a href="/api/attachment/${encodeURIComponent(attachmentId)}/results.csv" class="btn btn-secondary" style="padding:0.32rem 0.7rem; font-size:0.76rem;">⬇️ Export All Students CSV</a>`);
    topActionLinks.innerHTML = btns.join('');
  }
}

function renderAllStudentsResultsTable() {
  const tbody = document.getElementById('allStudentsResultsTableBody');
  if (!tbody) return;
  if (!Array.isArray(allSubmissions) || allSubmissions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="padding:0.9rem; text-align:center; color:#5f6368; font-style:italic;">No student submissions yet. Once students submit answers, all students' results appear here automatically.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allSubmissions.map(sub => {
    const isSelected = sub.submissionId === currentSubmissionId;
    const isSubmitted = sub.status === 'TURNED_IN' || sub.status === 'SUBMITTED';
    const solved = Array.isArray(sub.solvedProblems) ? sub.solvedProblems : [];
    const verdicts = sub.aiAnalysis?.perProblem || [];
    const correctCount = verdicts.filter(v => v.correct).length;
    const totalExpected = Number(sub.totalSelectedProblems) || Math.max(3, solved.length);
    const mastery = sub.masteryLevel ?? sub.aiAnalysis?.masteryPercentage ?? 0;
    const aiScore = sub.suggestedScore ?? mastery;
    const teacherGrade = sub.assignedScore !== null && sub.assignedScore !== undefined ? `${sub.assignedScore}/100` : '—';
    const mistakes = sub.mistakesCount ?? (sub.aiAnalysis?.misconceptionsIdentified?.length || 0);
    const hints = sub.hintsUsedCount ?? 0;
    const scoreColor = aiScore >= 85 ? '#137333' : aiScore >= 60 ? '#1967d2' : '#c5221f';

    return `
      <tr class="student-result-row" data-sub-id="${escapeHtml(sub.submissionId)}" style="cursor:pointer; border-bottom:1px solid #dadce0; background:${isSelected ? '#e8f0fe' : '#ffffff'};">
        <td style="padding:0.55rem 0.75rem; font-weight:600; color:#202124;">
          ${escapeHtml(sub.studentName || 'Student')}
          ${sub.studentEmail ? `<div style="font-size:0.7rem; color:#5f6368; font-weight:400;">${escapeHtml(sub.studentEmail)}</div>` : ''}
        </td>
        <td style="padding:0.55rem 0.65rem;">
          <span class="badge ${isSubmitted ? 'badge-green' : 'badge-blue'}" style="font-size:0.7rem;">${isSubmitted ? 'Submitted' : 'In Progress'}</span>
        </td>
        <td style="padding:0.55rem 0.65rem; font-weight:600;">Level ${escapeHtml(sub.currentLevel || 'A')}</td>
        <td style="padding:0.55rem 0.65rem;"><strong>${correctCount}</strong> / ${solved.length} answered (of ${totalExpected})</td>
        <td style="padding:0.55rem 0.65rem; font-weight:700; color:${scoreColor};">${mastery}%</td>
        <td style="padding:0.55rem 0.65rem; font-weight:700; color:${scoreColor};">${aiScore}/100</td>
        <td style="padding:0.55rem 0.65rem; font-weight:700; color:#137333;">${escapeHtml(teacherGrade)}</td>
        <td style="padding:0.55rem 0.65rem; color:${mistakes > 0 ? '#c5221f' : '#137333'}; font-weight:600;">${mistakes}</td>
        <td style="padding:0.55rem 0.65rem;">${hints}</td>
        <td style="padding:0.55rem 0.65rem;">${formatDuration(sub.activeTimeSec || 0)}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.student-result-row').forEach(row => {
    row.addEventListener('click', async () => {
      const subId = row.getAttribute('data-sub-id');
      if (subId) {
        currentSubmissionId = subId;
        const sel = document.getElementById('studentSubmissionSelect');
        if (sel) sel.value = subId;
        renderAllStudentsResultsTable();
        if (cohortSummary?.cohorts) renderCohortsGrid(cohortSummary.cohorts);
        await loadSubmissionData(subId);
      }
    });
  });
}

function renderTeacherPrepTelemetry(telemetry = {}) {
  const matEl = document.getElementById('teacherMatPrepMetric');
  const planEl = document.getElementById('teacherPlanPrepMetric');
  const totalEl = document.getElementById('teacherTotalPrepMetric');

  const matSec = telemetry.materialPrepTimeSec ?? 0;
  const planSec = telemetry.lessonPlanPrepTimeSec ?? 0;
  const totalSec = telemetry.totalPrepTimeSec ?? (matSec + planSec);

  if (matEl) matEl.textContent = formatDuration(matSec);
  if (planEl) planEl.textContent = formatDuration(planSec);
  if (totalEl) totalEl.textContent = formatDuration(totalSec);
}

function renderCohortsGrid(cohorts = {}) {
  const grid = document.getElementById('cohortGroupsGrid');
  if (!grid) return;

  const groupStyles = {
    C: { bg: '#e6f4ea', border: '#ceead6', titleColor: '#137333', badgeClass: 'badge-green', icon: '🟢' },
    B: { bg: '#e8f0fe', border: '#d2e3fc', titleColor: '#1967d2', badgeClass: 'badge-blue', icon: '🔵' },
    A: { bg: '#fef7e0', border: '#fde293', titleColor: '#b06000', badgeClass: 'badge-amber', icon: '🟠' }
  };

  grid.innerHTML = ['C', 'B', 'A'].map(key => {
    const group = cohorts[key] || { label: `Group ${key}`, recommendation: '', students: [] };
    const st = groupStyles[key];
    const studentsHtml = group.students.length === 0
      ? `<div style="font-size:0.78rem; color:#5f6368; font-style:italic; padding:0.5rem 0;">No student submissions in this cohort yet</div>`
      : group.students.map(s => {
          const isSelected = s.submissionId === currentSubmissionId;
          return `
            <div class="cohort-student-card" data-sub-id="${escapeHtml(s.submissionId)}" style="padding:0.65rem 0.75rem; border-radius:8px; background:#ffffff; border:${isSelected ? '2px solid #1a73e8' : '1px solid #dadce0'}; cursor:pointer; transition:all 0.12s; box-shadow:0 1px 2px rgba(60,64,67,0.06);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                <strong style="font-size:0.83rem; color:#202124;">${escapeHtml(s.studentName)}</strong>
                <span class="badge ${st.badgeClass}" style="font-size:0.7rem;">${s.masteryLevel}%</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:0.45rem; font-size:0.72rem; color:#5f6368;">
                <span>⏱️ ${formatDuration(s.activeTimeSec)}</span>
                <span>•</span>
                <span>🔄 Reps: <strong>${s.repetitionsCount}</strong></span>
                <span>•</span>
                <span>⚠️ Mistakes: <strong style="color:${s.mistakesCount > 0 ? '#c5221f' : '#137333'};">${s.mistakesCount}</strong></span>
              </div>
            </div>
          `;
        }).join('');

    return `
      <div style="padding:0.95rem; border-radius:10px; background:${st.bg}; border:1px solid ${st.border}; display:flex; flex-direction:column; gap:0.6rem;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:0.86rem; font-weight:700; color:${st.titleColor};">${st.icon} ${escapeHtml(group.label)}</div>
          <span style="font-size:0.75rem; font-weight:700; color:${st.titleColor};">${group.students.length} student(s)</span>
        </div>
        <div style="font-size:0.75rem; color:#3c4043; line-height:1.35;">${escapeHtml(group.recommendation)}</div>
        <div style="display:flex; flex-direction:column; gap:0.45rem; margin-top:0.2rem;">
          ${studentsHtml}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.cohort-student-card').forEach(card => {
    card.addEventListener('click', async () => {
      const subId = card.getAttribute('data-sub-id');
      if (subId) {
        currentSubmissionId = subId;
        const sel = document.getElementById('studentSubmissionSelect');
        if (sel) sel.value = subId;
        renderAllStudentsResultsTable();
        renderCohortsGrid(cohortSummary.cohorts);
        await loadSubmissionData(subId);
      }
    });
  });
}

async function loadSubmissionsList() {
  const select = document.getElementById('studentSubmissionSelect');
  try {
    const res = await fetch(`/api/attachment/${encodeURIComponent(attachmentId)}/submissions`);
    const data = await res.json();
    if (data.success && Array.isArray(data.submissions) && data.submissions.length > 0) {
      allSubmissions = data.submissions;
      if (select) {
        select.innerHTML = '';
        allSubmissions.forEach((sub, index) => {
          const opt = document.createElement('option');
          opt.value = sub.submissionId;
          const scoreLabel = sub.suggestedScore !== null && sub.suggestedScore !== undefined ? `${sub.suggestedScore}/100` : `${sub.masteryLevel || 0}%`;
          const liveTag = index === 0 ? '🟢 ' : '';
          opt.textContent = `${liveTag}${sub.studentName} — Level ${sub.currentLevel || 'A'} (${scoreLabel})`;
          select.appendChild(opt);
        });

        if (!currentSubmissionId || !allSubmissions.some(s => s.submissionId === currentSubmissionId)) {
          currentSubmissionId = allSubmissions[0].submissionId;
        }
        select.value = currentSubmissionId;
        select.onchange = async (e) => {
          currentSubmissionId = e.target.value;
          renderAllStudentsResultsTable();
          if (cohortSummary?.cohorts) renderCohortsGrid(cohortSummary.cohorts);
          await loadSubmissionData(currentSubmissionId);
        };
      }
      renderAllStudentsResultsTable();
    } else {
      allSubmissions = [];
      renderAllStudentsResultsTable();
      if (select) {
        select.innerHTML = '<option value="">No student submissions yet</option>';
      }
    }
  } catch (err) {
    console.warn('Could not load submissions list:', err);
  }
}

async function loadSubmissionData(subId) {
  if (!subId) {
    submissionData = null;
    renderEmptyReviewState();
    return;
  }
  try {
    const res = await fetch(`/api/submission/${encodeURIComponent(subId)}`);
    const data = await res.json();
    if (data.success && data.submission) {
      submissionData = data.submission;
    } else {
      submissionData = null;
    }
  } catch (err) {
    console.warn('Could not fetch submission:', err);
    submissionData = null;
  }

  if (submissionData) {
    renderReviewDashboard();
  } else {
    renderEmptyReviewState();
  }
}

function renderEmptyReviewState() {
  const statusBadge = document.getElementById('submissionStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = 'No Submissions Yet';
    statusBadge.className = 'badge badge-blue';
  }
  document.getElementById('studentNameHeader').textContent = 'No Student Submissions Yet';
  if (attachmentMetadata?.title) {
    document.getElementById('activityTitleSub').textContent = attachmentMetadata.title;
  }
  const dialBox = document.getElementById('scoreDialBox');
  if (dialBox) {
    dialBox.style.borderColor = '#dadce0';
    dialBox.style.background = '#f8f9fa';
  }
  document.getElementById('suggestedScoreDial').textContent = '—';
  document.getElementById('suggestedScoreDial').style.color = '#5f6368';

  document.getElementById('metricLevelRoute').textContent = '—';
  document.getElementById('metricActiveTime').textContent = '00m 00s';
  document.getElementById('metricRepetitions').textContent = '0 problem(s)';
  document.getElementById('metricMistakes').textContent = '0';
  document.getElementById('metricHints').textContent = '0';
  document.getElementById('metricPhotos').textContent = '0 sheet(s)';

  document.getElementById('aiSummaryText').textContent =
    'No student has attempted or turned in this assignment yet. Student results, mastery scores, Socratic dialogue transcripts, and handwritten work will appear here automatically once students begin working.';
  document.getElementById('independenceScore').textContent = '— / 100';
  document.getElementById('assignedGradeInput').value = '';
  document.getElementById('teacherFeedbackInput').value = '';

  const achievedList = document.getElementById('achievedList');
  if (achievedList) {
    achievedList.innerHTML = '<li style="color:#5f6368; list-style:none; margin-left:-1rem;">No milestones recorded yet.</li>';
  }
  const misconceptionsList = document.getElementById('misconceptionsList');
  if (misconceptionsList) {
    misconceptionsList.innerHTML = '<li style="color:#5f6368; list-style:none; margin-left:-1rem;">No misconceptions recorded yet.</li>';
  }

  document.getElementById('turnCountBadge').textContent = '0 messages';
  const transcriptContainer = document.getElementById('transcriptContainer');
  if (transcriptContainer) {
    transcriptContainer.innerHTML = `
      <div style="padding:2rem 1.5rem; text-align:center; color:#5f6368; font-size:0.88rem;">
        No student dialogue recorded yet. Once a student answers a Socratic question or uploads a handwritten photo, their full transcript will appear here.
      </div>
    `;
  }
}

function renderReviewDashboard() {
  const statusBadge = document.getElementById('submissionStatusBadge');
  if (statusBadge) {
    const isSubmitted = submissionData.status === 'TURNED_IN' || submissionData.status === 'SUBMITTED';
    statusBadge.textContent = isSubmitted ? 'Submitted' : 'In Progress';
    statusBadge.className = isSubmitted ? 'badge badge-green' : 'badge badge-blue';
  }

  document.getElementById('studentNameHeader').textContent = submissionData.studentName || 'Student';
  if (attachmentMetadata?.title) {
    document.getElementById('activityTitleSub').textContent = attachmentMetadata.title;
  }

  const analysis = submissionData.aiAnalysis || {};

  // Update 6 Detailed Student Telemetry Cards (Point 7a)
  const routeArr = Array.isArray(submissionData.levelProgression) && submissionData.levelProgression.length > 0
    ? submissionData.levelProgression.map(x => x === 'DIAGNOSTIC' ? 'Diag' : `Level ${x}`).join(' → ')
    : `Diag → Level ${submissionData.currentLevel || 'A'}`;
  const activeTime = submissionData.activeTimeSec ?? 0;
  const reps = submissionData.repetitionsCount ?? 0;
  const mistakes = submissionData.mistakesCount ?? (analysis.misconceptionsIdentified?.length || 0);
  const hints = submissionData.hintsUsedCount ?? 0;
  const photos = submissionData.photosSubmittedCount ?? 0;

  document.getElementById('metricLevelRoute').textContent = routeArr;
  document.getElementById('metricActiveTime').textContent = formatDuration(activeTime);
  document.getElementById('metricRepetitions').textContent = `${reps} problem(s)`;
  document.getElementById('metricMistakes').textContent = String(mistakes);
  document.getElementById('metricHints').textContent = String(hints);
  document.getElementById('metricPhotos').textContent = `${photos} sheet(s)`;

  const computedScore = analysis.suggestedScore ?? submissionData.suggestedScore ?? submissionData.masteryLevel ?? 0;
  const dialBox = document.getElementById('scoreDialBox');
  const dialEl = document.getElementById('suggestedScoreDial');
  if (dialBox && dialEl) {
    if (computedScore >= 85) {
      dialBox.style.borderColor = '#1e8e3e';
      dialBox.style.background = '#e6f4ea';
      dialEl.style.color = '#137333';
    } else if (computedScore >= 60) {
      dialBox.style.borderColor = '#1a73e8';
      dialBox.style.background = '#e8f0fe';
      dialEl.style.color = '#1967d2';
    } else {
      dialBox.style.borderColor = '#d93025';
      dialBox.style.background = '#fce8e6';
      dialEl.style.color = '#c5221f';
    }
    dialEl.textContent = computedScore;
  }
  document.getElementById('assignedGradeInput').value = submissionData.assignedScore ?? computedScore;
  document.getElementById('aiSummaryText').textContent = analysis.summary || 'Session in progress. Click "🔄 Refresh AI Assessment" to evaluate the transcript.';
  document.getElementById('independenceScore').textContent = `${analysis.socraticIndependenceScore ?? computedScore} / 100`;
  document.getElementById('teacherFeedbackInput').value = submissionData.teacherFeedback || analysis.suggestedTeacherFeedback || '';

  const achievedList = document.getElementById('achievedList');
  achievedList.innerHTML = '';
  const milestones = analysis.milestonesAchieved || [];
  if (milestones.length === 0) {
    achievedList.innerHTML = '<li style="color:#c5221f; list-style:none; margin-left:-1rem;">No milestones achieved (0 problems answered correctly).</li>';
  } else {
    milestones.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      achievedList.appendChild(li);
    });
  }

  const misconceptionsList = document.getElementById('misconceptionsList');
  misconceptionsList.innerHTML = '';
  const issues = analysis.misconceptionsIdentified || [];
  if (issues.length === 0) {
    const li = document.createElement('li');
    li.style.color = '#137333';
    li.textContent = 'No conceptual misconceptions detected (0 mistakes)';
    misconceptionsList.appendChild(li);
  } else {
    issues.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      misconceptionsList.appendChild(li);
    });
  }

  renderMathSafe(document.getElementById('aiSummaryText'));
  renderMathSafe(achievedList);
  renderMathSafe(misconceptionsList);

  // Render Transcript with KaTeX & Handwritten Photo Thumbnails
  const transcriptContainer = document.getElementById('transcriptContainer');
  transcriptContainer.innerHTML = '';
  const transcript = submissionData.transcript || [];
  document.getElementById('turnCountBadge').textContent = `${transcript.length} messages`;

  transcript.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.role === 'user' ? 'message-user' : 'message-ai'}`;
    const label = msg.role === 'user' ? (submissionData.studentName || 'Student') : 'SocratesAI Tutor';

    const formattedContent = escapeHtml(msg.content || '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

    let attachmentsHtml = '';
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      attachmentsHtml = `<div style="margin-top:0.55rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
        ${msg.attachments.filter(att => safeImageSrc(att && att.data)).map(att => `
          <div style="border:1px solid rgba(0,0,0,0.15); border-radius:8px; background:#ffffff; padding:4px;">
            <img src="${safeImageSrc(att.data)}" alt="Student Handwritten Work" style="max-width:250px; max-height:175px; border-radius:4px; display:block; object-fit:contain;" />
            <div style="font-size:0.7rem; color:#5f6368;">📷 Student Handwritten Sheet</div>
          </div>
        `).join('')}
      </div>`;
    }

    bubble.innerHTML = `
      <div class="message-meta"><span>${escapeHtml(label)}</span></div>
      <div class="message-content">${formattedContent}${attachmentsHtml}</div>
    `;
    transcriptContainer.appendChild(bubble);
    renderMathSafe(bubble);
  });
}

function setupEventListeners() {
  document.getElementById('clearSubmissionsBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('clearSubmissionsBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Clearing...';
    try {
      await fetch('/api/submissions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId: null })
      });
      currentSubmissionId = '';
      submissionData = null;
      allSubmissions = [];
      await Promise.all([loadCohortSummary(), loadSubmissionsList()]);
      renderEmptyReviewState();
    } catch (e) {
      console.warn('Could not clear submissions:', e);
    } finally {
      btn.disabled = false;
      btn.textContent = '🗑️ Clear Results';
    }
  });

  document.getElementById('reEvaluateBtn')?.addEventListener('click', async () => {
    if (!submissionData) return;
    const btn = document.getElementById('reEvaluateBtn');
    btn.textContent = '⏳ Analyzing transcript...';
    btn.disabled = true;

    try {
      const res = await fetch(`/api/submission/${encodeURIComponent(submissionData.submissionId)}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData)
      });
      const data = await res.json();
      if (data.success && data.submission) {
        submissionData = data.submission;
        await Promise.all([loadCohortSummary(), loadSubmissionsList()]);
        renderReviewDashboard();
      }
    } catch (err) {
      alert('Error refreshing AI assessment.');
    } finally {
      btn.textContent = '🔄 Refresh AI Assessment';
      btn.disabled = false;
    }
  });

  document.getElementById('gradePassbackForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passbackBtn = document.getElementById('passbackBtn');
    const statusText = document.getElementById('passbackStatusText');
    const assignedGrade = document.getElementById('assignedGradeInput').value || '0';
    const teacherComment = document.getElementById('teacherFeedbackInput').value;

    passbackBtn.disabled = true;
    passbackBtn.textContent = '⏳ Syncing...';

    try {
      const res = await fetch('/api/grade-passback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: currentSubmissionId,
          assignedGrade: Number(assignedGrade),
          teacherComment
        })
      });
      const data = await res.json();
      if (data.success && data.result?.liveApi) {
        statusText.style.color = '#137333';
        statusText.textContent = `✅ Grade ${assignedGrade}/100 sent to Google Classroom`;
        passbackBtn.textContent = '✅ Synced';
      } else if (data.success) {
        statusText.style.color = '#b06000';
        statusText.textContent = `💾 ${data.result?.message || 'Grade saved to the results sheet.'}`;
        passbackBtn.disabled = false;
        passbackBtn.textContent = '🚀 Sync Grade to Google Classroom';
        await Promise.all([loadCohortSummary(), loadSubmissionsList()]);
      } else {
        throw new Error(data.error || 'Grade could not be saved');
      }
    } catch (err) {
      statusText.style.color = '#d93025';
      statusText.textContent = `❌ Failed to sync grade: ${err.message || err}`;
      passbackBtn.disabled = false;
      passbackBtn.textContent = '🚀 Sync Grade to Google Classroom';
    }
  });
}
