import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// Edição da "Meta de CMV por loja" (`Empresa.metaCmvPercent`) — mudou de lugar a pedido do
// usuário: antes vivia em duplicidade em duas telas (Estoque → Configurações, tela removida
// por completo — ver prisma/migrations/20260930140000_remove_configuracoes_subcategoria_estoque
// — e CMV → Comparativo Real x Teórico, que perdeu a capacidade de editar e ficou só com a
// visualização), ambas chamando a antiga rota src/app/api/estoque/configuracoes/route.ts
// (também removida). Agora mora só aqui, dentro da categoria global "Configurações"
// (src/app/portal/configuracoes/), mesmo padrão de permissão e formato de rota já usado por
// src/app/api/configuracoes/ifood/route.ts (outro ajuste numérico por loja da mesma tela).
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para alterar esta configuração." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "configuracoes", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações." },
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

  const body = await req.json();
  const metaCmvPercent = Number(body.metaCmvPercent);
  if (!Number.isFinite(metaCmvPercent) || metaCmvPercent <= 0 || metaCmvPercent >= 100) {
    return NextResponse.json({ error: "Informe uma meta de CMV válida entre 0 e 100." }, { status: 400 });
  }

  await prisma.empresa.update({ where: { id: empresa.id }, data: { metaCmvPercent } });

  return NextResponse.json({ metaCmvPercent });
}
