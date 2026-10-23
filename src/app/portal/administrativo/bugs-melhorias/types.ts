/**
 * Tipos compartilhados da Central de Bugs e Melhorias (painel administrativo — Fase 3).
 * Espelham o formato devolvido pelas rotas já existentes (Fase 1, backend):
 * `GET /api/feedback`, `GET /api/feedback/[id]`, `GET /api/feedback/dashboard`,
 * `GET /api/feedback/modulos`. Nenhum tipo aqui grava/lê banco — são só o contrato
 * esperado da resposta JSON, usados pelos componentes client desta tela.
 */

export type FeedbackTipo = "BUG" | "SUGESTAO";

export type UsuarioResumo = { id: string; name: string; email?: string };

/** Formato de cada item de `GET /api/feedback` (`reports[]`) — como a rota usa `include`
 * (nunca `select`), todos os campos escalares do `FeedbackReport` vêm junto, não só os
 * documentados no pedido original. */
export type FeedbackListItem = {
  id: string;
  protocolo: string;
  tipo: FeedbackTipo;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  categoriaProblema: string | null;
  impacto: string | null;
  beneficioEsperado: string | null;
  moduloAfetadoTexto: string | null;
  categoriaId: string | null;
  subcategoriaId: string | null;
  responsavelId: string | null;
  possivelDuplicataDeId: string | null;
  versaoCorrigidaEm: string | null;
  descricaoSolucao: string | null;
  dataConclusao: string | null;
  createdAt: string;
  updatedAt: string;
  usuarioCriador: UsuarioResumo;
  responsavel: { id: string; name: string } | null;
  empresa: { id: string; name: string; color: string } | null;
  categoria: { id: string; name: string } | null;
  subcategoria: { id: string; name: string; category: { name: string } } | null;
  _count: { anexos: number; comentarios: number };
};

export type FeedbackAnexo = {
  id: string;
  fileUrl: string;
  mimeType: string | null;
  fileName: string;
  sizeBytes: number | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

export type FeedbackHistoricoItem = {
  id: string;
  tipoAlteracao: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  comentario: string | null;
  createdAt: string;
  usuarioResponsavel: { id: string; name: string };
};

export type FeedbackComentario = {
  id: string;
  conteudo: string;
  createdAt: string;
  autor: { id: string; name: string };
};

export type FeedbackRelatedRef = { id: string; protocolo: string; titulo: string; status: string };

/** `report.metadados` (`GET /api/feedback/[id]`) — ver `FeedbackMetadata`,
 * `src/lib/feedback-server.ts`. Nunca contém senha/token/cookie (garantido no backend). */
export type FeedbackMetadataInfo = {
  rotaOrigem: string | null;
  navegador: string | null;
  sistemaOperacional: string | null;
  tipoDispositivo: string | null;
  versaoPortal: string | null;
};

/** Formato completo de `GET /api/feedback/[id]` (`report`). */
export type FeedbackDetail = FeedbackListItem & {
  metadados: FeedbackMetadataInfo | null;
  anexos: FeedbackAnexo[];
  historico: FeedbackHistoricoItem[];
  comentarios: FeedbackComentario[];
  possivelDuplicataDe: FeedbackRelatedRef | null;
  duplicatas: FeedbackRelatedRef[];
};

export type DashboardKpis = {
  totalBugs: number;
  totalSugestoes: number;
  bugsAbertos: number;
  bugsCriticosAbertos: number;
  sugestoesEmAvaliacao: number;
  tempoMedioPrimeiraRespostaHoras: number | null;
  tempoMedioResolucaoHoras: number | null;
};

export type DashboardResponse = {
  kpis: DashboardKpis;
  porStatus: { tipo: FeedbackTipo; status: string; count: number }[];
  porPrioridade: { prioridade: string; count: number }[];
  porModulo: { modulo: string; count: number }[];
  evolucaoMensal: { mes: string; bugs: number; sugestoes: number }[];
  statusTerminal: string[];
};

export type ModuloOption = {
  id: string;
  key: string;
  name: string;
  subcategories: { id: string; key: string; name: string }[];
};

export type UserOption = { id: string; name: string };

/** Filtros aplicados pela barra de filtros (topo da tela) — compartilhados entre abas. Ver
 * comentário em `bugs-melhorias-client.tsx` sobre quais abas respeitam cada filtro. */
export type FeedbackFiltros = {
  fromISO?: string;
  toISO?: string;
  categoriaId?: string;
  subcategoriaId?: string;
  status: string;
  prioridade: string;
  usuarioCriadorId: string;
};
