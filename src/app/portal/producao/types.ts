export type CategoriaOption = { id: string; name: string; color: string; icon: string };
export type UserOption = { id: string; name: string };

export type ProductionItemIngredienteDTO = {
  id: string;
  ingredientId: string;
  quantidadeUsada: number;
  unidade: string;
  ingredient: { id: string; name: string; unidade: string };
};

export type ProductionItemDTO = {
  id: string;
  name: string;
  unidade: string;
  fotoUrl: string | null;
  descricao: string | null;
  tipo: "FIXO" | "VARIAVEL";
  quantidadeMinima: number;
  margemSeguranca: number;
  tamanhoLote: number | null;
  validadeDias: number | null;
  horarioLimitePadrao: string | null;
  prioridadePadrao: string;
  ingredientId: string | null;
  active: boolean;
  category: CategoriaOption;
  ingredientes: ProductionItemIngredienteDTO[];
  stock: { saldoAtual: number } | null;
};

export type ProductionOrderDTO = {
  id: string;
  date: string;
  necessidadePrevista: number;
  estoqueProntoSnapshot: number;
  quantidadeSugerida: number;
  quantidadeAprovada: number | null;
  quantidadeProduzida: number | null;
  responsavelId: string | null;
  responsavel: UserOption | null;
  prazo: string;
  prioridade: string;
  status: string;
  horaInicio: string | null;
  horaFim: string | null;
  observacao: string | null;
  fotoUrl: string | null;
  validade: string | null;
  ajusteMotivo: string | null;
  ajusteValorOriginal: number | null;
  ajusteValorAlterado: number | null;
  ajustePor: UserOption | null;
  ajusteEm: string | null;
  productionItem: {
    id: string;
    name: string;
    unidade: string;
    category: CategoriaOption;
  };
};
