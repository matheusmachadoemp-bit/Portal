export type ModuleDTO = {
  id: string;
  title: string;
  type: string;
  videoUrl: string | null;
  durationSeconds: number;
  pdfUrl: string | null;
  content: string | null;
  order: number;
};

export type QuestionOptionDTO = { id: string; text: string; correct: boolean; order: number };
export type QuestionDTO = { id: string; text: string; type: string; order: number; options: QuestionOptionDTO[] };
export type QuizDTO = {
  id: string;
  minScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  questions: QuestionDTO[];
};

export type CourseDTO = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  cargo: string | null;
  empresaId: string | null;
  empresa?: { name: string } | null;
  imageUrl: string | null;
  instructor: string | null;
  cargaHoraria: number;
  status: string;
  mandatory: boolean;
  version: number;
  order: number;
  modules: ModuleDTO[];
  quiz: QuizDTO | null;
  _count?: { enrollments: number };
};

export type TrackCourseDTO = { courseId: string; order: number; course: { id: string; name: string; cargaHoraria: number; status: string } };
export type TrackDTO = {
  id: string;
  key: string;
  name: string;
  cargo: string | null;
  empresaId: string | null;
  empresa?: { name: string } | null;
  description: string | null;
  icon: string;
  color: string;
  active: boolean;
  courses: TrackCourseDTO[];
};

export type EnrollmentDTO = {
  id: string;
  courseId: string;
  status: string;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
};
