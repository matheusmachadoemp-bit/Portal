import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * Detalhe de uma avaliação — todas as respostas (com a pergunta de cada uma), identificação do
 * cliente e histórico de tratamento (quem assumiu, quando, resolução, motivo). É a rota que o
 * botão "VER AVALIAÇÃO" do push (Fase 3, `notifyCriticalResponse` já aponta pra
 * `/portal/satisfacao-cliente/avaliacoes/[id]`) e o "Ver" da tabela de Avaliações vão abrir.
 *
 * Mesmo padrão de acesso a um registro EXISTENTE por id já usado por `.../assumir`/`.../resolver`
 * (Fase 3) e por `GET /api/manutencao/chamados/[id]`: `assertEmpresaAccess` contra a `empresaId`
 * do próprio registro, não `requireActiveSingleEmpresa()` — ver uma avaliação específica não
 * depende de qual loja está "ativa" no cookie da sessão, só de o usuário ter acesso à loja DELA.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "avaliacoes"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver as avaliações de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const avaliacao = await prisma.customerSurveyResponse.findUnique({
    where: { id },
    include: {
      empresa: { select: { id: true, name: true, color: true } },
      cliente: { select: { id: true, nome: true, telefone: true, dataNascimento: true } },
      table: { select: { id: true, numero: true } },
      garcomIndicado: { select: { id: true, name: true } },
      responsavel: { select: { id: true, name: true } },
      motivoTag: { select: { id: true, nome: true } },
      respostas: {
        include: { question: { select: { id: true, titulo: true, tema: true, tipo: true } } },
      },
    },
  });
  if (!avaliacao) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, avaliacao.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  return NextResponse.json({
    avaliacao: {
      id: avaliacao.id,
      empresa: avaliacao.empresa,
      submittedAt: avaliacao.submittedAt.toISOString(),
      mesa: avaliacao.table ? { id: avaliacao.table.id, numero: avaliacao.table.numero } : null,
      cliente: {
        id: avaliacao.cliente?.id ?? null,
        nome: avaliacao.nomeInformado,
        telefone: avaliacao.telefoneInformado,
        dataNascimento: avaliacao.dataNascimentoInformada ? avaliacao.dataNascimentoInformada.toISOString() : null,
      },
      garcomIndicado: avaliacao.garcomIndicado ? { id: avaliacao.garcomIndicado.id, nome: avaliacao.garcomIndicado.name } : null,
      notaGeral: avaliacao.notaGeral,
      critica: avaliacao.critica,
      sugestao: avaliacao.sugestao,
      respostas: avaliacao.respostas.map((r) => ({
        id: r.id,
        pergunta: { id: r.question.id, titulo: r.question.titulo, tema: r.question.tema, tipo: r.question.tipo },
        valorNota: r.valorNota,
        valorGostei: r.valorGostei,
        valorTexto: r.valorTexto,
      })),
      tratamento: {
        status: avaliacao.status,
        responsavel: avaliacao.responsavel ? { id: avaliacao.responsavel.id, nome: avaliacao.responsavel.name } : null,
        assumidoEm: avaliacao.assumidoEm ? avaliacao.assumidoEm.toISOString() : null,
        motivoTag: avaliacao.motivoTag ? { id: avaliacao.motivoTag.id, nome: avaliacao.motivoTag.nome } : null,
        resolucaoTexto: avaliacao.resolucaoTexto,
        resolvidoEm: avaliacao.resolvidoEm ? avaliacao.resolvidoEm.toISOString() : null,
      },
    },
  });
}
