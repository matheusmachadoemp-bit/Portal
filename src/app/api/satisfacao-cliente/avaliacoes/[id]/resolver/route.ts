import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * "Registrar solução" de uma avaliação — só quando já está EM_ATENDIMENTO. Recebe
 * `resolucaoTexto` (obrigatório) e `motivoTagId` (opcional — decisão já validada: quem escolhe o
 * motivo é o responsável, ao tratar a ocorrência, nunca o cliente no formulário público; fica
 * opcional aqui porque nem toda avaliação assumida é necessariamente crítica/tem um motivo de
 * insatisfação claro pra categorizar). Quando informado, valida que pertence à loja OU é
 * compartilhado (`empresaId = null`) — mesmo critério de UNION já usado pelas perguntas
 * (`getRegularQuestions`, src/lib/customer-survey-server.ts).
 *
 * Quem pode resolver: só quem assumiu (é o `responsavelId` gravado por `POST .../assumir`) OU um
 * Administrador — critério explícito do pedido, sem estender pra outros cargos (Gestor/Gerente
 * incluído) por decisão própria: é mais fácil abrir isso depois se fizer falta na prática do que
 * restringir depois de já ter liberado mais gente do que devia.
 *
 * Mesmo gate de `canExecute` (não `canEdit`) que `POST .../assumir` usa — ver comentário lá.
 * Mesmo padrão de `updateMany` condicional (`where: { id, status: "EM_ATENDIMENTO" }`) por
 * consistência/defesa em profundidade, ainda que o cenário de corrida aqui seja bem menos
 * provável (dois "resolver" simultâneos do mesmo responsável, ou um Administrador resolvendo no
 * exato instante em que o responsável também resolve).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canExecute", "avaliacoes"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite tratar avaliações de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await prisma.customerSurveyResponse.findUnique({
    where: { id },
    select: { empresaId: true, status: true, responsavelId: true },
  });
  if (!existing) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  if (existing.status === "NOVA") {
    return NextResponse.json({ error: "Essa avaliação ainda não foi assumida por ninguém." }, { status: 400 });
  }
  if (existing.status === "RESOLVIDA") {
    return NextResponse.json({ error: "Essa avaliação já foi resolvida." }, { status: 400 });
  }

  const isResponsavel = existing.responsavelId === session.user.id;
  const isAdmin = session.user.role === "ADMINISTRADOR";
  if (!isResponsavel && !isAdmin) {
    return NextResponse.json(
      { error: "Só quem assumiu esta avaliação (ou um Administrador) pode registrar a solução." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const resolucaoTexto = String(body?.resolucaoTexto ?? "").trim();
  if (!resolucaoTexto) {
    return NextResponse.json({ error: "Descreva como a situação foi resolvida." }, { status: 400 });
  }

  const motivoTagId: string | null = body?.motivoTagId || null;
  if (motivoTagId) {
    const tag = await prisma.customerSurveyReasonTag.findFirst({
      where: { id: motivoTagId, OR: [{ empresaId: null }, { empresaId: existing.empresaId }] },
      select: { id: true },
    });
    if (!tag) return NextResponse.json({ error: "Motivo inválido." }, { status: 400 });
  }

  const result = await prisma.customerSurveyResponse.updateMany({
    where: { id, status: "EM_ATENDIMENTO" },
    data: { status: "RESOLVIDA", resolucaoTexto, motivoTagId, resolvidoEm: new Date() },
  });

  if (result.count === 0) {
    // Corrida perdida entre a checagem de status acima e este update (ex.: outro responsável
    // resolvendo no mesmo instante) — nunca solta um sucesso falso.
    return NextResponse.json({ error: "Essa avaliação já foi resolvida por outra pessoa." }, { status: 409 });
  }

  const response = await prisma.customerSurveyResponse.findUnique({
    where: { id },
    include: { responsavel: { select: { id: true, name: true } }, motivoTag: { select: { id: true, nome: true } } },
  });
  return NextResponse.json({ response });
}
