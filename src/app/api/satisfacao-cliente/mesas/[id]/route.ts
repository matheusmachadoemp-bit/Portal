import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { buildAvaliarUrl, generateQrCodeDataUrl, generateTableToken } from "@/lib/customer-survey-server";

function isNumeroConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    ((e.meta?.target as string[] | undefined)?.includes("numero") ?? true)
  );
}

/**
 * Edita uma mesa da loja ativa: renomear (`numero`), ativar/desativar (`ativo`) e/ou regenerar
 * o QR (`regenerarToken: true`) — os três cabem no mesmo PATCH, cada campo só é tocado se vier
 * no corpo. Regenerar troca o `token` por um novo aleatório: a URL/QR antigos passam a resolver
 * "inválido" (`GET /api/satisfacao-cliente/responder/[token]` não encontra mais nada com o
 * token antigo), sem precisar desativar nem recriar a mesa — o histórico de avaliações já
 * gravadas (`CustomerSurveyResponse.tableId`) não é afetado, continua apontando pro mesmo
 * registro de mesa.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canEdit", "mesas-qrcode"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar mesas de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível editar mesas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const existing = await prisma.customerSurveyTable.findUnique({ where: { id } });
  if (!existing || existing.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const data: { numero?: string; ativo?: boolean; token?: string; qrGeradoEm?: Date } = {};

  if (body.numero !== undefined) {
    const numero = String(body.numero).trim();
    if (!numero) return NextResponse.json({ error: "Informe o número (ou identificação) da mesa." }, { status: 400 });
    data.numero = numero;
  }
  if (body.ativo !== undefined) data.ativo = !!body.ativo;
  if (body.regenerarToken === true) {
    data.token = generateTableToken();
    data.qrGeradoEm = new Date();
  }

  let mesa;
  try {
    mesa = await prisma.customerSurveyTable.update({ where: { id }, data });
  } catch (e) {
    if (isNumeroConflict(e)) {
      return NextResponse.json({ error: `Já existe uma mesa "${data.numero}" cadastrada.` }, { status: 400 });
    }
    throw e;
  }

  const qrCodeUrl = buildAvaliarUrl(req.nextUrl.origin, mesa.token);
  const qrCodeDataUrl = body.regenerarToken === true ? await generateQrCodeDataUrl(qrCodeUrl) : undefined;

  return NextResponse.json({ mesa: { ...mesa, qrCodeUrl, qrCodeDataUrl } });
}
