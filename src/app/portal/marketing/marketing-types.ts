export type TaskDTO = {
  id: string;
  title: string;
  description: string | null;
  objetivo: string | null;
  category: string | null;
  socialNetwork: string | null;
  format: string | null;
  status: string;
  priority: string;
  date: string | null;
  time: string | null;
  checklist: string | null;
  tags: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  campaignId: string | null;
  campaign?: { id: string; name: string } | null;
  responsavelId: string | null;
  responsavel: { id?: string; name: string } | null;
  createdBy?: { id?: string; name: string };
  empresa: { id?: string; name: string; color: string };
  comments?: { id: string; text: string; createdAt: string; author: { name: string } }[];
  files?: { id: string; name: string; fileUrl: string }[];
  createdAt?: string;
};

export type TeamMember = { id: string; name: string };
