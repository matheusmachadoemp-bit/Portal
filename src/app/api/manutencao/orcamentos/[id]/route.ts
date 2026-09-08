import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { MANAGER_ROLES, logChamadoHistorico, notifyManutencaoUser } from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

const PRE_APROVACAO_STATUSES = ["ABERTO", "AGUARDANDO_AVALIACAO", "AGUARDANDO_ORCAMENTO", "AGUARDANDO_APROVACAO"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar orçamentos." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.orcamento.findUnique({ where: { id }, include: { chamado: true, prestador: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.chamado.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  // Transição/edição de um orçamento já existente (inclui aprovar/recusar), nunca cria um
  // Orcamento novo (isso é feito em POST /api/manutencao/chamados/[id]/orcamentos) — mesmo
  // critério de canEdit já usado em estoque/contagens/[id] e estoque/transferencias/[id].
  if (!(await hasModulePermission(session.user.id, "manutencao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar orçamentos de manutenção." },
      { status: 403 }
    );
  }

  const body = await req.json();
  if (body.status === "RECUSADO" && !(body.motivoRecusa || existing.motivoRecusa)) {
    return NextResponse.json({ error: "Informe o motivo da recusa." }, { status: 400 });
  }

  const valorMaoDeObra = body.valorMaoDeObra !== undefined ? Number(body.valorMaoDeObra) || 0 : existing.valorMaoDeObra;
  const valorPecas = body.valorPecas !== undefined ? Number(body.valorPecas) || 0 : existing.valorPecas;

  const orcamento = await prisma.orcamento.update({
    where: { id },
    data: {
      descricao: body.descricao !== undefined ? body.descricao || null : undefined,
      valorMaoDeObra: body.valorMaoDeObra !== undefined ? valorMaoDeObra : undefined,
      valorPecas: body.valorPecas !== undefined ? valorPecas : undefined,
      valorTotal: body.valorMaoDeObra !== undefined || body.valorPecas !== undefined ? valorMaoDeObra + valorPecas : undefined,
      prazo: body.prazo !== undefined ? body.prazo || null : undefined,
      garantia: body.garantia !== undefined ? body.garantia || null : undefined,
      status: body.status ?? undefined,
      motivoRecusa: body.motivoRecusa !== undefined ? body.motivoRecusa || null : undefined,
    },
  });

  if (body.status && body.status !== existing.status) {
    if (body.status === "APROVADO") {
      await logChamadoHistorico(existing.chamadoId, session.user.id, "ORCAMENTO_APROVADO", `${existing.prestador.nome} — R$ ${orcamento.valorTotal.toFixed(2)}`);
      if (PRE_APROVACAO_STATUSES.includes(existing.chamado.status)) {
        await prisma.chamado.update({ where: { id: existing.chamadoId }, data: { status: "APROVADO" } });
      }
      const notifyId = existing.chamado.responsavelId ?? existing.chamado.solicitanteId;
      if (notifyId !== session.user.id) {
        await notifyManutencaoUser(
          notifyId,
          "ORCAMENTO_APROVADO",
          "Orçamento aprovado",
          `O orçamento de ${existing.prestador.nome} para o chamado "${existing.chamado.titulo}" (${existing.chamado.protocolo}) foi aprovado.`,
          existing.chamadoId
        );
      }
    } else if (body.status === "RECUSADO") {
      await logChamadoHistorico(existing.chamadoId, session.user.id, "ORCAMENTO_RECUSADO", body.motivoRecusa || existing.motivoRecusa || undefined);
      const notifyId = existing.chamado.responsavelId ?? existing.chamado.solicitanteId;
      if (notifyId !== session.user.id) {
        await notifyManutencaoUser(
          notifyId,
          "ORCAMENTO_RECUSADO",
          "Orçamento recusado",
          `O orçamento de ${existing.prestador.nome} para o chamado "${existing.chamado.titulo}" (${existing.chamado.protocolo}) foi recusado.`,
          existing.chamadoId
        );
      }
    }
  }

  return NextResponse.json({ orcamento });
}
