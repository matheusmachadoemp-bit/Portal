import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { itemTemplateId, status, valorTexto, valorNumero, valorBooleano, observacao } = body;

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
    include: { template: true },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });
  // Responder um item é "executar" o checklist, não "editar o template" — por isso
  // só exige canExecute na subcategoria "checklist" (não canEdit no módulo
  // "tarefas" inteiro, que também cobre a tela de Tarefas/kanban e a criação/
  // edição de templates, nem canView, que é só leitura de verdade — ver
  // ACCESS_LEVEL_TO_MODULE_FLAGS em @/lib/permissions). Um perfil restrito a
  // só executar checklists (ex.: Chef, Garçom) precisa continuar respondendo
  // itens normalmente.
  if (!(await hasModulePermission(session.user.id, "tarefas", "canExecute", "checklist"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite responder itens do checklist." },
      { status: 403 }
    );
  }

  const itemTemplate = await prisma.checklistItemTemplate.findUnique({ where: { id: itemTemplateId } });
  if (!itemTemplate || itemTemplate.templateId !== occurrence.templateId) {
    return NextResponse.json({ error: "Item do checklist não encontrado." }, { status: 404 });
  }

  if (status === "PROBLEMA" && occurrence.template.exigirObservacaoProblema && !observacao?.trim()) {
    return NextResponse.json({ error: "Esse checklist exige uma observação quando há um problema." }, { status: 400 });
  }

  // Item que exige foto (tipo FOTO ou fotoObrigatoria marcada no template, independente do tipo):
  // nunca marca CONCLUIDO por esta rota sem uma foto já persistida (ChecklistPhoto) vinculada à
  // resposta — quem de fato confirma que o upload teve sucesso e libera o CONCLUIDO é
  // `POST .../photos` (ver ali), chamado só depois que o arquivo já subiu e a foto já foi
  // gravada. Sem isso, o cliente podia marcar CONCLUIDO antes/independente do upload da foto (ex.:
  // `handleItemPhoto` em executar-client.tsx chama esta rota com status CONCLUIDO e só depois
  // tenta subir o arquivo — se o upload falhar, o item ficava "Concluído" sem foto nenhuma).
  const precisaFoto = itemTemplate.tipo === "FOTO" || itemTemplate.fotoObrigatoria;
  let effectiveStatus = status || "CONCLUIDO";
  if (effectiveStatus === "CONCLUIDO" && precisaFoto) {
    const existing = await prisma.checklistItemResponse.findUnique({
      where: { occurrenceId_itemTemplateId: { occurrenceId: id, itemTemplateId } },
      include: { fotos: true },
    });
    if (!existing || existing.fotos.length === 0) {
      effectiveStatus = "PENDENTE";
    }
  }

  const response = await prisma.checklistItemResponse.upsert({
    where: { occurrenceId_itemTemplateId: { occurrenceId: id, itemTemplateId } },
    update: {
      status: effectiveStatus,
      valorTexto: valorTexto ?? null,
      valorNumero: valorNumero != null ? Number(valorNumero) : null,
      valorBooleano: valorBooleano ?? null,
      observacao: observacao || null,
      respondidoPorId: session.user.id,
      respondidoEm: new Date(),
    },
    create: {
      occurrenceId: id,
      itemTemplateId,
      status: effectiveStatus,
      valorTexto: valorTexto ?? null,
      valorNumero: valorNumero != null ? Number(valorNumero) : null,
      valorBooleano: valorBooleano ?? null,
      observacao: observacao || null,
      respondidoPorId: session.user.id,
      respondidoEm: new Date(),
    },
  });

  if (!occurrence.startedAt) {
    await prisma.checklistOccurrence.update({ where: { id }, data: { startedAt: new Date() } });
  }

  return NextResponse.json({ response });
}
