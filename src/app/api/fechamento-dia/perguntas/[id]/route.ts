import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import type { FechamentoTipoResposta, FechamentoGravidade } from "@prisma/client";

const TIPOS_COM_OPCOES: FechamentoTipoResposta[] = ["MULTIPLA_ESCOLHA"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canEdit", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar perguntas do Fechamento do Dia." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível editar perguntas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const existente = await prisma.fechamentoPergunta.findUnique({ where: { id }, select: { empresaId: true, tipo: true } });
  if (!existente || existente.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Pergunta não encontrada." }, { status: 404 });
  }

  const body = await req.json();
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Informe o texto da pergunta." }, { status: 400 });

  const tipo = (body.tipo as FechamentoTipoResposta) || existente.tipo;
  const cargoIds: string[] = Array.isArray(body.cargoIds) ? body.cargoIds : [];
  const incomingOpcoes: { id?: string; texto: string }[] = Array.isArray(body.opcoes)
    ? body.opcoes
        .map((o: { id?: string; texto?: string }) => ({ id: o.id, texto: String(o.texto ?? "").trim() }))
        .filter((o: { texto: string }) => o.texto)
    : [];

  if (TIPOS_COM_OPCOES.includes(tipo) && incomingOpcoes.length < 2) {
    return NextResponse.json({ error: "Perguntas de múltipla escolha precisam de pelo menos 2 opções." }, { status: 400 });
  }

  if (cargoIds.length > 0) {
    const cargosValidos = await prisma.fechamentoCargo.count({ where: { id: { in: cargoIds }, empresaId: empresa.id } });
    if (cargosValidos !== cargoIds.length) {
      return NextResponse.json({ error: "Um ou mais cargos selecionados são inválidos." }, { status: 400 });
    }
  }

  if (body.perguntaPaiId === id) {
    return NextResponse.json({ error: "Uma pergunta não pode depender de si mesma." }, { status: 400 });
  }

  // Opções são casadas por id em vez de recriadas do zero: uma resposta antiga (MULTIPLA_ESCOLHA)
  // aponta pra `FechamentoPerguntaOpcao.id` — recriar tudo do zero orfanaria `opcaoId` de toda
  // resposta já registrada. Só remove de verdade a opção que saiu da lista E nunca foi
  // respondida; a que já tem resposta permanece no banco (mesmo que o gestor a tenha tirado do
  // formulário), preservando o histórico.
  const opcoesExistentes = await prisma.fechamentoPerguntaOpcao.findMany({
    where: { perguntaId: id },
    select: { id: true, _count: { select: { respostas: true } } },
  });
  const incomingIds = new Set(incomingOpcoes.map((o) => o.id).filter(Boolean));
  const opcoesParaRemover = opcoesExistentes.filter((o) => !incomingIds.has(o.id) && o._count.respostas === 0).map((o) => o.id);

  await prisma.$transaction([
    ...(opcoesParaRemover.length
      ? [prisma.fechamentoPerguntaOpcao.deleteMany({ where: { id: { in: opcoesParaRemover } } })]
      : []),
    ...incomingOpcoes.map((o, idx) =>
      o.id
        ? prisma.fechamentoPerguntaOpcao.update({ where: { id: o.id }, data: { texto: o.texto, ordem: idx } })
        : prisma.fechamentoPerguntaOpcao.create({ data: { perguntaId: id, texto: o.texto, ordem: idx } })
    ),
    prisma.fechamentoPerguntaCargo.deleteMany({ where: { perguntaId: id } }),
    prisma.fechamentoPergunta.update({
      where: { id },
      data: {
        texto,
        orientacao: body.orientacao || null,
        tipo,
        obrigatoria: body.obrigatoria ?? true,
        ativa: body.ativa ?? true,
        abreOcorrencia: Boolean(body.abreOcorrencia),
        perguntaPaiId: body.perguntaPaiId || null,
        valorPaiQueExibe: body.valorPaiQueExibe || null,
        categoriaSugeridaId: body.categoriaSugeridaId || null,
        gravidadeSugerida: (body.gravidadeSugerida as FechamentoGravidade) || null,
        cargos: cargoIds.length ? { create: cargoIds.map((cargoId) => ({ cargoId })) } : undefined,
      },
    }),
  ]);

  const pergunta = await prisma.fechamentoPergunta.findUnique({ where: { id } });
  return NextResponse.json({ pergunta });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canDelete", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir perguntas do Fechamento do Dia." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica." }, { status: 400 });
  }

  const { id } = await params;
  const pergunta = await prisma.fechamentoPergunta.findUnique({
    where: { id },
    select: { empresaId: true, _count: { select: { respostas: true, condicionais: true } } },
  });
  if (!pergunta || pergunta.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Pergunta não encontrada." }, { status: 404 });
  }

  if (pergunta._count.condicionais > 0) {
    return NextResponse.json(
      { error: "Essa pergunta tem outras perguntas condicionadas a ela — exclua ou edite as perguntas dependentes primeiro." },
      { status: 400 }
    );
  }

  if (pergunta._count.respostas > 0) {
    // Mesmo critério de Checklist (ver DELETE /api/checklist/templates/[id]): pergunta já
    // respondida em algum fechamento não é excluída de verdade, só desativada — sai do
    // catálogo (não aparece mais em novos formulários), mas preserva o histórico já registrado.
    await prisma.fechamentoPergunta.update({ where: { id }, data: { ativa: false } });
    return NextResponse.json({ ok: true, desativada: true });
  }

  await prisma.fechamentoPergunta.delete({ where: { id } });
  return NextResponse.json({ ok: true, desativada: false });
}
