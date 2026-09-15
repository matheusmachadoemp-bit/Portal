import type { FechamentoSubmissaoStatus, FechamentoTipoResposta } from "@prisma/client";
import { spDateTime } from "@/lib/checklist";

// Helpers puros do módulo Fechamento do Dia — mesmo espírito de src/lib/checklist.ts (nenhuma
// consulta ao banco aqui, só cálculo). Os helpers de fuso horário (spDateKey/spStartOfDay/
// spDateTime/weekdayFieldFor) são genéricos o bastante para o Portal inteiro e já vivem em
// @/lib/checklist — reaproveitados diretamente por quem consome este arquivo, sem duplicar (a
// única exceção é `fechamentoReleaseEDueAt` logo abaixo, que importa `spDateTime` para montar um
// cálculo composto específico deste módulo — ver comentário da função).

/**
 * Calcula `releaseAt`/`dueAt` de uma submissão a partir do dia (`dateKey`, "YYYY-MM-DD" de São
 * Paulo) e dos horários "HH:mm" configurados no `FechamentoCargo`. Existe para cobrir o caso do
 * prazo cruzar a meia-noite (ex.: libera 23:35, prazo 00:00 — ajuste pedido pelo usuário depois
 * do padrão inicial 21:00–23:59): a leitura de "prazo à meia-noite" é sempre a meia-noite que
 * vem DEPOIS da liberação, nunca a que já passou no início do mesmo `dateKey`.
 *
 * Sem este ajuste, `spDateTime(dateKey, horarioLimite)` sozinho interpretaria "00:00" como a
 * meia-noite NO INÍCIO do mesmo `dateKey` — ou seja, ~23h35 ANTES da liberação. Uma submissão
 * assim nasceria com `dueAt` no passado (antes até de `releaseAt`), e `computeFechamentoStatus`
 * (abaixo) marcaria ATRASADO o dia inteiro, inclusive horas antes do formulário liberar — e o
 * cron de cobrança (`processFechamentoAlertas`, em @/lib/fechamento-server) notificaria o dono
 * o dia inteiro, não só depois do prazo real vencer.
 *
 * Regra: sempre que o horário-limite, interpretado no mesmo `dateKey` da liberação, cair antes
 * ou no mesmo instante da liberação, o prazo é jogado 24h para frente (dia seguinte). Cargos sem
 * cruzamento de meia-noite (ex.: o padrão anterior 21:00–23:59, ou qualquer config futura em que
 * o prazo continue mais tarde no mesmo dia) não são afetados — a condição só entra em ação
 * quando o prazo é numericamente <= à liberação.
 */
