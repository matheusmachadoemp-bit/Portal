// Hierarquia (a partir de set/2026): Curso -> Módulo -> Aula. Avaliação e
// certificado são por MÓDULO — ver prisma/migrations/20260915130000_universidade_curso_modulo_aula.
// "Trilhas de Aprendizagem" foram descontinuadas: TrackDTO/TrackCourseDTO
// removidos.
//
// Estes tipos já refletem o formato novo que a API devolve, e os componentes
// cliente (courses-client.tsx, course-builder-modal.tsx, player-client.tsx) já
// foram adaptados nesta própria Fase 2 pra consumir a hierarquia
// Curso -> Módulo -> Aula (aulas agrupadas por módulo, avaliação/certificado
// por módulo). Refinamento visual (layout dos grupos, indicação de progresso
// por módulo etc.) continua em aberto pra Fase 3, mas o formato de dado já
// está correto e em uso.

export type LessonDTO = {
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

export type ModuleDTO = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  cargaHoraria: number;
  order: number;
  lessons: LessonDTO[];
  quiz: QuizDTO | null;
  _count?: { certificates: number };
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
  _count?: { enrollments: number };
};

export type EnrollmentDTO = {
  id: string;
  courseId: string;
  status: string;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
};

export type ModuleEnrollmentDTO = {
  id: string;
  moduleId: string;
  status: string;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  certificateCode?: string | null;
};
