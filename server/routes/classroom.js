import express from 'express';
import { classroomService } from '../services/classroomService.js';

export const classroomRouter = express.Router();

/**
 * Handles incoming attachment creation request from Google Classroom iframe
 * (Teacher selects and attaches the Socratic Activity).
 */
classroomRouter.post('/create-addon-attachment', (req, res) => {
  try {
    const {
      courseId,
      itemId,
      itemType = 'courseWork',
      activityData
    } = req.body;

    const attachment = classroomService.createAttachment({
      ...activityData,
      courseId,
      itemId,
      itemType
    });

    // In a live Google Classroom integration, the add-on sends this back via the
    // Classroom Add-on JavaScript SDK: window.gapi.classroom.addons.createAddOnAttachment(...)
    res.json({
      success: true,
      attachment,
      attachmentUrl: `/student-work.html?attachmentId=${attachment.id}&courseId=${courseId || ''}&itemId=${itemId || ''}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint called when Google Classroom requests attachment metadata
 */
classroomRouter.get('/attachment-metadata/:id', (req, res) => {
  const attachment = classroomService.getAttachment(req.params.id);
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  res.json({
    title: `SocratesAI: ${attachment.title}`,
    studentViewUri: `/student-work.html?attachmentId=${attachment.id}`,
    teacherViewUri: `/teacher-review.html?attachmentId=${attachment.id}`,
    studentWorkReviewUri: `/teacher-review.html?attachmentId=${attachment.id}`
  });
});
