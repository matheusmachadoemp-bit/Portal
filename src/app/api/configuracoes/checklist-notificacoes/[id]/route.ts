import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Edição das configurações de notificação/cobrança automática de um checklist
// já existente — Configurações > Notificações de checklist. Rota separada
// (e estreita: só os 5 campos abaixo) de propósito, em vez de reaproveitar
// `PATCH /api/checklist/templates/[id]` com um corpo parcial: aquela rota
// recalcula TODOS os campos do template a partir do body recebido, com
// fallback fixo quando algum vem ausente (não é um patch parcial de
// verdade — ver nota em `toggleActive`, checklist-client.tsx), então
// reaproveitá-la daqui apagaria nome/responsável/itens/etc. do checklist
// sempre que esta tela salvasse só os campos de notificação.
//
// Permissão: mesma regra das outras rotas de escrita da tela Configurações
// (ifood/saipos/meta-ads/meta-cmv, ver src/app/api/configuracoes/meta-cmv/
// route.ts) — ADMINISTRADOR/GESTOR com `configuracoes:canEdit`. De propósito
// NÃO é a permissão `tarefas:checklist:canEdit` que controla a tela de
// Tarefas > Checklist em si — decisão confirmada com o líder do projeto: se
// um dia for necessário abrir esta configuração para outros perfis, é um
// ajuste pontual de permissão, não um redesenho.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para alterar esta configuração." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "configuracoes", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;

  // O checklist precisa pertencer a uma das lojas que este usuário pode ver
  // agora (a loja ativa, ou todas no modo Grupo Nord) — nunca confia só no
  // id vindo da URL. Diferente de `requireActiveSingleEmpresa()` (usado
  // pelas outras rotas desta tela): aqui a edição é por checklist (cada
  // template já carrega sua própria `empresaId`), então funciona também no
  // modo Grupo Nord, sem exigir trocar a loja ativa no menu lateral para
  // editar um checklist de outra loja.
  const template = await prisma.checklistTemplate.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });
  }

  const body = await req.json();
  const cobrancaAtiva = Boolean(body.cobrancaAtiva);

  const minutosInput: Record<string, unknown> = {
    avisoAntesMinutos: body.avisoAntesMinutos,
    avisoAtrasoResponsavelMinutos: body.avisoAtrasoResponsavelMinutos,
    alertaCriticoMinutos: body.alertaCriticoMinutos,
    naoRealizadoMinutos: body.naoRealizadoMinutos,
  };
  const minutos: Record<string, number> = {};
  for (const [key, value] of Object.entries(minutosInput)) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "Os campos de tempo precisam ser números inteiros (em minutos), maiores ou iguais a 0." },
        { status: 400 }
      );
    }
    minutos[key] = n;
  }

  // Os 3 limiares contados a partir do horário-limite (ver dueEscalationLevels
  // em src/lib/checklist.ts) precisam estar em ordem crescente — fora dessa
  // ordem o motor não quebra (cada limiar é avaliado de forma independente),
  // mas o resultado fica confuso (ex.: marcar como não realizado antes do
  // alerta crítico chegar a disparar).
  if (
    minutos.avisoAtrasoResponsavelMinutos > minutos.alertaCriticoMinutos ||
    minutos.alertaCriticoMinutos > minutos.naoRealizadoMinutos
  ) {
    return NextResponse.json(
      {
        error:
          "Os prazos precisam seguir esta ordem: cobrança do responsável ≤ alerta crítico ≤ marcar como não realizado.",
      },
      { status: 400 }
    );
  }

  const updated = await prisma.checklistTemplate.update({
    where: { id },
    data: {
      cobrancaAtiva,
      avisoAntesMinutos: minutos.avisoAntesMinutos,
      avisoAtrasoResponsavelMinutos: minutos.avisoAtrasoResponsavelMinutos,
      alertaCriticoMinutos: minutos.alertaCriticoMinutos,
      naoRealizadoMinutos: minutos.naoRealizadoMinutos,
    },
    select: {
      id: true,
      cobrancaAtiva: true,
      avisoAntesMinutos: true,
      avisoAtrasoResponsavelMinutos: true,
      alertaCriticoMinutos: true,
      naoRealizadoMinutos: true,
    },
  });

  return NextResponse.json({ template: updated });
}