export function fechamentoReleaseEDueAt(
  dateKey: string,
  horarioLiberacao: string,
  horarioLimite: string
): { releaseAt: Date; dueAt: Date } {
  const releaseAt = spDateTime(dateKey, horarioLiberacao);
  let dueAt = spDateTime(dateKey, horarioLimite);
  if (dueAt.getTime() <= releaseAt.getTime()) {
    dueAt = new Date(dueAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { releaseAt, dueAt };
}

/**
 * Calcula o status "ao vivo" de uma submissão a partir do horário-limite e de
 * `enviadoEm` — sempre no servidor, nunca só na tela. Diferente de
 * `computeOccurrenceStatus` (Checklist), aqui só existem 3 estados
 * (`FechamentoSubmissaoStatus` não tem AGENDADO/EM_ANDAMENTO/JUSTIFICADO/
 * CANCELADO/NAO_REALIZADO): uma vez enviada, o status é sempre ENVIADO —
 * mesmo que o envio tenha acontecido depois do prazo (isso não vira um 4º
 * estado; quem precisar saber se foi no prazo compara `enviadoEm` com
 * `dueAt` diretamente, os dois ficam salvos). ATRASADO é reservado para
 * "ainda não enviou E o prazo já passou" — a variação de PENDENTE que
 * importa para o card de status do dia.
 */
export function computeFechamentoStatus(params: {
  dueAt: Date;
  enviadoEm: Date | null;
  now?: Date;
}): FechamentoSubmissaoStatus {
  const { dueAt, enviadoEm, now = new Date() } = params;
  if (enviadoEm) return "ENVIADO";
  return now.getTime() >= dueAt.getTime() ? "ATRASADO" : "PENDENTE";
}

/** Corpo de uma resposta submetida para uma pergunta (formato aceito pela rota de submissão). */
export type FechamentoRespostaInput = {
  valorBooleano?: boolean | null;
  valorTexto?: string | null;
  valorNumero?: number | null;
  valorNota?: number | null;
  opcaoId?: string | null;
  produtoId?: string | null;
  colaboradorId?: string | null;
  fotoUrl?: string | null;
  anexoUrl?: string | null;
};

/**
 * Uma resposta é considerada "preenchida" para fins de obrigatoriedade
 * conforme o tipo da pergunta — cada tipo grava seu valor num campo
 * diferente de `FechamentoResposta` (ver schema.prisma), então "vazio" não é
 * o mesmo teste para todos.
 */
export function fechamentoRespostaEstaPreenchida(
  tipo: FechamentoTipoResposta,
  valor: FechamentoRespostaInput | undefined
): boolean {
  if (!valor) return false;
  switch (tipo) {
    case "SIM_NAO":
      return valor.valorBooleano === true || valor.valorBooleano === false;
    case "TEXTO":
      return !!valor.valorTexto && valor.valorTexto.trim().length > 0;
    case "MULTIPLA_ESCOLHA":
      return !!valor.opcaoId;
    case "NOTA_1_5":
      return valor.valorNota != null;
    case "NUMERO":
      return valor.valorNumero != null;
    case "PRODUTO":
      return !!valor.produtoId;
    case "COLABORADOR":
      return !!valor.colaboradorId;
    case "FOTO":
      return !!valor.fotoUrl;
    case "ANEXO":
      return !!valor.anexoUrl;
    default:
      return false;
  }
}

/**
 * Convenção do catálogo (ver comentário de `FechamentoPergunta.valorPaiQueExibe`
 * no schema): o valor "que exibe" o filho condicional é comparado contra a
 * resposta já registrada para a pergunta pai nesta mesma submissão. Hoje só
 * pais SIM_NAO existem no catálogo seedado, comparados como "true"/"false".
 */
export function fechamentoValorParaComparacaoCondicional(
  tipoPai: FechamentoTipoResposta,
  valor: { valorBooleano?: boolean | null; opcaoId?: string | null; opcaoTexto?: string | null } | undefined
): string | null {
  if (!valor) return null;
  if (tipoPai === "SIM_NAO") {
    return valor.valorBooleano == null ? null : String(valor.valorBooleano);
  }
  if (tipoPai === "MULTIPLA_ESCOLHA") {
    return valor.opcaoTexto ?? null;
  }
  return null;
}

/** Campos de `FechamentoPergunta` usados para decidir obrigatoriedade/condicional. */
export type FechamentoPerguntaValidacao = {
  id: string;
  texto: string;
  tipo: FechamentoTipoResposta;
  obrigatoria: boolean;
  perguntaPaiId: string | null;
  valorPaiQueExibe: string | null;
};

/**
 * Decide se uma pergunta (raiz ou filha) está de fato obrigatória para a submissão atual.
 *
 * Regra (fixada depois de um bug real: uma versão anterior "promovia" qualquer filha com
 * `obrigatoria: false` para obrigatória sempre que o pai batia com `valorPaiQueExibe` — o que
 * tornava TODA pergunta condicional obrigatória assim que aparecia, mesmo as pensadas como
 * campo complementar opcional, ex.: "Como foi resolvido?"/"Descrição"):
 *
 * - `obrigatoria` no catálogo é sempre a fonte da verdade — nunca é promovida de false pra
 *   true por causa do pai.
 * - Pergunta raiz (sem pai): obrigatória <=> `pergunta.obrigatoria`.
 * - Pergunta filha (com pai): obrigatória <=> `pergunta.obrigatoria` **e** ela está visível
 *   agora (o pai foi respondido com o valor que a exibe). Ou seja, uma filha com
 *   `obrigatoria: false` no catálogo continua opcional mesmo quando aparece — só uma filha já
 *   marcada `obrigatoria: true` no catálogo passa a ser exigida, e só quando também visível.
 *
 * Pura (não consulta o banco): quando o pai é MULTIPLA_ESCOLHA, quem chama já precisa ter
 * resolvido o texto da opção respondida em `opcaoTextoPorId` (a rota de submissão faz essa
 * busca em lote antes de chamar esta função).
 */
export function fechamentoPerguntaObrigatoriaAgora(
  pergunta: FechamentoPerguntaValidacao,
  perguntasPorId: Map<string, FechamentoPerguntaValidacao>,
  respostaPorPerguntaId: Map<string, FechamentoRespostaInput>,
  opcaoTextoPorId: Map<string, string>
): boolean {
  if (!pergunta.obrigatoria) return false;
  if (!pergunta.perguntaPaiId) return true;

  const pai = perguntasPorId.get(pergunta.perguntaPaiId);
  const respostaPai = pai ? respostaPorPerguntaId.get(pai.id) : undefined;
  if (!pai || !respostaPai) return false;

  const opcaoTextoPai = respostaPai.opcaoId ? (opcaoTextoPorId.get(respostaPai.opcaoId) ?? null) : null;
  const valorPai = fechamentoValorParaComparacaoCondicional(pai.tipo, {
    valorBooleano: respostaPai.valorBooleano,
    opcaoId: respostaPai.opcaoId,
    opcaoTexto: opcaoTextoPai,
  });
  return valorPai != null && valorPai === pergunta.valorPaiQueExibe;
}

/**
 * Valida o conjunto de respostas de uma submissão contra o catálogo de perguntas do cargo:
 * devolve os textos das perguntas obrigatórias (ver `fechamentoPerguntaObrigatoriaAgora`) que
 * ficaram sem resposta preenchida. Pura — a rota de submissão resolve `opcaoTextoPorId` (busca
 * em lote) antes de chamar.
 */
export function fechamentoPerguntasFaltando(
  perguntas: FechamentoPerguntaValidacao[],
  respostaPorPerguntaId: Map<string, FechamentoRespostaInput>,
  opcaoTextoPorId: Map<string, string>
): string[] {
  const perguntasPorId = new Map(perguntas.map((p) => [p.id, p]));
  const faltando: string[] = [];
  for (const pergunta of perguntas) {
    const obrigatoriaAgora = fechamentoPerguntaObrigatoriaAgora(pergunta, perguntasPorId, respostaPorPerguntaId, opcaoTextoPorId);
    if (obrigatoriaAgora && !fechamentoRespostaEstaPreenchida(pergunta.tipo, respostaPorPerguntaId.get(pergunta.id))) {
      faltando.push(pergunta.texto);
    }
  }
  return faltando;
}
