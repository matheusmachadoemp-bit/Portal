import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import {
  tenteNovamentePrizeId,
  validarProbabilidadeAtiva,
  travarProbabilidadeRoleta,
  ProbabilidadeInvalidaError,
} from "@/lib/roulette-server";
import { isValidBlobUrl } from "@/lib/manutencao-server";

async function findOwnedPrize(id: string, empresaId: string) {
  const existing = await prisma.roulettePrize.findUnique({ where: { id } });
  // O segundo check (`id !== tenteNovamentePrizeId`) é redundante na prática — a sentinela nunca
  // é criada nem devolvida por nenhuma rota admin, então ninguém deveria conhecer o id dela pra
  // tentar editá-la por aqui. Deixado explícito mesmo assim, mesma proteção em profundidade que
  // `perguntas/[id]/route.ts` aplica pro guard redundante de `fixaNotaGeral`.
  if (!existing || existing.empresaId !== empresaId || existing.id === tenteNovamentePrizeId(empresaId)) {
    return null;
  }
  return existing;
}

/**
 * Edita um prêmio da loja ativa — inclui ativar/desativar (`ativo`) e reordenar (`ordem`), mesmo
 * padrão de `PATCH /api/satisfacao-cliente/perguntas/[id]`.
 *
 * Sempre que o resultado da edição deixar o prêmio ATIVO (seja porque já estava e continua, seja
 * porque `ativo: true` acabou de ser ligado), a probabilidade efetiva (a nova, se enviada, senão
 * a que já estava salva) é revalidada contra o restante do catálogo ativo da loja — nunca deixa
 * a soma dos ativos passar de 100 por uma edição (ver `validarProbabilidadeAtiva`). Desativar um
 * prêmio (`ativo: false`) nunca precisa dessa validação — ao contrário, LIBERA orçamento de
 * probabilidade pros outros.
 *
 * Quando a validação é necessária, ela roda dentro da MESMA transação que grava o `update`,
 * travada por `travarProbabilidadeRoleta` (achado #354 da Fase 6: sem isso, duas edições
 * concorrentes na mesma loja podiam ler a mesma soma "ainda cabe" e as duas passarem,
 * ultrapassando 100% juntas) — ver comentário da função no lib. `ProbabilidadeInvalidaError` é a
 * forma de a validação abortar a transação (rollback, sem gravar nada) e ainda assim devolver a
 * MESMA mensagem de erro de sempre pro cliente.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canEdit", "roleta"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar prêmios da Roleta." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível editar prêmios da Roleta no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const existing = await findOwnedPrize(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Prêmio não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const data: Record<string, unknown> = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome do prêmio." }, { status: 400 });
    data.nome = nome;
  }
  if (body.descricao !== undefined) data.descricao = body.descricao ? String(body.descricao).trim() : null;
  if (body.imagemUrl !== undefined) {
    if (body.imagemUrl && !isValidBlobUrl(body.imagemUrl)) {
      return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
    }
    data.imagemUrl = body.imagemUrl ? String(body.imagemUrl).trim() : null;
  }
  if (body.icone !== undefined) data.icone = body.icone ? String(body.icone).trim() : null;

  if (body.quantidadeDisponivel !== undefined) {
    if (body.quantidadeDisponivel === null || body.quantidadeDisponivel === "") {
      data.quantidadeDisponivel = null;
    } else {
      const qtd = Number(body.quantidadeDisponivel);
      if (!Number.isInteger(qtd) || qtd < 0) {
        return NextResponse.json({ error: "Quantidade disponível deve ser um número inteiro, ou deixe em branco para sem limite." }, { status: 400 });
      }
      data.quantidadeDisponivel = qtd;
    }
  }

  if (body.validadeDias !== undefined) {
    const dias = Number(body.validadeDias);
    if (!Number.isInteger(dias) || dias <= 0) {
      return NextResponse.json({ error: "Validade (em dias) deve ser um número inteiro maior que zero." }, { status: 400 });
    }
    data.validadeDias = dias;
  }

  if (body.ordem !== undefined) {
    if (!Number.isFinite(body.ordem)) return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
    data.ordem = Math.round(body.ordem);
  }

  let probabilidadePercent: number | undefined;
  if (body.probabilidadePercent !== undefined) {
    probabilidadePercent = Number(body.probabilidadePercent);
    if (!Number.isFinite(probabilidadePercent)) {
      return NextResponse.json({ error: "Probabilidade (%) inválida." }, { status: 400 });
    }
    data.probabilidadePercent = probabilidadePercent;
  }

  let ativo: boolean | undefined;
  if (body.ativo !== undefined) {
    ativo = !!body.ativo;
    data.ativo = ativo;
  }

  const ativoEfetivo = ativo ?? existing.ativo;

  let premio;
  try {
    premio = await prisma.$transaction(async (tx) => {
      if (ativoEfetivo) {
        // Trava a concorrência de validação/gravação de probabilidade desta loja ANTES de
        // conferir o orçamento (ver `travarProbabilidadeRoleta`) — evita 2 edições concorrentes
        // lendo a mesma soma "ainda cabe" e as duas passando, juntas ultrapassando 100%.
        await travarProbabilidadeRoleta(tx, empresa.id);
        const percentEfetivo = probabilidadePercent ?? existing.probabilidadePercent;
        const erro = await validarProbabilidadeAtiva(empresa.id, percentEfetivo, existing.id, tx);
        if (erro) throw new ProbabilidadeInvalidaError(erro);
      }
      return tx.roulettePrize.update({ where: { id }, data });
    });
  } catch (e) {
    if (e instanceof ProbabilidadeInvalidaError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  return NextResponse.json({ premio });
}

/**
 * Exclui um prêmio da loja ativa.
 *
 * Decisão de negócio: um prêmio que JÁ FOI GANHO por algum cliente (`quantidadeGanha > 0` — o
 * que, na prática, também implica ter pelo menos 1 `RouletteSpin` vinculado, mas checamos os dois
 * por segurança) nunca pode ser apagado de verdade — apagar destruiria a referência que o
 * histórico de giros (`RouletteSpin.prize`) e, na Fase 7, o resgate do prêmio dependem para exibir
 * nome/imagem/validade. Bloqueia com 400 pedindo pra desativar manualmente (via PATCH `ativo:
 * false`) em vez de apagar — mesmo padrão já usado pelos outros 4 precedentes deste tipo de regra
 * no projeto (`DELETE /api/estoque/fornecedores/[id]`, `.../manutencao/prestadores/[id]`,
 * `.../manutencao/equipamentos/[id]` e `.../rh/escala-folgas/day-off-types/[id]`): nunca converte
 * a ação sozinho (evitaria o admin decidir explicitamente "quero excluir" vs. "quero desativar"),
 * e mantém o mesmo formato de resposta uniforme (erro 400 + mensagem, tratado igual em qualquer
 * tela por "captura erro, mostra toast") em vez de um formato de sucesso especial só desta rota.
 * Só um prêmio nunca usado é de fato removido da tabela.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "satisfacao-cliente", "canDelete", "roleta"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir prêmios da Roleta." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível excluir prêmios da Roleta no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const existing = await findOwnedPrize(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Prêmio não encontrado." }, { status: 404 });

  const giroCount = await prisma.rouletteSpin.count({ where: { prizeId: id } });
  const emUso = existing.quantidadeGanha > 0 || giroCount > 0;

  if (emUso) {
    return NextResponse.json(
      { error: "Este prêmio já foi ganho por algum cliente e não pode ser excluído. Desative-o em vez disso." },
      { status: 400 }
    );
  }

  await prisma.roulettePrize.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
