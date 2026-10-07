import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { ingredientCostPerUnit } from "@/lib/estoque";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { spHours, spMinutes } from "@/lib/checklist";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } } },
  });
  if (!count) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, count.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }
  return NextResponse.json({ count });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.stockCount.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  // Esta rota só atualiza uma contagem já existente (lançamento de itens contados e transições
  // de status como concluir/aprovar/reabrir) — nunca cria uma StockCount nova (isso é feito em
  // POST /api/estoque/contagens). Por isso trata como canEdit.
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar contagens de estoque." },
      { status: 403 }
    );
  }

  // --- Atualização item a item (contagem em andamento) ---
  if (Array.isArray(body.items)) {
    const temFotoInvalida = (body.items as { fotoUrl?: string }[]).some(
      (upd) => upd.fotoUrl && !isValidBlobUrl(upd.fotoUrl)
    );
    if (temFotoInvalida) {
      return NextResponse.json({ error: "URL de foto inválida em um dos itens." }, { status: 400 });
    }

    // Cada item atualiza uma linha diferente de StockCountItem — são
    // independentes entre si, então rodam em paralelo em vez de um de cada vez.
    await Promise.all(
      (body.items as { itemId: string; quantidadeContada?: number; observacao?: string; fotoUrl?: string; justificativa?: string; status?: string }[]).map(
        async (upd) => {
          const item = existing.items.find((i) => i.id === upd.itemId);
          if (!item) return;
          const custoUnit = ingredientCostPerUnit(item.ingredient);
          const contada = upd.quantidadeContada;
          let diferencaQtd: number | null = null;
          let diferencaPercent: number | null = null;
          let diferencaReais: number | null = null;
          let status = upd.status ?? "PENDENTE";
          if (contada !== undefined && contada !== null) {
            diferencaQtd = contada - item.estoqueEsperado;
            diferencaPercent = item.estoqueEsperado ? (diferencaQtd / item.estoqueEsperado) * 100 : contada > 0 ? 100 : 0;
            diferencaReais = diferencaQtd * custoUnit;
            // Antes disso, um item cuja diferença passasse do "Limiar de divergência de
            // contagem (%)" configurável por loja (`Empresa.metaDivergenciaContagemPercent`)
            // virava status DIVERGENCIA, o que exigia justificativa antes de aprovar/finalizar
            // a contagem (ver contagem-mensal-client.tsx/contagem-semanal-client.tsx). Essa
            // configuração e todo o enforcement em cima dela foram removidos a pedido do
            // usuário — todo item contado agora vira CONTADO, sem nenhuma trava de justificativa
            // baseada em percentual de diferença. `diferencaPercent`/`diferencaReais` continuam
            // calculados normalmente (são só informativos, exibidos na tela).
            status = "CONTADO";
          }
          await prisma.stockCountItem.update({
            where: { id: upd.itemId },
            data: {
              quantidadeContada: contada ?? undefined,
              diferencaQtd: diferencaQtd ?? undefined,
              diferencaPercent: diferencaPercent ?? undefined,
              diferencaReais: diferencaReais ?? undefined,
              observacao: upd.observacao !== undefined ? upd.observacao || null : undefined,
              fotoUrl: upd.fotoUrl !== undefined ? upd.fotoUrl || null : undefined,
              justificativa: upd.justificativa !== undefined ? upd.justificativa || null : undefined,
              status: status as never,
            },
          });
        }
      )
    );
  }

  // --- Transições de status da contagem ---
  const novoStatus = body.status as string | undefined;
  const data: Record<string, unknown> = {
    horaFim: novoStatus === "CONCLUIDA" ? new Date().toTimeString().slice(0, 5) : undefined,
    checklistJson: body.checklistJson !== undefined ? JSON.stringify(body.checklistJson) : undefined,
    // Edição dos metadados da contagem (setor/responsável) depois de criada — não tem relação
    // com a atualização de itens/status acima, só mais 2 campos possíveis no mesmo update.
    setor: body.setor !== undefined ? body.setor || null : undefined,
    responsavel: body.responsavel !== undefined ? body.responsavel || null : undefined,
  };

  if (novoStatus === "CONCLUIDA" || novoStatus === "EM_ANDAMENTO") {
    data.status = novoStatus;
  }

  // Contagem gerada automaticamente nasce RASCUNHO; a primeira conferência salva é o que de fato
  // a "inicia" (status + hora de início), igual à criação manual que já nasce EM_ANDAMENTO.
  // Feita como `updateMany` condicionado a RASCUNHO, à parte do update final: se outra requisição
  // concluiu/aprovou a contagem nesse meio-tempo, não sobrescreve o status dela.
  const conferiuAlgo =
    Array.isArray(body.items) &&
    (body.items as { quantidadeContada?: number | null }[]).some(
      (upd) => upd.quantidadeContada !== undefined && upd.quantidadeContada !== null
    );
  if (existing.status === "RASCUNHO" && conferiuAlgo && novoStatus === undefined) {
    const agora = new Date();
    await prisma.stockCount.updateMany({
      where: { id, status: "RASCUNHO" },
      data: {
        status: "EM_ANDAMENTO",
        horaInicio: existing.horaInicio ?? `${String(spHours(agora)).padStart(2, "0")}:${String(spMinutes(agora)).padStart(2, "0")}`,
      },
    });
  }

  if (novoStatus === "APROVADA") {
    if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR" && session.user.role !== "GERENTE") {
      return NextResponse.json({ error: "Apenas gerentes, gestores ou administradores podem aprovar o fechamento." }, { status: 403 });
    }
    // Claim atômico da transição de status: a PRÓPRIA escrita do status para "APROVADA"
    // é a operação que decide se outra requisição concorrente chegou primeiro — em vez de
    // ler `existing.status` (buscado no início da função, fora de qualquer lock), decidir
    // em memória e só escrever depois (dentro da transação abaixo ou no update genérico lá
    // no fim da função). Esse "ler → decidir → escrever" em passos separados era a causa
    // raiz de uma condição de corrida real encontrada pelo Teulis ao vivo: disparando 2-3
    // chamadas PATCH verdadeiramente EM PARALELO (não uma depois da outra) contra a mesma
    // contagem, todas liam o mesmo status antigo antes de qualquer uma commitar a mudança —
    // nenhuma via a outra, todas passavam no guard antigo, todas criavam seu próprio lote
    // de `StockMovement` na transação abaixo, e só no fim cada uma sobrescrevia o status
    // (last write wins, sem erro). Resultado observado: 3 requisições simultâneas → 3 lotes
    // de `StockMovement` duplicados (0 → 6 movimentos em vez de 2) e as 3 retornando 200.
    //
    // O `updateMany` abaixo, com a condição de status dentro do próprio `where`, é atômico
    // no Postgres — a cláusula WHERE é avaliada e a escrita acontece numa única operação no
    // banco, então duas chamadas concorrentes nunca conseguem as duas "ganhar" a corrida:
    // só uma terá `count === 1` e segue para criar os movimentos; a(s) outra(s) encontra(m)
    // a linha já com status "APROVADA" (não casa mais com o `status: { not: "APROVADA" }`),
    // recebe(m) `count === 0` e retorna(m) 409 imediatamente, sem rodar nenhum efeito
    // colateral no estoque.
    //
    // Importante: o claim bloqueia só quando o status JÁ é "APROVADA" (ou seja, essa
    // chamada é um reenvio/corrida da MESMA aprovação que já rodou ou está rodando). Ele
    // propositalmente NÃO bloqueia partindo de "REABERTA" — reabrir e aprovar de novo é um
    // ciclo de uso legítimo e esperado (corrigir um item e fechar de novo), não um reenvio
    // acidental; bloquear nesse caso deixaria uma contagem reaberta sem como ser fechada de
    // novo. A mensagem "Esta contagem já foi aprovada" cobre o mesmo cenário do DELETE
    // desta rota logo abaixo (que bloqueia APROVADA e REABERTA — lá faz sentido bloquear os
    // dois porque excluir uma contagem que já mexeu no estoque nunca é permitido, mesmo
    // reaberta; aqui o objetivo é só impedir reprocessar a MESMA aprovação duas vezes, seja
    // em paralelo ou em sequência).
    //
    // Nota sobre o ciclo reabrir→editar→aprovar: hoje a aprovação pós-reabertura
    // recria `StockMovement` de TODOS os itens com `quantidadeContada` preenchido (não só
    // os editados depois da reabertura) — decisão deliberada, não um descuido: tratamos
    // cada aprovação como um snapshot completo e auditável do estado contado da loja
    // naquele momento (reforça a mesma garantia usada no primeiro fechamento), em vez de
    // tentar calcular um "diff" de quais itens mudaram desde a última aprovação (exigiria
    // guardar um carimbo por item da última aprovação e abriria espaço para itens ficarem
    // sem movimento registrado por engano). O preço é um histórico mais "gordo" quando só
    // 1-2 itens são corrigidos numa reabertura — aceitável, já que `StockMovement` é só
    // histórico informativo (não é a fonte de verdade do estoque) e o valor final do
    // estoque permanece correto de qualquer forma.
    const aprovadoPor = body.aprovadoPor || session.user.name;
    const aprovadoEm = new Date();
    const claimed = await prisma.stockCount.updateMany({
      where: { id, status: { not: "APROVADA" } },
      data: { status: "APROVADA", aprovadoPor, aprovadoEm },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Esta contagem já foi aprovada." }, { status: 409 });
    }

    const fresh = await prisma.stockCountItem.findMany({ where: { countId: id }, include: { ingredient: true } });
    const approvedItems = fresh.filter((i) => i.quantidadeContada !== null && i.quantidadeContada !== undefined);

    if (approvedItems.length > 0) {
      // Antes disso, cada item contado virava 3 operações (update do estoque
      // do ingrediente, create do movimento, update do status do item) dentro
      // de um único array passado pra `prisma.$transaction(ops)` — a API de
      // "sequential operations" do Prisma, que roda cada operação uma atrás
      // da outra dentro de uma transação interativa com timeout padrão de 5s.
      // Uma contagem mensal cobre todo o estoque da loja (facilmente
      // centenas de ingredientes), e isso derrubaria a aprovação inteira sem
      // nada aplicado (mesmo bug encontrado e corrigido em
      // `syncEmpresaSaiposSales`, ver `src/lib/saipos-sync.ts`). Agora são só
      // 3 operações no total — 1 create em lote, 1 update em lote via SQL
      // cru e 1 updateMany — continuando atômicas entre si porque ainda
      // rodam dentro de `$transaction`, só que sem o custo de N idas ao
      // banco.
      const ingredientIds = approvedItems.map((i) => i.ingredientId);
      const quantidades = approvedItems.map((i) => i.quantidadeContada!);
      const itemIds = approvedItems.map((i) => i.id);

      await prisma.$transaction([
        prisma.stockMovement.createMany({
          data: approvedItems.map((i) => ({
            ingredientId: i.ingredientId,
            empresaId: existing.empresaId,
            type: "INVENTARIO",
            quantidade: i.quantidadeContada!,
            estoqueApos: i.quantidadeContada!,
            motivo: `Contagem ${existing.type === "MENSAL" ? "mensal" : "semanal"} aprovada`,
            origin: "CONTAGEM",
            autorizadoPor: aprovadoPor,
            createdById: session.user.id,
          })),
        }),
        prisma.$executeRaw`
          UPDATE "Ingredient" AS ing
          SET "estoqueAtual" = v.estoque_atual
          FROM UNNEST(${ingredientIds}::text[], ${quantidades}::float8[]) AS v(ingredient_id, estoque_atual)
          WHERE ing."id" = v.ingredient_id
        `,
        prisma.stockCountItem.updateMany({
          where: { id: { in: itemIds } },
          data: { status: "APROVADO" },
        }),
      ]);
    }
  }

  if (novoStatus === "REABERTA") {
    if (session.user.role !== "ADMINISTRADOR") {
      return NextResponse.json({ error: "Apenas o administrador pode reabrir um fechamento." }, { status: 403 });
    }
    if (!body.motivoReabertura) {
      return NextResponse.json({ error: "Informe o motivo da reabertura." }, { status: 400 });
    }
    data.status = "REABERTA";
    data.motivoReabertura = body.motivoReabertura;
  }

  const count = await prisma.stockCount.update({
    where: { id },
    data,
    include: { items: { include: { ingredient: true } } },
  });

  return NextResponse.json({ count });
}

