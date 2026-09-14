import { NextResponse } from "next/server";
import type { ChamadoCategoria, FechamentoGravidade } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { createTaskFromExternalSource } from "@/lib/tarefas-server";
import { generateChamadoProtocolo, logChamadoHistorico, notifyManutencaoUser } from "@/lib/manutencao-server";

// cargo.key (Fechamento) -> Task.sectorKey (ver TASK_SECTORS em @/lib/tarefas) — vocabulários
// diferentes de propósito (um é o "key" técnico do Fechamento, o outro é o rótulo em
// português exibido na tela de Tarefas); "Outros" cobre qualquer cargo futuro sem
// correspondência cadastrada aqui, em vez de travar a transformação.
const CARGO_KEY_PARA_TASK_SECTOR: Record<string, string> = {
  gerencia: "Gerência",
  salao: "Salão",
  cozinha: "Cozinha",
};

// cargo.key (Fechamento) -> Chamado.setor (ver SETOR_SUGESTOES em @/lib/manutencao — não tem
// "Gerência" na lista de sugestões, por isso o mapeamento é separado do de Task acima).
const CARGO_KEY_PARA_CHAMADO_SETOR: Record<string, string> = {
  gerencia: "Administrativo",
  salao: "Salão",
  cozinha: "Cozinha",
};

// FechamentoCategoria.nome -> ChamadoCategoria — só "Equipamento" tem uma correspondência
// direta e óbvia no catálogo de categorias de Manutenção; as demais caem em OUTRO (não em
// silêncio: OUTRO é uma opção real do enum ChamadoCategoria, o mesmo destino que qualquer
// chamado aberto manualmente sem categoria específica já usa).
const CATEGORIA_NOME_PARA_CHAMADO_CATEGORIA: Record<string, ChamadoCategoria> = {
  Equipamento: "EQUIPAMENTO",
};

const GRAVIDADE_PARA_PRIORIDADE: Record<FechamentoGravidade, "URGENTE" | "ALTA" | "MEDIA" | "BAIXA"> = {
  CRITICO: "URGENTE",
  IMPORTANTE: "ALTA",
  ATENCAO: "MEDIA",
  INFORMATIVO: "BAIXA",
};

function montarDescricao(ocorrencia: { descricao: string; comoFoiResolvido: string | null; pendencia: string | null }): string {
  const partes = [ocorrencia.descricao];
  if (ocorrencia.comoFoiResolvido) partes.push(`Como foi resolvido: ${ocorrencia.comoFoiResolvido}`);
  if (ocorrencia.pendencia) partes.push(`Pendência: ${ocorrencia.pendencia}`);
  return partes.join("\n\n");
}

/**
 * "Transforma" uma FechamentoOcorrencia num registro de um módulo já existente do Portal —
 * Tarefa (qualquer categoria, acompanhamento genérico) ou Chamado de Manutenção (pensado pra
 * categoria "Equipamento", mas aceito pra qualquer uma — o usuário decide). RH/Compras/CRM não
 * são destinos suportados nesta fase: os 3 exigem um dado que o Fechamento não capta hoje (ver
 * comentário de `FechamentoOcorrencia` no schema.prisma e o relatório final para o porquê
 * detalhado de cada um).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ocorrencia = await prisma.fechamentoOcorrencia.findUnique({
    where: { id },
    include: { cargo: true, categoria: true },
  });
  if (!ocorrencia) return NextResponse.json({ error: "Ocorrência não encontrada." }, { status: 404 });

  const temAcesso = await assertEmpresaAccess(session.user.id, session.user.role, ocorrencia.empresaId);
  if (!temAcesso) return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite transformar ocorrências." }, { status: 403 });
  }

  if (ocorrencia.transformadoEmTaskId || ocorrencia.transformadoEmChamadoId) {
    return NextResponse.json({ error: "Esta ocorrência já foi transformada." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const tipo = body?.tipo;
  if (tipo !== "TASK" && tipo !== "CHAMADO") {
    return NextResponse.json({ error: '"tipo" precisa ser "TASK" ou "CHAMADO".' }, { status: 400 });
  }

  const assigneeId: string | null =
    typeof body?.assigneeId === "string" ? body.assigneeId : (ocorrencia.cargo.responsavelId ?? null);

  if (tipo === "TASK") {
    const task = await createTaskFromExternalSource({
      empresaId: ocorrencia.empresaId,
      title: ocorrencia.descricao,
      description: montarDescricao(ocorrencia),
      sectorKey: CARGO_KEY_PARA_TASK_SECTOR[ocorrencia.cargo.key] ?? "Outros",
      priority: GRAVIDADE_PARA_PRIORIDADE[ocorrencia.gravidade],
      assigneeId,
      sourceType: "FECHAMENTO_OCORRENCIA",
      sourceId: ocorrencia.id,
      createdById: session.user.id,
    });

    const atualizada = await prisma.fechamentoOcorrencia.update({
      where: { id: ocorrencia.id },
      data: {
        transformadoEmTaskId: task.id,
        transformadoPorId: session.user.id,
        transformadoEm: new Date(),
        status: "TRANSFORMADA",
      },
    });

    return NextResponse.json({ ocorrencia: atualizada, task });
  }

  // tipo === "CHAMADO"
  const categoria: ChamadoCategoria = CATEGORIA_NOME_PARA_CHAMADO_CATEGORIA[ocorrencia.categoria.nome] ?? "OUTRO";
  const chamado = await prisma.$transaction(async (tx) => {
    const created = await tx.chamado.create({
      data: {
        protocolo: `TEMP-${Date.now()}`,
        titulo: ocorrencia.descricao,
        descricao: montarDescricao(ocorrencia),
        empresaId: ocorrencia.empresaId,
        setor: CARGO_KEY_PARA_CHAMADO_SETOR[ocorrencia.cargo.key] ?? "Outros",
        categoria,
        prioridade: GRAVIDADE_PARA_PRIORIDADE[ocorrencia.gravidade],
        status: "ABERTO",
        solicitanteId: session.user.id,
        responsavelId: assigneeId,
      },
    });
    await generateChamadoProtocolo(tx, created.id, created.sequence);
    return tx.chamado.findUniqueOrThrow({ where: { id: created.id } });
  });
  await logChamadoHistorico(chamado.id, session.user.id, "CREATED", `Protocolo ${chamado.protocolo} (gerado a partir do Fechamento do Dia)`);
  if (chamado.responsavelId && chamado.responsavelId !== session.user.id) {
    await notifyManutencaoUser(
      chamado.responsavelId,
      "NOVO_CHAMADO",
      "Novo chamado de manutenção",
      `Você foi definido como responsável pelo chamado "${chamado.titulo}" (${chamado.protocolo}).`,
      chamado.id
    );
  }

  const atualizada = await prisma.fechamentoOcorrencia.update({
    where: { id: ocorrencia.id },
    data: {
      transformadoEmChamadoId: chamado.id,
      transformadoPorId: session.user.id,
      transformadoEm: new Date(),
      status: "TRANSFORMADA",
    },
  });

  return NextResponse.json({ ocorrencia: atualizada, chamado });
}
