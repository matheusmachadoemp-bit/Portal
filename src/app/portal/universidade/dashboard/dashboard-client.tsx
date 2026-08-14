"use client";

import Link from "next/link";
import { UniversityTabs } from "../university-tabs";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatMinutes } from "@/lib/university";
import { AlertTriangle, ClipboardCheck, Star, Trophy, ArrowRight } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = ["#2952E3", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#14b8a6", "#f97316"];

export function DashboardClient({
  isAdmin,
  colaboradoresCadastrados,
  colaboradoresTreinados,
  cursosConcluidos,
  cursosPendentes,
  horasRealizadas,
  mediaConclusao,
  mediaAvaliacoes,
  certificadosEmitidos,
  topCourses,
  byCategory,
  monthlyEvolution,
  atrasados,
  avaliacoesPendentes,
  topPerformer,
  mostCoursesUserName,
  mostCoursesCount,
}: {
  isAdmin: boolean;
  colaboradoresCadastrados: number;
  colaboradoresTreinados: number;
  cursosConcluidos: number;
  cursosPendentes: number;
  horasRealizadas: number;
  mediaConclusao: number;
  mediaAvaliacoes: number;
  certificadosEmitidos: number;
  topCourses: { name: string; matriculas: number }[];
  byCategory: { name: string; value: number }[];
  monthlyEvolution: { month: string; concluidos: number }[];
  atrasados: number;
  avaliacoesPendentes: number;
  topPerformer: { name: string; xp: number } | null;
  mostCoursesUserName: string | null;
  mostCoursesCount: number;
}) {
  const taxaConclusaoData = [
    { name: "Concluído", value: mediaConclusao },
    { name: "Restante", value: 100 - mediaConclusao },
  ];

  return (
    <div className="space-y-6">
      <UniversityTabs isAdmin={isAdmin} />

      <SortableStatCards
        storageKey="universidade-dashboard-colaboradores-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "colaboradores-cadastrados", label: "Colaboradores cadastrados", value: String(colaboradoresCadastrados), icon: "Users" },
          { key: "colaboradores-treinados", label: "Colaboradores treinados", value: String(colaboradoresTreinados), icon: "GraduationCap", color: "#22c55e" },
          { key: "cursos-concluidos", label: "Cursos concluídos", value: String(cursosConcluidos), icon: "CheckCircle2", color: "#22c55e" },
          { key: "cursos-pendentes", label: "Cursos pendentes", value: String(cursosPendentes), icon: "Clock", color: "#eab308" },
        ]}
      />
      <SortableStatCards
        storageKey="universidade-dashboard-treinamento-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "horas-treinamento", label: "Horas de treinamento", value: formatMinutes(horasRealizadas * 60), icon: "Timer" },
          { key: "media-conclusao", label: "Média de conclusão", value: `${mediaConclusao}%`, icon: "TrendingUp" },
          { key: "media-avaliacoes", label: "Média das avaliações", value: `${mediaAvaliacoes}%`, icon: "ClipboardCheck" },
          { key: "certificados-emitidos", label: "Certificados emitidos", value: String(certificadosEmitidos), icon: "Award", color: "#a855f7" },
        ]}
      />

      {isAdmin && (atrasados > 0 || avaliacoesPendentes > 0 || topPerformer || mostCoursesUserName) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Section title="Pendências importantes">
            <div className="space-y-2">
              {atrasados > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-white">
                    <AlertTriangle size={14} className="text-red-400" /> {atrasados} colaborador(es) com cursos obrigatórios atrasados
                  </span>
                  <Link href="/portal/universidade/gestor" className="text-xs text-nord-blue-light hover:text-white flex items-center gap-1">
                    Ver detalhes <ArrowRight size={11} />
                  </Link>
                </div>
              )}
              {avaliacoesPendentes > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-white">
                    <ClipboardCheck size={14} className="text-amber-400" /> {avaliacoesPendentes} avaliação(ões) reprovada(s) aguardando nova tentativa
                  </span>
                </div>
              )}
              {atrasados === 0 && avaliacoesPendentes === 0 && <p className="text-sm text-nord-gray">Nenhuma pendência no momento. 🎉</p>}
            </div>
          </Section>

          <Section title="Destaques">
            <div className="space-y-2">
              {topPerformer && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-white">
                    <Star size={14} className="text-amber-400" /> Maior pontuação do mês: <strong>{topPerformer.name}</strong>
                  </span>
                  <Badge tone="info">{topPerformer.xp} XP</Badge>
                </div>
              )}
              {mostCoursesUserName && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-white">
                    <Trophy size={14} className="text-emerald-400" /> Mais cursos concluídos: <strong>{mostCoursesUserName}</strong>
                  </span>
                  <Badge tone="success">{mostCoursesCount} curso(s)</Badge>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Section title="Cursos mais assistidos">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topCourses} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis type="number" stroke="#9a9aa2" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#9a9aa2" fontSize={11} width={140} />
                <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
                <Bar dataKey="matriculas" fill="#2952E3" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <Section title="Taxa de conclusão">
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={taxaConclusaoData} dataKey="value" innerRadius={60} outerRadius={85} startAngle={90} endAngle={-270}>
                  <Cell fill="#2952E3" />
                  <Cell fill="#2a2a2e" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <p className="absolute inset-0 flex items-center justify-center text-white text-2xl font-semibold pointer-events-none">
              {mediaConclusao}%
            </p>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Matrículas por categoria">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Evolução mensal de cursos concluídos">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="month" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Line type="monotone" dataKey="concluidos" stroke="#22c55e" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      </div>
    </div>
  );
}
