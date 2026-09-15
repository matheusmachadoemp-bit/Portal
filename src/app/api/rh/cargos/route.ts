import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertEmpresaAccess, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { listEmployeeCargos, resolveEmployeeCargo } from "@/lib/rh-server";

/**
 * Catálogo de Cargos de RH (`EmployeeCargo`) — base para o `<select>` de "Cargo" em
 * RH > Colaboradores (tela em si é fase futura, do Caio; ver comentário em @/lib/rh-server).
 *
 * `empresaId` aceito por query param (em vez de sempre usar a empresa ativa do contexto) porque
 * quem consome esta rota pode estar editando um colaborador de uma loja específica mesmo com o
 * seletor de loja do Portal em modo "Grupo Nord" — mesmo raciocínio de `existing.empresaId` já
 * usado por `PATCH /api/rh/employees/[id]`. Sem o param, cai para a empresa ativa única (mesmo
 * comportamento de `POST /api/rh/employees`, útil para o formulário de CRIAR um colaborador
 * novo, que já exige uma loja específica selecionada).
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

  const cargos = await listEmployeeCargos(empresaId);
  return NextResponse.json({ cargos });
}

/**
 * Cadastra um cargo diretamente no catálogo (ex.: futura tela "gerenciar cargos"). Fora desse
 * fluxo administrativo, o jeito comum de um cargo novo entrar no catálogo é automático — ver
 * `resolveEmployeeCargo`, chamada por `POST`/`PATCH /api/rh/employees` e pela importação de
 * planilha — não é obrigatório passar por aqui antes de usar um cargo novo num colaborador.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar cargos." },
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
  const resultado = await resolveEmployeeCargo(empresa.id, body?.nome);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });

  return NextResponse.json({ cargo: resultado }, { status: resultado.criado ? 201 : 200 });
}
