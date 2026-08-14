import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { resolveAudience } from "@/lib/crm-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const campanhas = await prisma.campaign.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: {
      empresa: { select: { name: true, color: true } },
      createdBy: { select: { name: true } },
      _count: { select: { recipients: true } },
    },
  });

  return NextResponse.json({ campanhas });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar uma campanha." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
  }
  if (!body.message || !String(body.message).trim()) {
    return NextResponse.json({ error: "Mensagem é obrigatória." }, { status: 400 });
  }

  const audienceType = body.audienceType ?? "TODOS";
  const clienteIds = await resolveAudience(empresa.id, audienceType, {
    segmentId: body.segmentId ?? null,
    autoSegmentoKey: body.autoSegmentoKey ?? null,
    clienteIds: body.clienteIds ?? [],
  });

  const sendNow = !!body.sendNow;
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

  const campanha = await prisma.campaign.create({
    data: {
      empresaId: empresa.id,
      name: String(body.name).trim(),
      status: sendNow ? "ENVIADA" : scheduledAt ? "AGENDADA" : "RASCUNHO",
      audienceType,
      segmentId: audienceType === "SEGMENTO" ? body.segmentId ?? null : null,
      channel: body.channel ?? "WHATSAPP",
      offerType: body.offerType ?? "SEM_OFERTA",
      offerValue: body.offerValue !== undefined && body.offerValue !== null ? Number(body.offerValue) : null,
      offerDescription: body.offerDescription ?? null,
      message: String(body.message),
      scheduledAt,
      sentAt: sendNow ? new Date() : null,
      createdById: session.user.id,
      recipients: {
        create: clienteIds.map((clienteId: string) => ({
          clienteId,
          status: sendNow ? "ENVIADO" : "PENDENTE",
        })),
      },
    },
  });

  return NextResponse.json({ campanha });
}
