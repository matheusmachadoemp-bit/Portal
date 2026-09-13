import { NextResponse } from "next/server";
import type { FechamentoGravidade, FechamentoOcorrenciaStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/checklist";

const OCORRENCIA_INCLUDE = {
  empresa: { select: { id: true, name: true } },
  cargo: { select: { id: true, key: true, nome: true, icon: true } },
  categoria: { select: { id: true, nome: true, icon: true } },
  pergunta: { select: { id: true, texto: true } },
  submissao: { select: { id: true, enviadoPor: { select: { id: true, name: true } }, enviadoEm: true } },
  transformadoEmTask: { select: { id: true, title: true, status: true } },
  transformadoEmChamado: { select: { id: true, protocolo: true, titulo: true, status: true } },
  transformadoPor: { select: { id: true, name: true } },
  resolvidoPor: { select: { id: true, name: true } },
} as const;

const GRAVIDADES: FechamentoGravidade[] = ["INFORMATIVO", "ATENCAO", "IMPORTANTE", "CRITICO"];
const STATUSES: FechamentoOcorrenciaStatus[] = ["ABERTA", "TRANSFORMADA", "RESOLVIDA", "DESCARTADA"];

/**
 * Lista consolidada de ocorrências (todas as lojas/cargos acessíveis, ou filtradas) — a base de
 * dados pra uma tela futura do Caio (esta rota não constrói nenhuma tela). Suporta o modo
 * "Grupo Nord" (várias lojas de uma vez), igual `GET /api/fechamento-dia/status`.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await hasModulePermission(session.user.id, "fechamento-dia", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Fechamento do Dia." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const categoriaId = searchParams.get("categoriaId");
  const gravidade = searchParams.get("gravidade");
  const status = searchParams.get("status");
  const cargoId = searchParams.get("cargoId");

  if (gravidade && !GRAVIDADES.includes(gravidade as FechamentoGravidade)) {
    return NextResponse.json({ error: "Gravidade inválida." }, { status: 400 });
  }
  if (status && !STATUSES.includes(status as FechamentoOcorrenciaStatus)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const where: Record<string, unknown> = { empresaId: { in: empresaIds } };
  if (from || to) {
    where.data = {
      ...(from ? { gte: spStartOfDay(from) } : {}),
      ...(to ? { lte: spStartOfDay(to) } : {}),
    };
  }
  if (categoriaId) where.categoriaId = categoriaId;
  if (gravidade) where.gravidade = gravidade;
  if (status) where.status = status;
  if (cargoId) where.cargoId = cargoId;

  const ocorrencias = await prisma.fechamentoOcorrencia.findMany({
    where,
    include: OCORRENCIA_INCLUDE,
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  return NextResponse.json({ ocorrencias });
}
