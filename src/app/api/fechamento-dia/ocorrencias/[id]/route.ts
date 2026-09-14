import { NextResponse } from "next/server";
import type { FechamentoGravidade, FechamentoOcorrenciaStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const GRAVIDADES: FechamentoGravidade[] = ["INFORMATIVO", "ATENCAO", "IMPORTANTE", "CRITICO"];
// "TRANSFORMADA" de propósito fora da lista aceita aqui — só a rota
// `POST .../transformar` pode levar uma ocorrência a esse status (é o único jeito de garantir
// que `transformadoEmTaskId`/`transformadoEmChamadoId` sempre estejam preenchidos quando o
// status diz TRANSFORMADA).
const STATUSES_ACEITOS: FechamentoOcorrenciaStatus[] = ["ABERTA", "RESOLVIDA", "DESCARTADA"];

/**
 * Edita uma ocorrência diretamente (categoria/gravidade/descrição/status), sem passar pela
 * transformação em outro módulo — cobre o "o usuário poderá alterar depois" a categoria/
 * gravidade sugeridas automaticamente (ver comentário de `FechamentoOcorrencia` no schema).
 * Não fazia parte do pedido explícito desta fase, mas sem uma rota de edição essa frase não
 * teria como se cumprir — ver relatório final.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ocorrencia = await prisma.fechamentoOcorrencia.findUnique({ where: { id } });
  if (!ocorrencia) return NextResponse.json({ error: "Ocorrência não encontrada." }, { status: 404 });

  const temAcesso = await assertEmpresaAccess(session.user.id, session.user.role, ocorrencia.empresaId);
  if (!temAcesso) return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite editar ocorrências." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const { categoriaId, gravidade, status, descricao, comoFoiResolvido, pendencia } = body as {
    categoriaId?: string;
    gravidade?: FechamentoGravidade;
    status?: FechamentoOcorrenciaStatus;
    descricao?: string;
    comoFoiResolvido?: string | null;
    pendencia?: string | null;
  };

  if (gravidade !== undefined && !GRAVIDADES.includes(gravidade)) {
    return NextResponse.json({ error: "Gravidade inválida." }, { status: 400 });
  }
  if (status !== undefined && !STATUSES_ACEITOS.includes(status)) {
    return NextResponse.json(
      { error: 'Status inválido — para marcar como TRANSFORMADA, use a rota de "transformar".' },
      { status: 400 }
    );
  }
  if (descricao !== undefined && !descricao.trim()) {
    return NextResponse.json({ error: "Descrição não pode ficar vazia." }, { status: 400 });
  }

  let categoriaValida: string | undefined;
  if (categoriaId !== undefined) {
    const categoria = await prisma.fechamentoCategoria.findFirst({
      where: { id: categoriaId, empresaId: ocorrencia.empresaId },
    });
    if (!categoria) return NextResponse.json({ error: "Categoria inválida para esta loja." }, { status: 400 });
    categoriaValida = categoria.id;
  }

  const jaEstavaResolvida = ocorrencia.status === "RESOLVIDA";

  const atualizada = await prisma.fechamentoOcorrencia.update({
    where: { id },
    data: {
      categoriaId: categoriaValida,
      gravidade,
      status,
      descricao: descricao?.trim(),
      comoFoiResolvido: comoFoiResolvido === undefined ? undefined : comoFoiResolvido,
      pendencia: pendencia === undefined ? undefined : pendencia,
      resolvidoPorId: status === "RESOLVIDA" && !jaEstavaResolvida ? session.user.id : undefined,
      resolvidoEm: status === "RESOLVIDA" && !jaEstavaResolvida ? new Date() : undefined,
    },
  });

  return NextResponse.json({ ocorrencia: atualizada });
}
