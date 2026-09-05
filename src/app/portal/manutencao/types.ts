export type UserOption = { id: string; name: string };
export type EmpresaOption = { id: string; name: string; color: string };

export type AnexoDTO = {
  id: string;
  name: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  tipo: "FOTO" | "VIDEO" | "DOCUMENTO";
  uploadedBy: UserOption;
  createdAt: string;
};

export type AnexoDraft = { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number; tipo?: "FOTO" | "VIDEO" | "DOCUMENTO" };

export type EquipamentoDTO = {
  id: string;
  codigo: string;
  empresaId: string;
  empresa: EmpresaOption;
  nome: string;
  fotoUrl: string | null;
  setor: string;
  localizacao: string | null;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  dataCompra: string | null;
  valorCompra: number | null;
  fornecedor: string | null;
  numeroNotaFiscal: string | null;
  garantiaAte: string | null;
  vidaUtilEstimadaMeses: number | null;
  frequenciaManutencao: string;
  ultimaManutencaoEm: string | null;
  proximaManutencaoEm: string | null;
  prestadorRecomendado: string | null;
  observacoes: string | null;
  status: "FUNCIONANDO" | "ATENCAO" | "EM_MANUTENCAO" | "PARADO" | "DESATIVADO" | "DESCARTADO";
  createdAt: string;
  updatedAt: string;
  _count?: { chamados: number };
  anexos?: AnexoDTO[];
};

export type ChamadoHistoricoDTO = {
  id: string;
  action: string;
  detail: string | null;
  user: UserOption | null;
  createdAt: string;
};

export type ComentarioDTO = {
  id: string;
  text: string;
  author: UserOption;
  createdAt: string;
};

export type ChamadoDTO = {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  empresaId: string;
  empresa: EmpresaOption;
  setor: string;
  localEspecifico: string | null;
  categoria: string;
  equipamentoId: string | null;
  equipamento: { id: string; nome: string; codigo: string; fotoUrl: string | null } | null;
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  status: string;
  solicitanteId: string;
  solicitante: UserOption;
  responsavelId: string | null;
  responsavel: UserOption | null;
  prazo: string | null;
  descricaoSolucao: string | null;
  resolvidoEm: string | null;
  createdAt: string;
  updatedAt: string;
  anexos?: AnexoDTO[];
  comentarios?: ComentarioDTO[];
  historico?: ChamadoHistoricoDTO[];
  registros?: ManutencaoRegistroDTO[];
  _count?: { comentarios: number };
};

export type ManutencaoRegistroDTO = {
  id: string;
  empresaId: string;
  equipamentoId: string;
  equipamento: { id: string; nome: string; codigo: string };
  chamadoId: string | null;
  tipo: string;
  data: string;
  horaInicio: string | null;
  horaFim: string | null;
  servicoExecutado: string;
  problemaEncontrado: string | null;
  solucaoAplicada: string | null;
  pecasTrocadas: string | null;
  prestador: string | null;
  responsavelId: string;
  responsavel: UserOption;
  valorMaoDeObra: number;
  valorPecas: number;
  valorOutros: number;
  valorTotal: number;
  garantiaServico: string | null;
  proximaManutencaoEm: string | null;
  observacoes: string | null;
  createdAt: string;
  anexos?: AnexoDTO[];
};
