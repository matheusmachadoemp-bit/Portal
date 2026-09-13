// Tipos do payload de GET /api/fechamento-dia/ocorrencias (ver OCORRENCIA_INCLUDE em
// src/app/api/fechamento-dia/ocorrencias/route.ts) — mantidos em sincronia manualmente, já que a
// rota não exporta um tipo próprio para o client consumir.

export type FechamentoGravidade = "INFORMATIVO" | "ATENCAO" | "IMPORTANTE" | "CRITICO";
export type FechamentoOcorrenciaStatus = "ABERTA" | "TRANSFORMADA" | "RESOLVIDA" | "DESCARTADA";

export type UserOption = { id: string; name: string };
export type EmpresaOption = { id: string; name: string };
/** Categoria é escopada por loja (`FechamentoCategoria.empresaId`) — `empresaId` aqui é o que
 * permite filtrar as opções corretas ao editar uma ocorrência de uma loja específica. */
export type CategoriaOption = { id: string; nome: string; icon: string; empresaId: string };

export type Ocorrencia = {
  id: string;
  empresaId: string;
  empresa: { id: string; name: string };
  cargoId: string;
  cargo: { id: string; key: string; nome: string; icon: string };
  data: string; // ISO — dia do fechamento de origem (meia-noite America/Sao_Paulo)

  submissaoId: string;
  submissao: { id: string; enviadoPor: UserOption | null; enviadoEm: string | null };
  perguntaId: string;
  pergunta: { id: string; texto: string };
  respostaId: string;

  categoriaId: string;
  categoria: { id: string; nome: string; icon: string };
  gravidade: FechamentoGravidade;

  descricao: string;
  comoFoiResolvido: string | null;
  pendencia: string | null;

  status: FechamentoOcorrenciaStatus;

  transformadoEmTaskId: string | null;
  transformadoEmTask: { id: string; title: string; status: string } | null;
  transformadoEmChamadoId: string | null;
  transformadoEmChamado: { id: string; protocolo: string; titulo: string; status: string } | null;
  transformadoPorId: string | null;
  transformadoPor: UserOption | null;
  transformadoEm: string | null;

  resolvidoPorId: string | null;
  resolvidoPor: UserOption | null;
  resolvidoEm: string | null;

  createdAt: string;
  updatedAt: string;
};
