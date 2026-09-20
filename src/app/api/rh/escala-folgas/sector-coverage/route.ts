import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/** Cobertura mínima por setor (`SectorCoverageConfig`) da loja ativa — alimenta o card "Cobertura
 *  por setor" e a validação (com aviso, nunca bloqueio) ao cadastrar folga. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx || ctx.mode !== "single") {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const sectorCoverageConfigs = await prisma.sectorCoverageConfig.findMany({
    where: { empresaId: ctx.empresa.id },
    orderBy: { setor: "asc" },
  });
  return NextResponse.json({ sectorCoverageConfigs });
}

/** Cria OU atualiza (upsert por setor) a cobertura mínima daquele setor na loja ativa. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite configurar cobertura mínima." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const setor = typeof body?.setor === "string" ? body.setor.trim() : "";
  if (!setor) return NextResponse.json({ error: "Informe o setor." }, { status: 400 });
  const quantidadeMinima = Number(body?.quantidadeMinima);
  if (!Number.isInteger(quantidadeMinima) || quantidadeMinima < 0) {
    return NextResponse.json({ error: "Informe uma quantidade mínima válida (0 ou mais)." }, { status: 400 });
  }

  const sectorCoverageConfig = await prisma.sectorCoverageConfig.upsert({
    where: { empresaId_setor: { empresaId: empresa.id, setor } },
    update: { quantidadeMinima, ativo: true },
    create: { empresaId: empresa.id, setor, quantidadeMinima },
  });
  return NextResponse.json({ sectorCoverageConfig });
}
