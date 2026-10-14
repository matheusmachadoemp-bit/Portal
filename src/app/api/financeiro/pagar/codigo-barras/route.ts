import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { normalizeScannedCode } from "@/lib/boleto-barcode";
import { findPayableDuplicate } from "@/lib/boleto-barcode-server";

/**
 * Checagem "ao vivo" de duplicidade de código de barras/Pix, usada pela tela assim que a câmera lê
 * um código (ou o usuário termina de digitar manualmente) — antes mesmo de tentar salvar, para
 * avisar e bloquear o formulário na hora (ver maquete do pedido). O POST/PATCH de
 * `api/financeiro/pagar` fazem a MESMA checagem de novo antes de gravar (nunca confiam só nesta
 * consulta prévia, que podia estar desatualizada por uma corrida entre duas pessoas cadastrando ao
 * mesmo tempo).
 *
 * Exige `canCreate` (não só `canView`): esta rota é um "oráculo" de existência ENTRE lojas (a
 * busca em `findPayableDuplicate` é global de propósito — ver o comentário lá) — só faz sentido
 * pra quem vai de fato lançar/editar um boleto agora, não pra qualquer perfil que só visualiza o
 * Financeiro. Mesmo nível de permissão que o POST de `api/financeiro/pagar` já exige.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar/editar lançamentos financeiros." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("codigo") ?? "";
  const excludeId = searchParams.get("excludeId") || undefined;
  // Corta pelo tamanho ANTES de normalizar (mesma ordem defensiva do POST/PATCH de
  // `api/financeiro/pagar`): evita gastar o `.test()`/`.replace()` de `normalizeScannedCode` em
  // cima de um texto gigante antes de nem saber se ele é um parâmetro válido.
  if ((excludeId && excludeId.length > 100) || raw.length > 500) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const codigo = normalizeScannedCode(raw);
  if (!codigo) return NextResponse.json({ duplicate: null });

  const duplicate = await findPayableDuplicate(codigo, session.user.id, session.user.role, excludeId);
  return NextResponse.json({ duplicate });
}
