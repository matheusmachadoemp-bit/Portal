export type UserOption = { id: string; name: string };
export type EmpresaOption = { id: string; name: string; color: string };

export type ChecklistItemDTO = {
  id: string;
  text: string;
  done: boolean;
  order: number;
  doneAt: string | null;
  doneById: string | null;
};

export type TaskDTO = {
  id: string;
  empresaId: string;
  empresa: EmpresaOption;
  title: string;
  description: string | null;
  sectorKey: string;
  priority: "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";
  status: "PENDENTE" | "EM_ANDAMENTO" | "AGUARDANDO_VALIDACAO" | "CONCLUIDA";
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  recurrenceId: string | null;
  proofType: "NENHUMA" | "FOTO" | "ARQUIVO" | "TEXTO" | "FOTO_TEXTO";
  requiresValidation: boolean;
  validatorId: string | null;
  validator: UserOption | null;
  sourceType: string;
  sourceId: string | null;
  createdById: string;
  createdBy: UserOption;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignees: { id: string; userId: string; user: UserOption }[];
  checklist: ChecklistItemDTO[];
  overdue: boolean;
  _count?: { comments: number; attachments: number };
};

export type TaskFilters = {
  empresaId: string;
  sectorKey: string;
  responsavelId: string;
  status: string;
  priority: string;
  periodo: string;
  from: string;
  to: string;
  q: string;
};

export const EMPTY_FILTERS: TaskFilters = {
  empresaId: "",
  sectorKey: "",
  responsavelId: "",
  status: "",
  priority: "",
  periodo: "",
  from: "",
  to: "",
  q: "",
};
