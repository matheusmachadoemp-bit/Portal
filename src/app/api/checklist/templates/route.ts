import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import type { ChecklistItemType } from "@prisma/client";

const WEEKDAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "tarefas", "canView", "checklist"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Checklist." }, { status: 403 });
  }

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
  if (!(await hasModulePermission(session.user.id, "tarefas", "canCreate", "checklist"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar checklists." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar checklists no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  // Nunca deixa criar um checklist sem nome (o título aparece na Agenda do dia e em toda
  // listagem) nem sem nenhum item (um checklist sem item não tem o que ser respondido) — o
  // cliente já bloqueia os dois casos (ver checklist-client.tsx), mas a API precisa repetir a
  // checagem para quem chamar a rota direto.
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Informe o nome do checklist." }, { status: 400 });
  }
  const itensInput: Record<string, unknown>[] = Array.isArray(body.itens) ? body.itens : [];
  if (itensInput.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos um item ao checklist." }, { status: 400 });
  }

  const weekdayData = Object.fromEntries(WEEKDAYS.map((d) => [d, d === "terca" ? Boolean(body[d]) : body[d] !== false]));

  const template = await prisma.checklistTemplate.create({
    data: {
      empresaId: empresa.id,
      name,
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
        create: itensInput.map((item: Record<string, unknown>, idx: number) => ({
          title: item.title as string,
          orientacao: (item.orientacao as string) || null,
          tipo: ((item.tipo as string) || "CONCLUIDO") as ChecklistItemType,
          obrigatorio: (item.obrigatorio as boolean) ?? true,
          fotoObrigatoria: Boolean(item.fotoObrigatoria),
          ordem: idx,
        })),
      },
    },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });

  return NextResponse.json({ template });
}
