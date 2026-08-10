"use client";

import { UniversityTabs } from "../university-tabs";
import { StatCard, Section } from "@/components/ui/stat-card";
import { formatMinutes } from "@/lib/university";
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
}: {
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
}) {
  return (
    <div className="space-y-6">
      <UniversityTabs />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Colaboradores cadastrados" value={String(colaboradoresCadastrados)} icon="Users" />
        <StatCard label="Colaboradores treinados" value={String(colaboradoresTreinados)} icon="GraduationCap" color="#22c55e" />
        <StatCard label="Cursos concluídos" value={String(cursosConcluidos)} icon="CheckCircle2" color="#22c55e" />
        <StatCard label="Cursos pendentes" value={String(cursosPendentes)} icon="Clock" color="#eab308" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Horas de treinamento" value={formatMinutes(horasRealizadas * 60)} icon="Timer" />
        <StatCard label="Média de conclusão" value={`${mediaConclusao}%`} icon="TrendingUp" />
        <StatCard label="Média das avaliações" value={`${mediaAvaliacoes}%`} icon="ClipboardCheck" />
        <StatCard label="Certificados emitidos" value={String(certificadosEmitidos)} icon="Award" color="#a855f7" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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

        <Section title="Matrículas por categoria">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Section>
      </div>

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
  );
}
