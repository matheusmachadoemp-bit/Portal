import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { format } from "date-fns";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "tarefas";

  let csv = "";
  if (type === "tarefas") {
    const tasks = await prisma.marketingTask.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { responsavel: { select: { name: true } }, empresa: { select: { name: true } } },
      orderBy: { date: "asc" },
    });
    csv = toCsv(
      tasks.map((t) => ({
        titulo: t.title,
        loja: t.empresa.name,
        status: t.status,
        prioridade: t.priority,
        categoria: t.category ?? "",
        rede: t.socialNetwork ?? "",
        data: t.date ? format(t.date, "dd/MM/yyyy") : "",
        responsavel: t.responsavel?.name ?? "",
      }))
    );
  } else if (type === "campanhas") {
    const campaigns = await prisma.marketingCampaign.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { responsavel: { select: { name: true } }, empresa: { select: { name: true } } },
      orderBy: { startDate: "desc" },
    });
    csv = toCsv(
      campaigns.map((c) => ({
        nome: c.name,
        loja: c.empresa.name,
        status: c.status,
        inicio: format(c.startDate, "dd/MM/yyyy"),
        fim: format(c.endDate, "dd/MM/yyyy"),
        orcamento: c.budget,
        investido: c.investimento,
        retorno: c.retorno,
        responsavel: c.responsavel?.name ?? "",
      }))
    );
  } else if (type === "kpis") {
    const entries = await prisma.marketingEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
    });
    csv = toCsv(
      entries.map((e) => ({
        periodo: format(e.date, "MM/yyyy"),
        investimento: e.investimentoTrafego,
        receita: e.receitaTrafego,
        pedidos: e.pedidosCampanha,
        visitas: e.visitasSite,
        conversoes: e.conversoes,
        seguidores: e.seguidoresFim,
        alcance: e.alcance,
        impressoes: e.impressoes,
      }))
    );
  } else {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marketing-${type}.csv"`,
    },
  });
}
