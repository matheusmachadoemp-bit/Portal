import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";

// BUG-004b: mesma checagem de cargo já usada nas rotas irmãs `/api/rh/employees` e
// `/api/rh/finance` (desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia chamar este GET direto
// (fora da tela, que já foi corrigida no BUG-004) e listar os documentos — inclusive `fileUrl`, o
// arquivo do contrato/documento enviado — de todos os colegas.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o RH." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  const documents = await prisma.employeeDocument.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar documentos de colaboradores." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  if (body.fileUrl && !isValidBlobUrl(body.fileUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const document = await prisma.employeeDocument.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      categoria: body.categoria,
      nome: body.nome,
      fileUrl: body.fileUrl,
      mimeType: body.mimeType || null,
      validade: body.validade ? new Date(body.validade) : null,
      observacao: body.observacao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ document });
}
