import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadSupplierReceivingHistory } from "@/lib/recebimento-server";
import { hasModulePermission } from "@/lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const historico = await loadSupplierReceivingHistory(id);
  return NextResponse.json({ historico });
}
