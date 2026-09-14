import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import type { FechamentoTipoResposta, FechamentoGravidade } from "@prisma/client";

const TIPOS_COM_OPCOES: FechamentoTipoResposta[] = ["MULTIPLA_ESCOLHA"];

const PERGUNTA_SELECT = {
  id: true,
  texto: true,
  orientacao: true,
  tipo: true,
  obrigatoria: true,
  ordem: true,
  ativa: true,
  abreOcorrencia: true,
  perguntaPaiId: true,
  valorPaiQueExibe: true,
  categoriaSugeridaId: true,
  gravidadeSugerida: true,
  opcoes: { select: { id: true, texto: true, ordem: true }, orderBy: { ordem: "asc" as const } },
  cargos: { select: { cargoId: true } },
  _count: { select: { respostas: true, condicionais: true } },
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canView", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o catálogo de perguntas do Fechamento do Dia." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível gerenciar perguntas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const [perguntas, cargos, categorias] = await Promise.all([
    prisma.fechamentoPergunta.findMany({
      where: { empresaId: empresa.id },
      select: PERGUNTA_SELECT,
      orderBy: { ordem: "asc" },
    }),
    prisma.fechamentoCargo.findMany({
      where: { empresaId: empresa.id, ativo: true },
      select: { id: true, nome: true },
      orderBy: { ordem: "asc" },
    }),
    prisma.fechamentoCategoria.findMany({
      where: { empresaId: empresa.id, ativa: true },
      select: { id: true, nome: true },
      orderBy: { ordem: "asc" },
    }),
  ]);

  return NextResponse.json({
    perguntas: perguntas.map((p) => ({ ...p, cargoIds: p.cargos.map((c) => c.cargoId), cargos: undefined })),
    cargos,
    categorias,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canEdit", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar perguntas do Fechamento do Dia." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar perguntas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Informe o texto da pergunta." }, { status: 400 });

  const tipo = (body.tipo as FechamentoTipoResposta) || "TEXTO";
  const cargoIds: string[] = Array.isArray(body.cargoIds) ? body.cargoIds : [];
  const opcoesTexto: string[] = Array.isArray(body.opcoes)
    ? body.opcoes.map((o: { texto?: string } | string) => String(typeof o === "string" ? o : o.texto ?? "").trim()).filter(Boolean)
    : [];

  if (TIPOS_COM_OPCOES.includes(tipo) && opcoesTexto.length < 2) {
    return NextResponse.json({ error: "Perguntas de múltipla escolha precisam de pelo menos 2 opções." }, { status: 400 });
  }

  if (cargoIds.length > 0) {
    const cargosValidos = await prisma.fechamentoCargo.count({ where: { id: { in: cargoIds }, empresaId: empresa.id } });
    if (cargosValidos !== cargoIds.length) {
      return NextResponse.json({ error: "Um ou mais cargos selecionados são inválidos." }, { status: 400 });
    }
  }

  if (body.perguntaPaiId) {
    const pai = await prisma.fechamentoPergunta.findUnique({ where: { id: body.perguntaPaiId } });
    if (!pai || pai.empresaId !== empresa.id) {
      return NextResponse.json({ error: "Pergunta-pai inválida." }, { status: 400 });
    }
  }

  const maxOrdem = await prisma.fechamentoPergunta.aggregate({ where: { empresaId: empresa.id }, _max: { ordem: true } });

  const pergunta = await prisma.fechamentoPergunta.create({
    data: {
      empresaId: empresa.id,
      texto,
      orientacao: body.orientacao || null,
      tipo,
      obrigatoria: body.obrigatoria ?? true,
      ordem: (maxOrdem._max.ordem ?? 0) + 1,
      abreOcorrencia: Boolean(body.abreOcorrencia),
      perguntaPaiId: body.perguntaPaiId || null,
      valorPaiQueExibe: body.valorPaiQueExibe || null,
      categoriaSugeridaId: body.categoriaSugeridaId || null,
      gravidadeSugerida: (body.gravidadeSugerida as FechamentoGravidade) || null,
      createdById: session.user.id,
      opcoes: opcoesTexto.length ? { create: opcoesTexto.map((texto, idx) => ({ texto, ordem: idx })) } : undefined,
      cargos: cargoIds.length ? { create: cargoIds.map((cargoId) => ({ cargoId })) } : undefined,
    },
  });

  return NextResponse.json({ pergunta });
}
