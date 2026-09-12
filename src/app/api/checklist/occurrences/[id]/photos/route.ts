import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { fileUrl, fileName, mimeType, observacao, itemResponseId } = body;

  if (!fileUrl || !fileName) {
    return NextResponse.json({ error: "Arquivo de foto inválido." }, { status: 400 });
  }

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });
  // Anexar foto faz parte de "executar" o checklist, não de "editar o template" —
  // por isso exige só canExecute na subcategoria "checklist" (não canCreate no
  // módulo "tarefas" inteiro, nem canView, que é só leitura de verdade — ver
  // ACCESS_LEVEL_TO_MODULE_FLAGS em @/lib/permissions), pra um perfil
  // restrito a executar (ex.: Chef, Garçom) continuar conseguindo comprovar
  // itens normalmente.
  if (!(await hasModulePermission(session.user.id, "tarefas", "canExecute", "checklist"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite anexar fotos ao checklist." },
      { status: 403 }
    );
  }

  const photo = await prisma.checklistPhoto.create({
    data: {
      occurrenceId: id,
      itemResponseId: itemResponseId || null,
      fileUrl,
      fileName,
      mimeType: mimeType || null,
      observacao: observacao || null,
      uploadedById: session.user.id,
    },
  });

  return NextResponse.json({ photo });
}
