import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { seedChefDeliveryCargo } from "@/lib/seed-chef-delivery";

/**
 * ROTA TEMPORÁRIA — remover numa tarefa de limpeza separada assim que o líder confirmar que
 * rodou isto com sucesso contra produção (uma única vez).
 *
 * Motivo de existir: a migration `20261105003000_fechamento_dia_chef_delivery` só criou a
 * permissão (`ModulePermission`) do cargo novo "Chef Delivery" — o catálogo em si
 * (`FechamentoCargo` + as `FechamentoPergunta`) só nasce rodando `prisma/seed.ts` contra o banco,
 * o que é feito manualmente. Como o líder não tem acesso direto à `DATABASE_URL` de produção (é
 * um "Secret" na Vercel, não reexibível), esta rota roda só essa parte específica — nunca o
 * `prisma/seed.ts` inteiro (que tem efeito colateral em outras coisas, ex.: dados demo de
 * vendas/marketing) — contra produção.
 *
 * Lógica real em `src/lib/seed-chef-delivery.ts` (`seedChefDeliveryCargo`), a mesma função
 * chamada por `prisma/seed.ts` — nunca duplicar essa lógica aqui.
 *
 * Idempotente: pode ser chamada mais de uma vez sem duplicar nada (mesmo comportamento de
 * upsert do seed). Só afeta o cargo "Chef Delivery" (+ suas 8 perguntas + filhas condicionais +
 * o vínculo com a pergunta compartilhada "Anexar foto (opcional)") — nunca toca
 * Gerente/Chef de Salão/Chef de Cozinha nem qualquer outro model do sistema.
 *
 * Autenticada via `CRON_SECRET` com comparação timing-safe (`src/lib/cron-auth.ts`), mesmo
 * padrão já usado pelos demais crons do projeto. Não está registrada em `vercel.json` de
 * propósito — não é pra rodar em agenda nenhuma, só disparo manual (`curl`) do líder.
 */
export async function GET(req: Request) {
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await seedChefDeliveryCargo(prisma);

  return NextResponse.json({ ok: true, ...resultado });
}
