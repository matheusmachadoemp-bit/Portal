// Avaliações — Fase 1 (só iFood). 2ª rede de segurança da resposta automática (ver bloco
// "AVALIAÇÕES" em prisma/schema.prisma e `Empresa.avaliacoesAutoReplyEnabled` para a 1ª):
// mesmo com o toggle da loja ligado, uma avaliação com indício de problema sério (intoxicação,
// objeto estranho, hospital, etc.) NUNCA publica uma resposta sozinha — cai em
// `PRECISA_REVISAO_MANUAL`, pra um humano decidir o que fazer antes de qualquer coisa ir ao ar
// em nome do negócio. Decisão do Matheus: risco reputacional/legal real demais pra confiar
// 100% numa resposta gerada sem revisão nesses casos específicos.
//
// Comparação case-insensitive e sem acento (mesmo padrão já usado para reconhecer forma de
// pagamento/plataforma na importação da Saipos — ver `normalize()` em
// `src/lib/saipos-mapper.ts` e a regra documentada em CLAUDE.md sobre nunca deixar um valor
// novo cair silenciosamente numa categoria genérica).
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Lista razoável, não exaustiva — cobre os cenários mais graves (contaminação alimentar/
// intoxicação, atendimento médico, corpo estranho na comida). Ajustável conforme casos reais
// aparecerem (ex.: se um termo novo aparecer repetidamente em avaliações que deveriam ter caído
// aqui e não caíram, é só adicionar à lista — não precisa de migration, é só código).
const RISK_KEYWORDS: string[] = [
  // "passar mal" tem muitas variações de pessoa/tempo verbal e frequentemente aparece com um
  // intensificador no meio ("passei MUITO mal") — testado ao vivo contra esse caso real durante
  // a validação desta tarefa, que um match só por "passei mal"/"passamos mal" (substring exata,
  // sem o "muito" no meio) deixava passar batido. Lista as combinações mais comuns em vez de um
  // regex com `\s+` (mais simples de ler/ajustar, e `containsRiskKeyword` já normaliza
  // acento/caixa antes de comparar).
  "passei mal",
  "passei muito mal",
  "passou mal",
  "passou muito mal",
  "passamos mal",
  "passamos muito mal",
  "passaram mal",
  "passaram muito mal",
  "intoxica", // cobre "intoxicação", "intoxicado", "intoxicada"
  "hospital",
  "pronto socorro",
  "pronto-socorro",
  "ambulancia",
  "vomit", // cobre "vômito", "vomitei", "vomitando"
  "diarreia",
  "envenena", // cobre "envenenado", "envenenamento"
  "objeto estranho",
  "corpo estranho",
  "inseto",
  "barata",
  "larva",
  "mosca",
  // "cabelo" sozinho (sem contexto de comida) é falso positivo real — achado do Teulis na
  // revisão: "o atendente tinha o cabelo bem cuidado" não tem nada a ver com cabelo na comida.
  // As frases abaixo já cobrem o cenário de risco de verdade sem o substantivo sozinho.
  "cabelo na comida",
  "achei um cabelo",
  "tinha cabelo",
  "veio com cabelo",
  "vidro",
  "plastico na comida",
  "mofo",
  "mofado",
  "podre",
  // "vencido" sozinho REMOVIDO (era falso positivo real — achado do Teulis: "cartão de crédito
  // vencido" não tem nada a ver com produto estragado). "fora da validade"/"mofo"/"mofado"/
  // "podre" abaixo já cobrem o cenário de produto vencido/estragado sem essa ambiguidade.
  "fora da validade",
  // "alerg" (raiz, sem terminação) de propósito — testado ao vivo que "alergia"/"alergico"
  // (terminações fixas) não batem com "alérgica"/"alergênico"/etc.; a raiz cobre qualquer
  // flexão de gênero/grau sem precisar listar cada uma.
  "alerg",
  // "processar" sozinho REMOVIDO (era falso positivo real — achado do Teulis: "demorou pra
  // processar meu pedido" não é ameaça jurídica). As frases abaixo são específicas de ameaça
  // de ação judicial de verdade.
  "processo judicial",
  "vou processar",
  "processar voces",
  "processar a empresa",
  "entrar com processo",
  "procon",
];

/**
 * Verifica se um texto de avaliação contém alguma palavra-chave de risco (case-insensitive,
 * sem acento). `comment` nulo/vazio nunca é de risco — mas lembre que, por regra do iFood,
 * avaliação sem comentário também nunca chega a `NOT_REPLIED` (é publicada sozinha, ver
 * `AUTO_PUBLICADA_SEM_RESPOSTA`), então esta função normalmente só é chamada com um comentário
 * de fato presente.
 */
export function containsRiskKeyword(comment: string | null | undefined): boolean {
  if (!comment) return false;
  const normalized = normalize(comment);
  return RISK_KEYWORDS.some((keyword) => normalized.includes(normalize(keyword)));
}

/** Exportado só para o endpoint de configurações poder listar as palavras-chave na tela (texto informativo, sem expor lógica de match). */
export function riskKeywordsForDisplay(): string[] {
  return [...RISK_KEYWORDS];
}
