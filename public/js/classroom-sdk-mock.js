/**
 * Google Classroom Add-ons JavaScript SDK Shim & Bridge.
 * Conforms to Google's Classroom Add-on API specifications and postMessage protocols.
 */
(function(window) {
  const urlParams = new URLSearchParams(window.location.search);

  const context = {
    courseId: urlParams.get('courseId') || 'course-98241',
    itemId: urlParams.get('itemId') || 'assignment-55102',
    itemType: urlParams.get('itemType') || 'courseWork',
    attachmentId: urlParams.get('attachmentId') || 'att-demo-socratic-01',
    submissionId: urlParams.get('submissionId') || 'sub-demo-student-live',
    addOnToken: urlParams.get('addOnToken') || 'mock-addon-token-xyz',
    login_hint: urlParams.get('login_hint') || 'demo.student@example.com'
  };

  const classroomAddons = {
    getContext() {
      return { ...context };
    },

    /**
     * Teacher Discovery Journey: Called when teacher finalizes the Socratic activity
     * and attaches it to the Google Classroom assignment.
     */
    createAddOnAttachment(attachmentPayload) {
      console.log('[ClassroomAddonSDK] createAddOnAttachment requested:', attachmentPayload);

      // 1. Post official Google Classroom closeIframe signal to parent window
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'Classroom',
          action: 'closeIframe'
        }, '*');

        // Also post legacy / custom event for simulator
        window.parent.postMessage({
          type: 'CLASSROOM_ADDON_CREATE_ATTACHMENT',
          payload: attachmentPayload,
          context: { ...context }
        }, '*');
      }

      // 2. Fallback notification alert or callback
      if (window.onAttachmentCreated) {
        window.onAttachmentCreated(attachmentPayload);
      }
    },

    /**
     * Student Journey: Notify Classroom when student finishes or submits their Socratic work
     */
    notifyStudentWorkSubmitted(submissionData) {
      console.log('[ClassroomAddonSDK] notifyStudentWorkSubmitted:', submissionData);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'CLASSROOM_ADDON_STUDENT_SUBMISSION',
          payload: submissionData,
          context: { ...context }
        }, '*');
      }
    },

    /**
     * Teacher Grading Journey: Notify Classroom to update student gradebook entry
     */
    passGrade(gradeData) {
      console.log('[ClassroomAddonSDK] passGrade:', gradeData);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'CLASSROOM_ADDON_GRADE_PASSBACK',
          payload: gradeData,
          context: { ...context }
        }, '*');
      }
    }
  };

  window.gapi = window.gapi || {};
  window.gapi.classroom = window.gapi.classroom || {};
  window.gapi.classroom.addons = classroomAddons;
  window.ClassroomAddonBridge = classroomAddons;

  console.log('[ClassroomAddonSDK] Loaded with context:', context);
})(window);
