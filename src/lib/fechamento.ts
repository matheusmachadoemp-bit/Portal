import type { FechamentoSubmissaoStatus, FechamentoTipoResposta } from "@prisma/client";

// Helpers puros do módulo Fechamento do Dia — mesmo espírito de src/lib/checklist.ts (nenhuma
// consulta ao banco aqui, só cálculo). Os helpers de fuso horário (spDateKey/spStartOfDay/
// spDateTime/weekdayFieldFor) são genéricos o bastante para o Portal inteiro e já vivem em
// @/lib/checklist — reaproveitados diretamente por quem consome este arquivo, sem duplicar.

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
