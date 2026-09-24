import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import type { CustomerSurveyQuestionType } from "@prisma/client";

const TIPOS_VALIDOS: CustomerSurveyQuestionType[] = ["NOTA_0_5", "NOTA_0_10", "GOSTEI_NAO_GOSTEI", "TEXTO_LIVRE"];

/**
 * Edita uma pergunta PRÓPRIA da loja ativa — inclui ativar/desativar e reordenar (`ordem`),
 * que por enquanto são só mais um campo deste mesmo PATCH (o drag-and-drop de verdade na tela
 * é trabalho futuro do Caio; a API já aceita "PATCH mudando ordem" desde já).
 *
 * Nunca alcança uma pergunta COMPARTILHADA (`empresaId = null`, incluindo a pergunta fixa de
 * nota geral — ver `ensureFixedNotaGeralQuestion`): o check de posse abaixo
 * (`existing.empresaId !== empresa.id`) já barra isso sozinho, porque `null` nunca é igual ao id
 * de loja nenhuma. Ainda assim, deixamos um segundo guard explícito pra `fixaNotaGeral` logo
 * abaixo, de propósito redundante — proteção em profundidade caso o check de posse acima mude
 * de forma no futuro (ex.: se um dia existir edição em modo Grupo Nord) sem que alguém lembre de
 * revisar esta regra específica.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canEdit", "perguntas"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar perguntas de Satisfação do Cliente." },
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
  const existing = await prisma.customerSurveyQuestion.findUnique({ where: { id } });
  if (!existing || existing.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Pergunta não encontrada." }, { status: 404 });
  }
  // Redundante com o check de posse acima (fixaNotaGeral nunca tem empresaId != null) — ver
  // comentário da função.
  if (existing.fixaNotaGeral) {
    return NextResponse.json({ error: "A pergunta de nota geral não pode ser editada por aqui." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const data: Record<string, unknown> = {};

  if (body.titulo !== undefined) {
    const titulo = String(body.titulo).trim();
    if (!titulo) return NextResponse.json({ error: "Informe o título da pergunta." }, { status: 400 });
    data.titulo = titulo;
  }
  if (body.tipo !== undefined) {
    if (!TIPOS_VALIDOS.includes(body.tipo)) {
      return NextResponse.json({ error: "Tipo de pergunta inválido." }, { status: 400 });
    }
    data.tipo = body.tipo;
  }
  if (body.tema !== undefined) data.tema = body.tema ? String(body.tema).trim() : null;
  if (body.obrigatoria !== undefined) data.obrigatoria = !!body.obrigatoria;
  if (body.ordem !== undefined) {
    if (!Number.isFinite(body.ordem)) return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
    data.ordem = Math.round(body.ordem);
  }
  if (body.ativo !== undefined) data.ativo = !!body.ativo;
  // `fixaNotaGeral` nunca é aceito aqui, mesmo para uma pergunta própria — só
  // `ensureFixedNotaGeralQuestion` cria/gerencia a marcação, pra nunca existir mais de uma.

  const pergunta = await prisma.customerSurveyQuestion.update({ where: { id }, data });
  return NextResponse.json({ pergunta });
}
