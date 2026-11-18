/**
 * Google Classroom Add-on Full-Scale Browser Window Launcher & Sync Bridge
 * - Never shows the cramped multi-column Studio UI inside Google Classroom's small modal iframe;
 *   instead immediately opens the Full-Page Browser Tab (`?fullWindow=1`) and renders a clean
 *   Full-Page Sync Bridge inside the iframe.
 * - Synchronizes attachment creation between the Full-Page Browser Tab and the Google Classroom
 *   iframe across Chrome's third-party storage partitioning via Server-Side Bridge Polling
 *   (`/api/attachment/bridge-status`) + `window.opener.postMessage` + `BroadcastChannel` + `localStorage`.
 * - As soon as the teacher clicks "📎 Attach Activity to Assignment" in the Full-Page Tab,
 *   the Google Classroom iframe automatically dispatches:
 *     `window.parent.postMessage({ type: 'Classroom', action: 'closeIframe' }, '*')`
 *   which causes Google Classroom to close the modal and display the new attachment link in the assignment.
 */

const BRIDGE_CHANNEL_NAME = 'socrates_classroom_fullwindow_bridge';

export function initFullWindowBridge(options = {}) {
  const { pageType = 'discovery' } = options;
  const isInsideIframe = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  const url = new URL(window.location.href);
  const stayInIframe = url.searchParams.get('stayInIframe') === '1';
  const isFullWindowInstance = url.searchParams.get('fullWindow') === '1';
  const bridgeInitTimestamp = Date.now();

  const addOnToken = url.searchParams.get('addOnToken') || '';
  const courseId = url.searchParams.get('courseId') || '';
  const itemId = url.searchParams.get('itemId') || url.searchParams.get('postId') || url.searchParams.get('courseWorkId') || '';

  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(BRIDGE_CHANNEL_NAME);
    }
  } catch (e) { /* ignore */ }

  function buildFullWindowUrl() {
    const target = new URL(window.location.href);
    target.searchParams.set('fullWindow', '1');
    target.searchParams.delete('stayInIframe');
    return target.toString();
  }

  function switchToCompactIframeMode() {
    document.documentElement.classList.remove('socrates-iframe-bridge-mode');
    const maskStyle = document.getElementById('socratesIframeMaskStyle');
    if (maskStyle) maskStyle.remove();
    const overlay = document.getElementById('socratesIframeBridgeOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function openFullScaleWindow() {
    const targetUrl = buildFullWindowUrl();
    if (window.__socratesAutoOpenedWindow && !window.__socratesAutoOpenedWindow.closed) {
      try { window.__socratesAutoOpenedWindow.focus(); } catch (e) {}
      renderIframeBridgeOverlay({ state: 'connected', targetUrl, switchToCompactIframeMode });
      return true;
    }
    const win = window.open(targetUrl, '_blank');
    if (win) {
      window.__socratesAutoOpenedWindow = win;
      try { win.focus(); } catch (e) {}
      renderIframeBridgeOverlay({ state: 'connected', targetUrl, switchToCompactIframeMode });
      return true;
    }
    return false;
  }

  injectHeaderFullWindowButton({ isInsideIframe, isFullWindowInstance, openFullScaleWindow });

  if (isInsideIframe && !stayInIframe) {
    document.documentElement.classList.add('socrates-iframe-bridge-mode');

    let attachmentHandled = false;
    let pollTimer = null;

    const handleBridgeMessage = (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'CLASSROOM_ADDON_ATTACHMENT_CREATED' || msg.attached === true) {
        if (attachmentHandled) return;
        attachmentHandled = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }

        renderIframeBridgeOverlay({
          state: 'attached',
          title: msg.title || 'SocratesAI Activity',
          studentWorkUrl: msg.studentWorkUrl || '#',
          switchToCompactIframeMode
        });

        // Official Google Classroom Add-ons postMessage signal to close the modal iframe
        // and commit/refresh the attachment card in the Google Classroom assignment editor
        const sendClassroomClose = () => {
          try {
            window.parent.postMessage({ type: 'Classroom', action: 'closeIframe' }, '*');
          } catch (e) {}
        };
        sendClassroomClose();
        setTimeout(sendClassroomClose, 250);
        setTimeout(() => {
          if (window.__socratesAutoOpenedWindow && !window.__socratesAutoOpenedWindow.closed) {
            try { window.__socratesAutoOpenedWindow.close(); } catch (e) {}
          }
          sendClassroomClose();
        }, 650);
      }
    };

    if (channel) {
      channel.onmessage = (ev) => handleBridgeMessage(ev.data);
    }
    window.addEventListener('message', (ev) => {
      if (ev.data && typeof ev.data === 'object') {
        handleBridgeMessage(ev.data);
      }
    });
    window.addEventListener('storage', (ev) => {
      if (ev.key === BRIDGE_CHANNEL_NAME && ev.newValue) {
        try {
          handleBridgeMessage(JSON.parse(ev.newValue));
        } catch (e) {}
      }
    });

    // Server-side bridge polling to bypass Chrome third-party Storage Partitioning between iframe and full-page tab
    if (pageType === 'discovery' && (addOnToken || (courseId && itemId))) {
      pollTimer = setInterval(async () => {
        if (attachmentHandled) return;
        try {
          const qs = new URLSearchParams({
            addOnToken,
            courseId,
            itemId,
            since: String(bridgeInitTimestamp)
          });
          const res = await fetch(`/api/attachment/bridge-status?${qs.toString()}`);
          const data = await res.json();
          if (data && data.attached === true) {
            handleBridgeMessage(data);
          }
        } catch (e) {}
      }, 500);
    }

    const openedAutomatically = openFullScaleWindow();
    if (!openedAutomatically) {
      renderIframeBridgeOverlay({
        state: 'prompt',
        targetUrl: buildFullWindowUrl(),
        openFullScaleWindow,
        switchToCompactIframeMode
      });
    }
  }

  return {
    isInsideIframe,
    isFullWindowInstance,
    openFullScaleWindow,
    notifyClassroomIframe(payload) {
      try {
        if (channel) channel.postMessage(payload);
      } catch (e) {}
      try {
        localStorage.setItem(BRIDGE_CHANNEL_NAME, JSON.stringify({ ...payload, ts: Date.now() }));
      } catch (e) {}
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
        }
      } catch (e) {}
    }
  };
}

