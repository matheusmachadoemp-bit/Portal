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
 * Lista as mesas da loja ativa. Devolve só `qrCodeUrl` (o link em texto) — não a imagem do QR
 * (`qrCodeDataUrl`), que só é gerada sob demanda (na criação, na regeneração de token e em
 * `GET /mesas/[id]/qrcode`): gerar a imagem de TODAS as mesas numa listagem que pode ter
 * dezenas de linhas seria caro à toa numa tela que só precisa mostrar número/status na maioria
 * das vezes.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "mesas-qrcode"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver as mesas de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível gerenciar mesas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const mesas = await prisma.customerSurveyTable.findMany({
    where: { empresaId: empresa.id },
    orderBy: { numero: "asc" },
    include: { _count: { select: { avaliacoes: true } } },
  });

  const origin = req.nextUrl.origin;
  return NextResponse.json({
    mesas: mesas.map((m) => ({ ...m, qrCodeUrl: buildAvaliarUrl(origin, m.token) })),
  });
}

/** Cria uma mesa nova na loja ativa: gera o token único e já devolve o QR pronto pra imprimir. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canCreate", "mesas-qrcode"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar mesas de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar mesas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const numero = String(body?.numero ?? "").trim();
  if (!numero) return NextResponse.json({ error: "Informe o número (ou identificação) da mesa." }, { status: 400 });

  const existing = await prisma.customerSurveyTable.findUnique({
    where: { empresaId_numero: { empresaId: empresa.id, numero } },
  });
  if (existing) return NextResponse.json({ error: `Já existe uma mesa "${numero}" cadastrada.` }, { status: 400 });

  let mesa;
  try {
    mesa = await prisma.customerSurveyTable.create({
      data: { empresaId: empresa.id, numero, token: generateTableToken(), qrGeradoEm: new Date() },
    });
  } catch (e) {
    if (isNumeroConflict(e)) return NextResponse.json({ error: `Já existe uma mesa "${numero}" cadastrada.` }, { status: 400 });
    throw e;
  }

  const qrCodeUrl = buildAvaliarUrl(req.nextUrl.origin, mesa.token);
  const qrCodeDataUrl = await generateQrCodeDataUrl(qrCodeUrl);

  return NextResponse.json({ mesa: { ...mesa, qrCodeUrl, qrCodeDataUrl } });
}
