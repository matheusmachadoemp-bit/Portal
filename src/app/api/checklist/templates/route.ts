import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

const WEEKDAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const templates = await prisma.checklistTemplate.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    include: {
      itens: { where: { ativo: true }, orderBy: { ordem: "asc" } },
      responsavel: { select: { id: true, name: true } },
      substituto: { select: { id: true, name: true } },
      empresa: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar checklists no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const weekdayData = Object.fromEntries(WEEKDAYS.map((d) => [d, d === "terca" ? Boolean(body[d]) : body[d] !== false]));

  const template = await prisma.checklistTemplate.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      description: body.description || null,
      setor: body.setor,
      categoria: body.categoria || null,
      turno: body.turno || null,
      active: body.active ?? true,
      recurrence: body.recurrence || "DIARIA",
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      releaseTime: body.releaseTime,
      dueTime: body.dueTime,
      ...weekdayData,
      responsavelId: body.responsavelId || null,
      substitutoId: body.substitutoId || null,
      substituirAutomaticamente: Boolean(body.substituirAutomaticamente),
      fotoChecklist: body.fotoChecklist || "SEM_FOTO",
      exigirObservacaoProblema: Boolean(body.exigirObservacaoProblema),
      cobrancaAtiva: body.cobrancaAtiva ?? true,
      avisoAntesMinutos: Number(body.avisoAntesMinutos) || 30,
      avisoAtrasoResponsavelMinutos: Number(body.avisoAtrasoResponsavelMinutos) || 10,
      alertaCriticoMinutos: Number(body.alertaCriticoMinutos) || 30,
      naoRealizadoMinutos: Number(body.naoRealizadoMinutos) || 60,
      createdById: session.user.id,
      itens: {
        create: (body.itens || []).map((item: Record<string, unknown>, idx: number) => ({
          title: item.title,
          orientacao: item.orientacao || null,
          tipo: item.tipo || "CONCLUIDO",
          obrigatorio: item.obrigatorio ?? true,
          fotoObrigatoria: Boolean(item.fotoObrigatoria),
          ordem: idx,
        })),
      },
    },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });

  return NextResponse.json({ template });
}