function injectHeaderFullWindowButton({ isInsideIframe, isFullWindowInstance, openFullScaleWindow }) {
  const headerRight = document.querySelector('.app-header > div:last-child');
  if (!headerRight || document.getElementById('headerFullWindowBtn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'headerFullWindowBtn';
  btn.className = 'btn btn-secondary';
  btn.style.cssText = 'padding:0.32rem 0.72rem; font-size:0.75rem; white-space:nowrap; border-color:#1a73e8; color:#1967d2; background:#e8f0fe; font-weight:600;';

  if (isInsideIframe) {
    btn.innerHTML = '🖥️ Open Full Browser Window ↗';
    btn.title = 'Open SocratesAI in a full-scale browser window with all Classroom assignment parameters';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullScaleWindow();
    });
  } else {
    btn.innerHTML = '⛶ Fullscreen (F11)';
    btn.title = 'Toggle full-screen browser mode';
    btn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        btn.innerHTML = '⛶ Exit Fullscreen';
      } else {
        document.exitFullscreen?.().catch(() => {});
        btn.innerHTML = '⛶ Fullscreen (F11)';
      }
    });
  }

  headerRight.insertBefore(btn, headerRight.firstChild);
}

function ensureOverlayElement() {
  let overlay = document.getElementById('socratesIframeBridgeOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'socratesIframeBridgeOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:999999; background:linear-gradient(135deg, #f8f9fa 0%, #e8f0fe 100%); display:flex; align-items:center; justify-content:center; padding:1.5rem; font-family:Inter, system-ui, -apple-system, sans-serif;';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  return overlay;
}

function renderIframeBridgeOverlay({ state, targetUrl, title, openFullScaleWindow, switchToCompactIframeMode }) {
  const overlay = ensureOverlayElement();

  if (state === 'attached') {
    overlay.style.cursor = 'default';
    overlay.innerHTML = `
      <div style="max-width:540px; width:100%; background:#ffffff; border:2px solid #1e8e3e; border-radius:16px; padding:2rem; text-align:center; box-shadow:0 12px 32px rgba(19,115,51,0.15);">
        <div style="font-size:3rem; margin-bottom:0.75rem;">✅</div>
        <h2 style="margin:0 0 0.5rem 0; font-size:1.3rem; color:#137333; font-weight:700;">
          Attached to Google Classroom Assignment!
        </h2>
        <p style="margin:0 0 1.25rem 0; font-size:0.92rem; color:#3c4043; line-height:1.5;">
          <strong>"${(title || 'SocratesAI Activity').replace(/</g, '&lt;')}"</strong> has been linked to this assignment. Closing dialog and refreshing your assignment...
        </p>
        <button type="button" id="manualCloseClassroomIframeBtn" class="btn btn-primary" style="background:#1e8e3e; border-color:#1e8e3e; padding:0.65rem 1.4rem; font-size:0.9rem; font-weight:700;">
          ✓ Done — Return to Assignment
        </button>
      </div>
    `;
    document.getElementById('manualCloseClassroomIframeBtn')?.addEventListener('click', () => {
      try {
        window.parent.postMessage({ type: 'Classroom', action: 'closeIframe' }, '*');
      } catch (e) {}
    });
    return;
  }

  if (state === 'connected') {
    overlay.style.cursor = 'default';
    overlay.innerHTML = `
      <div style="max-width:560px; width:100%; background:#ffffff; border:2px solid #1a73e8; border-radius:16px; padding:2rem; text-align:center; box-shadow:0 12px 32px rgba(26,115,232,0.14);">
        <div style="font-size:2.8rem; margin-bottom:0.65rem;">🖥️</div>
        <h2 style="margin:0 0 0.5rem 0; font-size:1.25rem; color:#1967d2; font-weight:700;">
          SocratesAI is Open in a Full-Page Tab
        </h2>
        <p style="margin:0 0 1.25rem 0; font-size:0.9rem; color:#3c4043; line-height:1.55;">
          Prepare your lesson in the full-page browser tab. As soon as you click <strong>📎 Attach Activity to Assignment</strong>, this panel will automatically close and add the link to your assignment.
        </p>
        <div style="display:flex; align-items:center; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
          <a href="${targetUrl}" target="_blank" rel="noopener" id="reopenFullWindowLink" class="btn btn-primary" style="padding:0.65rem 1.35rem; font-size:0.9rem; font-weight:700; text-decoration:none;">
            🖥️ Switch to / Re-Open Full-Page Tab ↗
          </a>
          <button type="button" id="switchCompactViewBtn" class="btn btn-secondary" style="padding:0.6rem 1rem; font-size:0.82rem;">
            Use Compact View Here
          </button>
        </div>
      </div>
    `;
    document.getElementById('reopenFullWindowLink')?.addEventListener('click', (e) => {
      if (window.__socratesAutoOpenedWindow && !window.__socratesAutoOpenedWindow.closed) {
        e.preventDefault();
        try { window.__socratesAutoOpenedWindow.focus(); } catch (err) {}
      }
    });
    document.getElementById('switchCompactViewBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchToCompactIframeMode?.();
    });
    return;
  }

  // state === 'prompt' (if browser blocked unprompted popup prior to a click)
  overlay.style.cursor = 'pointer';
  overlay.innerHTML = `
    <div style="max-width:560px; width:100%; background:#ffffff; border:2px solid #1a73e8; border-radius:16px; padding:2.2rem 2rem; text-align:center; box-shadow:0 14px 36px rgba(26,115,232,0.18);">
      <div style="font-size:3rem; margin-bottom:0.65rem;">🚀</div>
      <h2 style="margin:0 0 0.5rem 0; font-size:1.3rem; color:#202124; font-weight:700;">
        Open SocratesAI in Full-Page Mode
      </h2>
      <p style="margin:0 0 1.4rem 0; font-size:0.92rem; color:#5f6368; line-height:1.55;">
        Click anywhere below to launch the full-screen Teacher Studio in a full browser tab while staying connected to this Google Classroom assignment.
      </p>
      <div style="display:flex; align-items:center; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
        <button type="button" id="launchFullWindowNowBtn" class="btn btn-primary" style="padding:0.75rem 1.6rem; font-size:0.95rem; font-weight:700; box-shadow:0 4px 12px rgba(26,115,232,0.3);">
          🚀 Open Full-Page Studio Now ↗
        </button>
        <button type="button" id="keepCompactPanelBtn" class="btn btn-secondary" style="padding:0.65rem 1rem; font-size:0.82rem;">
          Use Compact View
        </button>
      </div>
    </div>
  `;

  let autoTriggerActive = true;
  const cleanupListeners = () => {
    overlay.removeEventListener('pointerdown', triggerOnce);
    overlay.removeEventListener('click', triggerOnce);
  };

  const triggerOnce = (e) => {
    if (!autoTriggerActive) return;
    if (e.target && e.target.id === 'keepCompactPanelBtn') return;
    autoTriggerActive = false;
    cleanupListeners();
    openFullScaleWindow?.();
  };

  document.getElementById('keepCompactPanelBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    autoTriggerActive = false;
    cleanupListeners();
    switchToCompactIframeMode?.();
  });

  document.getElementById('launchFullWindowNowBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    autoTriggerActive = false;
    cleanupListeners();
    openFullScaleWindow?.();
  });

  overlay.addEventListener('pointerdown', triggerOnce);
  overlay.addEventListener('click', triggerOnce);
}
