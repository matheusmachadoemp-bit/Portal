import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { buildAvaliarUrl, generateQrCodeDataUrl } from "@/lib/customer-survey-server";

/** Devolve o QR (imagem + link) de UMA mesa já existente, sem regenerar o token — pra uma tela
 *  poder reexibir/reimprimir o QR de uma mesa a qualquer momento sem invalidar o que já foi
 *  colado na mesa física. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canView", "mesas-qrcode"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver mesas de Satisfação do Cliente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível ver mesas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const mesa = await prisma.customerSurveyTable.findUnique({ where: { id } });
  if (!mesa || mesa.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });
  }

  const qrCodeUrl = buildAvaliarUrl(req.nextUrl.origin, mesa.token);
  const qrCodeDataUrl = await generateQrCodeDataUrl(qrCodeUrl);
  return NextResponse.json({ qrCodeUrl, qrCodeDataUrl });
}
