"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, PlayCircle, Clock, Award } from "lucide-react";
import { UniversityTabs } from "../university-tabs";
import { CourseBuilderModal } from "../course-builder-modal";
import { ConfirmDialog } from "@/components/ui/modal";
import { Badge, ProgressBar } from "@/components/ui/stat-card";
import { COURSE_STATUS_OPTIONS, formatMinutes } from "@/lib/university";
import type { CourseDTO } from "../university-types";

type CourseWithMeta = CourseDTO & { totalMinutes: number; hasQuiz: boolean };
type Enrollment = { courseId: string; status: string; progressPercent: number };

export function CoursesClient({
  initialCourses,
  myEnrollments,
  isAdmin,
  empresas,
  canCreate,
}: {
  initialCourses: CourseWithMeta[];
  myEnrollments: Enrollment[];
  isAdmin: boolean;
  empresas: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState(initialCourses);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState<CourseDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const enrollmentByCourse = useMemo(() => new Map(myEnrollments.map((e) => [e.courseId, e])), [myEnrollments]);

  const categories = useMemo(() => [...new Set(courses.map((c) => c.category).filter(Boolean))] as string[], [courses]);

  const filtered = courses.filter((c) => {
    if (!isAdmin && c.status !== "PUBLICADO") return false;
    if (category && c.category !== category) return false;
    if (query.trim() && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  async function refresh() {
    const res = await fetch("/api/university/courses");
    const data = await res.json();
    setCourses(data.courses);
  }

  async function enroll(courseId: string) {
    await fetch("/api/university/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });
    router.push(`/portal/universidade/cursos/${courseId}`);
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    setDeleteError(null);
    const res = await fetch(`/api/university/courses/${confirmDeleteId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Não foi possível excluir.");
      return;
    }
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <UniversityTabs />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar curso..."
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue w-56"
          />
          <button
            onClick={() => setCategory(null)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${!category ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
          >
            Todas categorias
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${category === c ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
            >
              {c}
            </button>
          ))}
        </div>
        {isAdmin && canCreate && (
          <button
            onClick={() => {
              setEditing(null);
              setShowBuilder(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo curso
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const enrollment = enrollmentByCourse.get(c.id);
          const statusOpt = COURSE_STATUS_OPTIONS.find((s) => s.key === c.status);
          return (
            <div key={c.id} className="nord-card overflow-hidden flex flex-col">
              <div className="h-28 bg-nord-panel flex items-center justify-center">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <PlayCircle size={32} className="text-nord-gray" />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-white font-medium text-sm">{c.name}</h4>
                  {isAdmin && <Badge tone={statusOpt?.tone ?? "default"}>{statusOpt?.label}</Badge>}
                </div>
                {c.description && <p className="text-xs text-nord-gray mb-2 line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {c.category && <Badge>{c.category}</Badge>}
                  {c.mandatory && <Badge tone="danger">Obrigatório</Badge>}
                  {c.hasQuiz && <Badge tone="info">Com avaliação</Badge>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-nord-gray mb-3">
                  <span className="flex items-center gap-1"><Clock size={11} /> {formatMinutes(c.totalMinutes)}</span>
                  <span className="flex items-center gap-1"><PlayCircle size={11} /> {c.modules.length} aula(s)</span>
                  {isAdmin && <span className="flex items-center gap-1"><Award size={11} /> {c._count?.enrollments ?? 0} matriculados</span>}
                </div>

                {enrollment && enrollment.progressPercent > 0 && (
                  <div className="mb-3">
                    <ProgressBar percent={enrollment.progressPercent} />
                    <p className="text-[10px] text-nord-gray mt-1">{enrollment.progressPercent}% concluído</p>
                  </div>
                )}

                <div className="mt-auto flex items-center gap-2">
                  <button
                    onClick={() => enroll(c.id)}
                    className="flex-1 bg-nord-blue hover:bg-nord-blue-light text-white text-xs font-medium rounded-lg py-2"
                  >
                    {enrollment ? (enrollment.status === "CONCLUIDO" ? "Revisar" : "Continuar") : "Iniciar curso"}
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setEditing(c);
                          setShowBuilder(true);
                        }}
                        className="text-nord-gray hover:text-white p-2"
                      >
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(c.id)} className="text-nord-gray hover:text-red-400 p-2">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-nord-gray col-span-full text-center py-8">Nenhum curso encontrado.</p>}
      </div>

      <CourseBuilderModal
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        onSaved={() => {
          setShowBuilder(false);
          refresh();
        }}
        course={editing}
        empresas={empresas}
      />

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir curso"
        message={deleteError ?? "Tem certeza que deseja excluir este curso? Todos os módulos e avaliações serão removidos."}
        onConfirm={doDelete}
        onCancel={() => {
          setConfirmDeleteId(null);
          setDeleteError(null);
        }}
        confirmLabel={deleteError ? "Tentar novamente" : "Excluir"}
        danger
      />
    </div>
  );
}
