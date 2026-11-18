import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const curriculumDir = path.join(__dirname, '..', 'data', 'curriculum');

class LessonPlanService {
  constructor() {
    this.curricula = new Map();
    this.customLessonPlans = new Map();
    this.loadDefaultCurriculum();
  }

  loadDefaultCurriculum() {
    try {
      const mhf4uPath = path.join(curriculumDir, 'mhf4u.json');
      if (fs.existsSync(mhf4uPath)) {
        const raw = fs.readFileSync(mhf4uPath, 'utf-8');
        const data = JSON.parse(raw);
        this.curricula.set(data.courseId, data);
      }
    } catch (e) {
      console.warn('[LessonPlanService] Error loading curriculum:', e.message);
    }
  }

  getCurriculum(courseId = 'MHF4U') {
    return this.curricula.get(courseId) || this.curricula.get('MHF4U') || null;
  }

  getLesson(courseId = 'MHF4U', lessonId = 'lesson-laws-of-logarithms') {
    const course = this.getCurriculum(courseId);
    if (!course) return null;

    for (const unit of course.units || []) {
      if (unit.lessons) {
        const found = unit.lessons.find(l => l.id === lessonId);
        if (found) {
          return {
            courseId: course.courseId,
            courseName: course.courseName,
            unitId: unit.id,
            unitTitle: unit.title,
            ...found
          };
        }
      }
    }
    return null;
  }

  getExerciseByLevel(courseId = 'MHF4U', lessonId = 'lesson-laws-of-logarithms', level = 'B') {
    const lesson = this.getLesson(courseId, lessonId);
    if (!lesson || !lesson.exerciseBank) return null;
    const key = `level${level.toUpperCase()}`;
    return lesson.exerciseBank[key] || lesson.exerciseBank.levelB || null;
  }

  saveCustomLessonPlan(lessonPlanData) {
    const id = lessonPlanData.id || `lp-${Date.now()}`;
    const plan = {
      ...lessonPlanData,
      id,
      updatedAt: new Date().toISOString()
    };
    this.customLessonPlans.set(id, plan);
    return plan;
  }

  getCustomLessonPlan(id) {
    return this.customLessonPlans.get(id) || null;
  }
}

export const lessonPlanService = new LessonPlanService();
