import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { getReservasResumo } from "@/lib/reservas-resumo";

/** Resumo do dia (tela "Visão Geral") para o botão "Atualizar" do lado cliente — a carga inicial
 * da própria tela chama `getReservasResumo` direto (server component, sem passar por esta rota).
 * Ver `src/lib/reservas-resumo.ts` para a agregação em si (nenhuma lógica duplicada aqui). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const resumo = await getReservasResumo(empresaIds);
  return NextResponse.json({ resumo });
}
