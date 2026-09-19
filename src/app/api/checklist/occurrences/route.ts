import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateChecklistOccurrences, refreshOccurrenceStatuses } from "@/lib/checklist-server";
import { spDateKey, spStartOfDay } from "@/lib/checklist";
import { hasModulePermission } from "@/lib/authz";

const OCCURRENCE_INCLUDE = {
  template: {
    select: {
      id: true,
      name: true,
      setor: true,
      turno: true,
      fotoChecklist: true,
      empresa: { select: { id: true, name: true } },
    },
  },
  responsavel: { select: { id: true, name: true } },
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "tarefas", "canView", "checklist"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Checklist." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const dateKey = searchParams.get("date") || spDateKey();

  await generateChecklistOccurrences(empresaIds, dateKey);

  const day = spStartOfDay(dateKey);
  const existing = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds }, date: day },
    select: { id: true },
  });
  await refreshOccurrenceStatuses(existing.map((o) => o.id));
  // O escalonamento (processChecklistEscalations) NÃO roda mais aqui: o
  // workflow .github/workflows/checklist-escalations.yml já cobre isso a
  // cada 5 minutos independente de alguém estar com a tela aberta/trocando
  // a data, então repetir a varredura completa a cada carregamento só
  // custava tempo à toa (achado #208). Mesmo ajuste já feito antes na
  // página (server component), ver comentário em
  // src/app/portal/tarefas/checklist/page.tsx.
  //
  // Atenção, processChecklistEscalations não é só notificação/escalonamento
  // — é também o ÚNICO código que corrige o status de uma ocorrência de
  // ATRASADO para NAO_REALIZADO (quando o atraso passa de
  // naoRealizadoMinutos, ver checklist-server.ts). O refreshOccurrenceStatuses
  // chamado logo acima recalcula o status "ao vivo" (inclusive marca
  // ATRASADO), mas nunca avança pra NAO_REALIZADO por conta própria —
  // computeOccurrenceStatus só preserva NAO_REALIZADO se ele já estava
  // setado, nunca o atribui (ver src/lib/checklist.ts). Sem essa chamada
  // aqui, quem faz essa correção de status é só o cron (GET
  // /api/checklist/escalations/run) — e o cron só processa ocorrências de
  // HOJE (dateKey = spDateKey(), sem parâmetro), nunca revisita uma data
  // passada.
  //
  // Sob cron saudável isso não muda nada na prática: pra ocorrências de
  // hoje, o cron corrige o status dentro de ~5 min, antes de "virar
  // passado". Mas se o cron ficar indisponível durante a janela em que uma
  // ocorrência cruza o limiar de NAO_REALIZADO, ela fica presa em ATRASADO
  // para sempre — não existe mais nenhuma rota nem cron que revisite dias
  // passados para corrigir isso. Lacuna aceita conscientemente por enquanto
  // (baixo risco, mesmo padrão já em vigor na página antes desta mudança);
  // o fix de verdade (cron passar a revisitar dias anteriores) é uma task
  // separada.

  // Mesmo critério da página (server component): quem só executa (sem
  // canCreate na subcategoria "checklist") só pode ver os checklists dos
  // quais é responsável — essa rota é chamada ao trocar a data no seletor,
  // então precisa repetir o mesmo filtro aplicado no carregamento inicial.
  const canManageChecklist = await hasModulePermission(session.user.id, "tarefas", "canCreate", "checklist");
  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds }, date: day, ...(canManageChecklist ? {} : { responsavelId: session.user.id }) },
    include: OCCURRENCE_INCLUDE,
    orderBy: { dueAt: "asc" },
  });

  return NextResponse.json({ occurrences, date: dateKey });
}
