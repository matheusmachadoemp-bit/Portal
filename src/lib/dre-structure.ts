// Estrutura fixa da DRE do Grupo Nord — baseada na planilha DRE_ZARKI_2026.
// Esta estrutura NÃO deve ser alterada; apenas os valores são calculados
// automaticamente a partir dos lançamentos financeiros (contas a pagar/receber).

export type DreLineType = "group" | "result";

export type DreCategoryDef = { key: string; name: string };

export type DreGroupDef = {
  key: string;
  label: string;
  type: "group";
  sign: 1 | -1;
  categories: DreCategoryDef[];
};

export type DreResultDef = {
  key: string;
  label: string;
  type: "result";
  highlight?: boolean;
};

export type DreRowDef = DreGroupDef | DreResultDef;

export const DRE_STRUCTURE: DreRowDef[] = [
  {
    key: "faturamentos",
    label: "Faturamentos",
    type: "group",
    sign: 1,
    categories: [
      { key: "faturamento-produtos", name: "Faturamento de Produtos Restaurante" },
      { key: "faturamento-taxa-entrega", name: "Faturamento de Taxa de Entrega Restaurante" },
      { key: "faturamento-taxa-servico", name: "Faturamento com Taxa de Serviço" },
      { key: "faturamento-comissao-atendimento", name: "Faturamento com Comissão de Atendimento" },
      { key: "acrescimos", name: "Acréscimos" },
      { key: "outros-faturamentos", name: "Outros Faturamentos" },
    ],
  },
  {
    key: "impostos",
    label: "Impostos e deduções",
    type: "group",
    sign: -1,
    categories: [
      { key: "simples", name: "SIMPLES" },
      { key: "icms", name: "ICMS" },
      { key: "outros-impostos", name: "Outros Impostos" },
    ],
  },
  {
    key: "custos-vendas",
    label: "Custos com Vendas",
    type: "group",
    sign: -1,
    categories: [
      { key: "marketplace", name: "Custos Com Marketplace (Ifood+99)" },
      { key: "motoboy", name: "Motoboy" },
      { key: "taxa-entrega-custo", name: "Taxa de Entrega" },
      { key: "comissoes-gorjetas", name: "Comissões e Gorjetas" },
      { key: "tarifas-cartao", name: "Tarifas com Cartão" },
      { key: "descontos", name: "Descontos" },
      { key: "custo-tele-entrega", name: "Custo com Tele entrega" },
      { key: "vale-socios", name: "Vale sócios" },
    ],
  },
  {
    key: "cmv",
    label: "Custos com Mercadoria Vendida (CMV)",
    type: "group",
    sign: -1,
    categories: [
      { key: "insumos", name: "Insumos" },
      { key: "gelo", name: "Gelo" },
      { key: "bebidas", name: "Bebidas" },
      { key: "mercadorias", name: "Mercadorias" },
      { key: "mercado", name: "Mercado" },
      { key: "balanco-estoque", name: "Balanço de estoque" },
    ],
  },
  {
    key: "embalagens",
    label: "Embalagens",
    type: "group",
    sign: -1,
    categories: [
      { key: "embalagens-item", name: "Embalagens" },
      { key: "descartaveis", name: "Descartáveis" },
      { key: "bobinas-etiquetas", name: "Bobinas e etiquetas" },
      { key: "balanco-estoque-embalagem", name: "Balanço de Estoque Embalagem" },
    ],
  },
  { key: "margem-contribuicao", label: "Margem de Contribuição", type: "result", highlight: true },
  {
    key: "despesas-administrativas",
    label: "Despesas Administrativas",
    type: "group",
    sign: -1,
    categories: [
      { key: "agua", name: "Água" },
      { key: "advogada", name: "Advogada" },
      { key: "aluguel", name: "Aluguel de Imóvel" },
      { key: "cartao-despesa", name: "Cartão" },
      { key: "contador", name: "Contador" },
      { key: "consultoria", name: "Consultoria e Assessoria" },
      { key: "consumos", name: "Consumos" },
      { key: "dedetizacao", name: "Dedetização" },
      { key: "energia", name: "Luz - Energia elétrica" },
      { key: "limpeza", name: "Limpeza" },
      { key: "material-limpeza", name: "Material de Limpeza" },
      { key: "manutencao-geral", name: "Manutenção Geral" },
      { key: "utensilios-cozinha", name: "Utensílios de Cozinha" },
      { key: "gas", name: "Gás" },
      { key: "sistemas-softwares", name: "Sistemas e Softwares" },
      { key: "seguro", name: "Seguro" },
      { key: "monitoramento-seguranca", name: "Monitoramento/Segurança e Alarme" },
      { key: "telefone-internet", name: "Telefone/ Internet" },
      { key: "gasolina", name: "Despesas com Gasolina" },
      { key: "outras-despesas-administrativas", name: "Outras Despesas Administrativas" },
    ],
  },
  {
    key: "despesas-pessoas",
    label: "Despesas Com Pessoas",
    type: "group",
    sign: -1,
    categories: [
      { key: "encargos-sociais", name: "Encargos Sociais (INSS, FGTS, Sindicatos, etc..)" },
      { key: "medico-trabalho", name: "Médico do Trabalho / Exames" },
      { key: "salarios-fixos", name: "Salários Fixos + Vale refeição" },
      { key: "free-extras", name: "Free e extras" },
      { key: "antecipacoes", name: "Antecipações" },
      { key: "pro-labore", name: "Pró-Labore" },
      { key: "aniversarios-funcionarios", name: "Aniversários Funcionários" },
      { key: "nutricionista", name: "Nutricionista" },
      { key: "massagem", name: "Massagem" },
      { key: "bonificacao", name: "Bonificação" },
      { key: "confraternizacao", name: "Confraternização" },
      { key: "uniforme", name: "Uniforme" },
      { key: "alimentacao-funcionarios", name: "Alimentação funcionários (lanche, reunião)" },
      { key: "vale-transporte", name: "Vale Transporte" },
      { key: "provisao-13", name: "PROVISÃO 13º" },
      { key: "ferias", name: "Férias" },
      { key: "outras-despesas-pessoal", name: "Outras Despesas com Pessoal" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    type: "group",
    sign: -1,
    categories: [
      { key: "servicos-marketing", name: "Serviços de Marketing + Tráfego pago" },
      { key: "fiado-influencer", name: "Fiado - Influencer" },
      { key: "ads-online", name: "Ads Online" },
      { key: "acoes-offline", name: "Custos com Ações Offline" },
    ],
  },
  {
    key: "despesas-financeiras",
    label: "Despesas Financeiras",
    type: "group",
    sign: -1,
    categories: [
      { key: "juros", name: "Juros" },
      { key: "tarifas-bancarias", name: "Tarifas Bancárias" },
    ],
  },
  { key: "gastos-fixos", label: "Gastos Fixos TOTAIS", type: "result" },
  { key: "lucro-operacional", label: "Lucro/Prejuízo Operacional Líquido", type: "result", highlight: true },
  {
    key: "receitas-nao-operacionais",
    label: "Receitas Não Operacionais",
    type: "group",
    sign: 1,
    categories: [
      { key: "vendas-ativo", name: "Vendas" },
      { key: "emprestimos-aportes", name: "Empréstimos e aportes" },
    ],
  },
  {
    key: "emprestimos-despesa",
    label: "Empréstimos",
    type: "group",
    sign: -1,
    categories: [
      { key: "dividas-passadas", name: "Dívidas Passadas" },
      { key: "emprestimos-pagamento", name: "Empréstimos" },
    ],
  },
  {
    key: "investimentos",
    label: "Investimentos",
    type: "group",
    sign: -1,
    categories: [
      { key: "equipamentos-maquinarios", name: "Equipamentos e Maquinários" },
      { key: "reformas-benfeitorias", name: "Reformas e benfeitorias" },
    ],
  },
  {
    key: "diversos",
    label: "Diversos",
    type: "group",
    sign: -1,
    categories: [
      { key: "rescisoes", name: "Rescisões" },
      { key: "outras-despesas-nao-operacionais", name: "Outras Despesas Não Operacionais" },
    ],
  },
  { key: "despesas-nao-operacionais", label: "Despesas Não Operacionais", type: "result" },
  { key: "lucro-liquido", label: "Lucro/Prejuízo Líquido", type: "result", highlight: true },
  {
    key: "divisao-lucros",
    label: "Divisão de Lucros",
    type: "group",
    sign: -1,
    categories: [{ key: "divisao-lucros-item", name: "Retirada de Sócios / Divisão de Lucros" }],
  },
  { key: "resultado-final", label: "Resultado Final", type: "result", highlight: true },
];

export function allDreCategories(): { key: string; name: string; groupKey: string; sign: 1 | -1 }[] {
  const out: { key: string; name: string; groupKey: string; sign: 1 | -1 }[] = [];
  for (const row of DRE_STRUCTURE) {
    if (row.type === "group") {
      for (const cat of row.categories) {
        out.push({ key: cat.key, name: cat.name, groupKey: row.key, sign: row.sign });
      }
    }
  }
  return out;
}

export function findGroupByCategoryKey(dreKey: string) {
  for (const row of DRE_STRUCTURE) {
    if (row.type === "group" && row.categories.some((c) => c.key === dreKey)) {
      return row;
    }
  }
  return undefined;
}
