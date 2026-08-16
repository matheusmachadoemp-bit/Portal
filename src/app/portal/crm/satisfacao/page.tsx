import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { SatisfacaoClient } from "./satisfacao-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { startOfMonth, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

function npsScore(promotores: number, neutros: number, detratores: number) {
  const total = promotores + neutros + detratores;
  if (!total) return 0;
  return ((promotores - detratores) / total) * 100;
}

export default async function SatisfacaoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const isGrupo = ctx?.mode === "grupo";

  const respostas = await prisma.npsResponse.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { createdAt: "desc" },
    include: { cliente: { select: { nome: true } }, empresa: { select: { id: true, name: true, color: true } }, responsavel: { select: { name: true } } },
  });

  function classify(nota: number): "promotor" | "neutro" | "detrator" {
    if (nota >= 9) return "promotor";
    if (nota >= 7) return "neutro";
    return "detrator";
  }

  const geral = { promotores: 0, neutros: 0, detratores: 0 };
  const porLoja = new Map<string, { nome: string; color: string; promotores: number; neutros: number; detratores: number }>();

  for (const r of respostas) {
    const c = classify(r.nota);
    geral[c === "promotor" ? "promotores" : c === "neutro" ? "neutros" : "detratores"]++;
    const loja = porLoja.get(r.empresa.id) ?? { nome: r.empresa.name, color: r.empresa.color, promotores: 0, neutros: 0, detratores: 0 };
    loja[c === "promotor" ? "promotores" : c === "neutro" ? "neutros" : "detratores"]++;
    porLoja.set(r.empresa.id, loja);
  }

  const evolucaoMensal = Array.from({ length: 6 }, (_, idx) => {
    const mes = startOfMonth(subMonths(new Date(), 5 - idx));
    const mesFim = startOfMonth(subMonths(new Date(), 4 - idx));
    const doMes = respostas.filter((r) => r.createdAt >= mes && r.createdAt < mesFim);
    const p = doMes.filter((r) => classify(r.nota) === "promotor").length;
    const n = doMes.filter((r) => classify(r.nota) === "neutro").length;
    const d = doMes.filter((r) => classify(r.nota) === "detrator").length;
    return { mes: format(mes, "MMM/yy", { locale: ptBR }), nps: npsScore(p, n, d), respostas: doMes.length };
  });

  const insatisfeitos = respostas
    .filter((r) => r.nota <= 6)
    .map((r) => ({
      id: r.id,
      cliente: r.cliente?.nome ?? "Cliente não identificado",
      nota: r.nota,
      comentario: r.comentario,
      status: r.status,
      responsavel: r.responsavel?.name ?? null,
      lojaNome: r.empresa.name,
      lojaColor: r.empresa.color,
      createdAt: r.createdAt.toISOString(),
    }));

  return (
    <PageContainer title="CRM" subtitle="Satisfação / NPS">
      <div className="space-y-6">
        <SatisfacaoClient
          npsGeral={npsScore(geral.promotores, geral.neutros, geral.detratores)}
          distribuicaoGeral={geral}
          porLoja={Array.from(porLoja.values()).map((l) => ({ ...l, nps: npsScore(l.promotores, l.neutros, l.detratores) }))}
          evolucaoMensal={evolucaoMensal}
          insatisfeitos={insatisfeitos}
          isGrupo={isGrupo}
          totalRespostas={respostas.length}
        />
      </div>
    </PageContainer>
  );
}
