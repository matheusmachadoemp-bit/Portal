import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * "Assumir atendimento" de uma avaliação — grava `responsavelId`/`assumidoEm` e muda o status
 * de NOVA pra EM_ATENDIMENTO. Gate por `canExecute` (não `canEdit`): é uma ação operacional do
 * dia a dia (tratar uma reclamação), não uma edição da configuração do módulo (Perguntas/Mesas,
 * que usam `canCreate`/`canEdit`) — mesmo racional documentado em `ACCESS_LEVEL_TO_MODULE_FLAGS`
 * (src/lib/permissions.ts) pra `tarefas:checklist`. Com os níveis padrão da Fase 1, isso libera
 * Administrador/Gestor/Gerente/Supervisor (todos EDITAR ou TOTAL, que incluem canExecute) e
 * bloqueia Funcionário/Líder/Marketing/Financeiro (só VISUALIZAR).
 *
 * Trava a corrida com o mesmo padrão atômico de `checkRateLimit` (src/lib/rate-limit.ts): um
 * `updateMany` condicionado a `status: "NOVA"` só afeta a linha se ela ainda estiver disponível
 * — nunca "lê o status, decide no código, grava depois" (a janela de corrida clássica que
 * deixaria 2 cliques simultâneos assumirem os dois "com sucesso"). `count === 0` depois do
 * update significa que a corrida foi perdida (ou o estado já não era NOVA por outro motivo) —
 * busca de novo só pra devolver uma mensagem útil, nunca fica soltando um sucesso falso.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canExecute", "avaliacoes"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite tratar avaliações de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await prisma.customerSurveyResponse.findUnique({ where: { id }, select: { empresaId: true } });
  if (!existing) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const result = await prisma.customerSurveyResponse.updateMany({
    where: { id, status: "NOVA" },
    data: { status: "EM_ATENDIMENTO", responsavelId: session.user.id, assumidoEm: new Date() },
  });

  if (result.count === 0) {
    const current = await prisma.customerSurveyResponse.findUnique({
      where: { id },
      select: { status: true, responsavel: { select: { name: true } } },
    });
    if (current?.status === "EM_ATENDIMENTO") {
      const quem = current.responsavel?.name ? ` por ${current.responsavel.name}` : "";
      return NextResponse.json({ error: `Essa avaliação já foi assumida${quem}.` }, { status: 409 });
    }
    if (current?.status === "RESOLVIDA") {
      return NextResponse.json({ error: "Essa avaliação já foi resolvida." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível assumir esta avaliação." }, { status: 409 });
  }

  const response = await prisma.customerSurveyResponse.findUnique({
    where: { id },
    include: { responsavel: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ response });
}