/**
 * Exclui uma contagem — bloqueada para status "APROVADA" e "REABERTA". Nos dois casos a
 * contagem já teve efeito real e permanente no estoque: aprovar (ver bloco `if (novoStatus ===
 * "APROVADA")` acima) cria `StockMovement`s de verdade e atualiza `Ingredient.estoqueAtual`.
 * "REABERTA" só é alcançável a partir de "APROVADA" (a UI só mostra o botão de reabrir com a
 * contagem já aprovada, e `aprovadoPor`/`aprovadoEm` não são limpos ao reabrir) — ou seja,
 * mesmo reaberta, a contagem carrega o histórico de uma aprovação que já mexeu no estoque.
 *
 * `StockMovement` não tem nenhuma foreign key para `StockCount` (é só um texto solto em
 * `motivo`, ex. "Contagem mensal aprovada") — excluir a contagem NÃO reverteria o estoque já
 * alterado, só apagaria o registro de origem, deixando os movimentos já lançados órfãos sem
 * explicação. Por isso a exclusão livre é restrita a contagens que nunca chegaram a mexer no
 * estoque de verdade (RASCUNHO/EM_ANDAMENTO/CONCLUIDA — "concluída" só fecha a contagem semanal,
 * sem nenhum lançamento em `StockMovement`).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.stockCount.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir contagens de estoque." },
      { status: 403 }
    );
  }

  if (existing.status === "APROVADA" || existing.status === "REABERTA") {
    return NextResponse.json(
      {
        error:
          "Esta contagem já foi aprovada e já atualizou o estoque real (criou movimentações de estoque e alterou a quantidade atual dos insumos) — não pode ser excluída. Reabra o fechamento e corrija os itens, se necessário, em vez de excluir.",
      },
      { status: 400 }
    );
  }

  // onDelete: Cascade em StockCountItem.count — os itens somem junto, sem precisar de uma
  // segunda chamada.
  await prisma.stockCount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
