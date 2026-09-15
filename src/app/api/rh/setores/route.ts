import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertEmpresaAccess, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { listEmployeeSetores, resolveEmployeeSetor } from "@/lib/rh-server";

/**
 * Catálogo de Setores de RH (`EmployeeSetor`) — base para o `<select>` de "Setor" em
 * RH > Colaboradores. Mesmo racional de `GET /api/rh/cargos` (ver comentário lá para o porquê do
 * `empresaId` por query param) — arquivo espelhado de propósito, um catálogo por rota.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaIdParam = searchParams.get("empresaId");

  let empresaId: string;
  if (empresaIdParam) {
    if (!(await assertEmpresaAccess(session.user.id, session.user.role, empresaIdParam))) {
      return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
    }
    empresaId = empresaIdParam;
  } else {
    const empresa = await requireActiveSingleEmpresa();
    if (!empresa) {
      return NextResponse.json(
        { error: "Selecione uma loja específica (ou informe empresaId) — não é possível listar no modo Grupo Nord." },
        { status: 400 }
      );
    }
    empresaId = empresa.id;
  }

  const setores = await listEmployeeSetores(empresaId);
  return NextResponse.json({ setores });
}

/**
 * Cadastra um setor diretamente no catálogo. Ver comentário equivalente em
 * `POST /api/rh/cargos` — o cadastro automático via `resolveEmployeeSetor` (usado por
 * `POST`/`PATCH /api/rh/employees` e pela importação de planilha) já cobre o fluxo comum.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar setores." },
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

  const body = await req.json().catch(() => null);
  const resultado = await resolveEmployeeSetor(empresa.id, body?.nome);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });

  return NextResponse.json({ setor: resultado }, { status: resultado.criado ? 201 : 200 });
}
