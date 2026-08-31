import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runFichasTecnicasSync } from "@/lib/fichas-tecnicas-sync";

// TEMPORARY, ONE-OFF ROUTE. Sincroniza Insumos e Fichas Técnicas (Product +
// ProductIngredient) da loja "Nord Pizza & Burger" a partir da planilha
// "Custeio de Produtos" enviada pelo usuário (dados em
// scripts/fichas-tecnicas/nord-custeio-produtos.json).
//
// GET (sem parâmetros) roda em modo DRY-RUN: não grava nada, só retorna o
// relatório do que seria criado/atualizado, itens sem correspondência, etc.
// GET com ?apply=1 aplica de fato as mudanças no banco.
//
// Protegida por sessão autenticada ADMINISTRADOR/GESTOR, mesmo padrão de
// toda rota administrativa do projeto. Apague este arquivo (e o lib
// src/lib/fichas-tecnicas-sync.ts + scripts/fichas-tecnicas/) depois de
// concluída a sincronização.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const apply = searchParams.get("apply") === "1";

  try {
    const report = await runFichasTecnicasSync(apply);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
