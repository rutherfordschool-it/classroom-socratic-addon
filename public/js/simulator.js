/**
 * Google Classroom Frame Simulator Controller
 * Simulates Classroom's parent window, postMessage bus, and role transitions.
 */
document.addEventListener('DOMContentLoaded', () => {
  const iframe = document.getElementById('classroomIframe');
  const queryBadge = document.getElementById('queryParamsBadge');
  const logFeed = document.getElementById('simulatorEventLog');

  let currentAttachmentId = 'att-demo-socratic-01';
  let currentSubmissionId = 'sub-demo-student-live';

  function logEvent(title, detail) {
    const timestamp = new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.style.fontSize = '0.78rem';
    item.style.padding = '6px 0';
    item.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    item.innerHTML = `<span style="color:#10b981;">[${timestamp}]</span> <strong>${title}</strong>: <span style="color:#94a3b8;">${JSON.stringify(detail)}</span>`;
    logFeed.prepend(item);
  }

  // ========================================================
  // TOP NAVIGATION TABS (Stream, Classwork, People, Grades)
  // ========================================================
  window.switchTab = function(tabName) {
    document.querySelectorAll('.classroom-nav-tabs .nav-tab-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));

    const tabBtn = document.getElementById(`tabNav-${tabName}`);
    const tabView = document.getElementById(`view-${tabName}`);

    if (tabBtn && tabView) {
      tabBtn.classList.add('active');
      tabView.classList.add('active');
      logEvent('Switched Classroom Tab', { tab: tabName });
    }
  };

  document.querySelectorAll('.classroom-nav-tabs .nav-tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');
      if (tabName) window.switchTab(tabName);
    });
  });

  // ========================================================
  // JOURNEY CONTROLLER (Teacher Discovery, Student, Review)
  // ========================================================
  window.setJourney = function(journey) {
    // If not on classwork tab, switch to classwork first
    window.switchTab('classwork');

    document.querySelectorAll('.journey-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-journey-${journey}`)?.classList.add('active');

    let targetUrl = '';
    const hostTitle = document.getElementById('hostHeaderTitle');
    const hostSub = document.getElementById('hostHeaderSubtitle');

    if (journey === 'teacher-create') {
      targetUrl = `/attachment-discovery.html?courseId=course-calc-101&itemId=assignment-derive-quad&itemType=courseWork&login_hint=teacher@highschool.edu&addOnToken=mock-teacher-token`;
      if (queryBadge) queryBadge.innerText = 'role=teacher | journey=attachmentDiscovery | courseId=course-calc-101';
      if (hostTitle) hostTitle.innerText = 'Google Classroom • Coursework Assignment Editor > Add-on Attachment Dialog';
      if (hostSub) hostSub.innerText = 'Teacher clicked "+ Add-on" > "SocratesAI". Classroom opened attachmentDiscoveryUri iframe modal.';
    } else if (journey === 'student-work') {
      targetUrl = `/student-work.html?attachmentId=${currentAttachmentId}&submissionId=${currentSubmissionId}&courseId=test-class-math&itemId=coursework-01&studentName=Pavel%20Birulin&login_hint=demo.student@example.com`;
      if (queryBadge) queryBadge.innerText = `role=student | journey=studentWork | attachmentId=${currentAttachmentId}`;
      if (hostTitle) hostTitle.innerText = 'Google Classroom • Student Assignment View (Demo Student)';
      if (hostSub) hostSub.innerText = 'Student opened assignment. Classroom embeds studentWorkUri in their coursework view.';
    } else if (journey === 'teacher-review') {
      targetUrl = `/teacher-review.html?submissionId=${currentSubmissionId}&attachmentId=${currentAttachmentId}&courseId=test-class-math&itemId=coursework-01`;
      if (queryBadge) queryBadge.innerText = `role=teacher | journey=studentWorkReview | submissionId=${currentSubmissionId}`;
      if (hostTitle) hostTitle.innerText = 'Google Classroom • Grading & Student Work Review (Demo Student)';
      if (hostSub) hostSub.innerText = 'Teacher opened student submission. Classroom embeds studentWorkReviewUri with automated Grade Passback.';
    }

    if (iframe) iframe.src = targetUrl;
    logEvent('Navigated Viewport', { journey, url: targetUrl });
  };

  // Button listeners
  document.getElementById('btn-journey-teacher-create')?.addEventListener('click', () => window.setJourney('teacher-create'));
  document.getElementById('btn-journey-student-work')?.addEventListener('click', () => window.setJourney('student-work'));
  document.getElementById('btn-journey-teacher-review')?.addEventListener('click', () => window.setJourney('teacher-review'));

  // Explainer modal toggles
  document.getElementById('btnExplainAddon')?.addEventListener('click', () => {
    document.getElementById('addonExplainerModal').style.display = 'flex';
  });
  document.getElementById('btnCloseExplainModal')?.addEventListener('click', () => {
    document.getElementById('addonExplainerModal').style.display = 'none';
  });

  // ========================================================
  // STREAM POST ANNOUNCEMENT
  // ========================================================
  document.getElementById('btnPostAnnouncement')?.addEventListener('click', () => {
    const input = document.getElementById('streamAnnouncementInput');
    const text = input?.value?.trim();
    if (!text) return;

    const container = document.getElementById('streamPostsContainer');
    if (!container) return;

    const post = document.createElement('div');
    post.className = 'stream-post-card';
    post.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:36px; height:36px; border-radius:50%; background:#1e8e3e; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">
            T
          </div>
          <div>
            <div style="font-size:0.92rem; font-weight:600; color:#ffffff;">Dr. Sarah Henderson</div>
            <div style="font-size:0.75rem; color:#94a3b8;">Just now (Instructor Announcement)</div>
          </div>
        </div>
      </div>
      <p style="font-size:0.88rem; color:#cbd5e1; line-height:1.5; margin:0 0 12px 0;">${text}</p>
      <div style="font-size:0.75rem; color:#64748b;">0 class comments</div>
    `;

    container.prepend(post);
    input.value = '';
    showToast('Announcement posted to class stream!');
    logEvent('Classroom Event: Announcement Posted', { message: text });
  });

  // ========================================================
  // EXPORT GRADEBOOK CSV
  // ========================================================
  document.getElementById('btnExportGradesCsv')?.addEventListener('click', () => {
    const csvContent = "data:text/csv;charset=utf-8," + [
      "Student Name,Email,Overall Grade,Laws of Logarithms (SocratesAI / 100),Stoichiometry & Ratios (SocratesAI / 100),Unit 1 Quiz (/50)",
      "Demo Student,demo.student@example.com,95.0%,95,90,47",
      "Marcus Vance,marcus.v@highschool.edu,94.5%,95,94,48",
      "Jordan Rivera,jordan.r@highschool.edu,88.5%,88,86,44",
      "Maya Lin,maya.l@highschool.edu,In Progress,In Progress,88,45",
      "Sofia Patel,sofia.p@highschool.edu,In Progress,In Progress,91,46",
      "Chloe Dupont,chloe.d@highschool.edu,Missing,Missing,—,41"
    ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Period_2_STEM_Grades_SocratesAI.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Gradebook exported to Period_2_STEM_Grades_SocratesAI.csv');
    logEvent('Classroom Event: Gradebook Exported to CSV', {});
  });

  // ========================================================
  // POSTMESSAGE BRIDGE FROM IFRAME (Classroom SDK Bridge)
  // ========================================================
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'CLASSROOM_ADDON_CREATE_ATTACHMENT' || data.type === 'CLASSROOM_ADDON_ATTACHMENT_CREATED') {
      const detail = data.payload || { id: data.attachmentId, title: data.title, studentWorkUrl: data.studentWorkUrl };
      logEvent('Classroom Event: Attachment Created (CLASSROOM_ADDON_ATTACHMENT_CREATED)', detail);
      const newId = data.attachmentId || data.payload?.id;
      if (newId) {
        currentAttachmentId = newId;
      }
      showToast(
        'Attachment Created via Classroom Add-on Bridge!',
        `<button onclick="window.setJourney('student-work')" style="background:white; color:#065f46; font-weight:700; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; font-size:0.78rem;">Open Student Work ➔</button>`
      );
    } else if (data.type === 'CLASSROOM_ADDON_STUDENT_SUBMISSION') {
      logEvent('Classroom Event: Student Submitted Work', data.payload);
      if (data.payload?.submissionId) {
        currentSubmissionId = data.payload.submissionId;
      }
      showToast(
        'Student Work Turned In to Google Classroom!',
        `<button onclick="window.setJourney('teacher-review')" style="background:white; color:#065f46; font-weight:700; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; font-size:0.78rem;">Open Teacher Review ➔</button>`
      );
    } else if (data.type === 'CLASSROOM_ADDON_GRADE_PASSBACK') {
      logEvent('Classroom Event: Grade Passed Back to Gradebook', data.payload);
      const score = data.payload.score || 92;
      
      // Update Gradebook table dynamically!
      const valEl = document.getElementById('gradeValue-demo');
      if (valEl) {
        valEl.innerText = score;
        const cell = document.getElementById('gradeCell-demo');
        if (cell) {
          cell.style.background = 'rgba(16, 185, 129, 0.35)';
          cell.style.padding = '4px 10px';
          cell.style.borderRadius = '6px';
          cell.style.transition = 'all 0.5s ease';
          setTimeout(() => {
            cell.style.background = 'transparent';
          }, 2500);
        }
      }

      showToast(
        `Grade ${score}/100 synced to Google Classroom Gradebook!`,
        `<button onclick="window.switchTab('grades')" style="background:white; color:#065f46; font-weight:700; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; font-size:0.78rem;">Open Grades Tab ➔</button>`
      );
    }
  });

  function showToast(msg, actionHtml = '') {
    const toast = document.getElementById('simToast');
    if (!toast) return;
    toast.innerHTML = `<div style="display:flex; align-items:center; gap:12px;"><span>${msg}</span>${actionHtml}</div>`;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 7000);
  }

  // Initialize with teacher creation journey
  window.setJourney('teacher-create');
});
