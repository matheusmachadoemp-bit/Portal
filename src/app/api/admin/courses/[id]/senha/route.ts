import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/vault";

// Revela a senha de login da plataforma externa de um curso específico, sob
// demanda (mesmo espírito do GET /api/admin/vault/[id]?action=VIEW do
// Cofre). Nunca é devolvida pela listagem (GET /api/admin/courses) — só por
// aqui, um curso de cada vez.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para acessar a senha do curso." },
      { status: 403 }
    );
  }
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, senhaCipher: true },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stored = course.senhaCipher ?? "";
  if (!stored) return NextResponse.json({ senha: "" });

  if (isEncryptedSecret(stored)) {
    return NextResponse.json({ senha: decryptSecret(stored) });
  }

  // Dado legado: gravado em texto puro antes de existir criptografia para
  // este campo (Course.senha, antes de virar Course.senhaCipher). Trata o
  // próprio valor salvo como já sendo a senha em texto puro (sem tentar
  // decifrar, o que geraria erro ou lixo) e aproveita este acesso pra já
  // regravar criptografado corretamente — autocorreção orgânica, um
  // registro por vez, sem precisar de migração de dado em massa nem acesso
  // direto ao banco de produção.
  const plain = stored;
  await prisma.course.update({
    where: { id },
    data: { senhaCipher: encryptSecret(plain) },
  });

  return NextResponse.json({ senha: plain });
}
