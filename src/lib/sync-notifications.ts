import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";

export type SyncIntegration = "SAIPOS" | "META_ADS" | "IFOOD";

const INTEGRATION_LABEL: Record<SyncIntegration, string> = {
  SAIPOS: "Saipos",
  META_ADS: "Meta Ads",
  IFOOD: "iFood",
};

// Acima disso, preferimos resumir a mandar um bloco de erro técnico ilegível
// pra quem não é técnico (ex.: corpo de resposta HTTP inteiro, JSON de erro
// da Graph API) — o errorMessage completo sempre continua salvo em
// SaiposSyncLog/MetaAdsSyncLog pra quem quiser investigar a fundo.
const MAX_ERROR_DETAIL_LENGTH = 160;

function summarizeError(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "motivo não informado";
  if (trimmed.length <= MAX_ERROR_DETAIL_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`;
}

/**
 * Decide se uma falha de sincronização merece notificar agora, dado quantas
 * vezes SEGUIDAS (essa incluída) a mesma integração, na mesma loja, já
 * falhou sem nenhum sucesso no meio.
 *
 * Critério escolhido (documentando a decisão, já que não havia um padrão
 * pronto no projeto pra "evitar notificação duplicada em falha recorrente"):
 * avisa nas 3 primeiras falhas seguidas — pra pegar o problema cedo, com uma
 * notificação por tentativa — e depois só a cada 3ª falha (a cada ~3 dias,
 * já que cada integração roda 1x/dia via cron, mais alguma tentativa manual
 * ocasional pelo botão "Sincronizar agora"). Assim uma falha que persiste
 * por muito tempo continua sendo lembrada periodicamente (não fica
 * esquecida), mas sem virar spam diário do "mesmo aviso de novo". Volta a
 * notificar a partir da 1ª falha assim que uma sincronização der certo de
 * novo (o contador é recalculado a cada chamada a partir do histórico real
 * de SaiposSyncLog/MetaAdsSyncLog, sem nenhum estado novo pra manter).
 */
export function shouldNotifySyncFailure(consecutiveFailures: number): boolean {
  return consecutiveFailures <= 3 || consecutiveFailures % 3 === 0;
}

// Tamanho de cada página lida do histórico de sync ao contar falhas seguidas.
// Não é um teto pra contagem (ver countConsecutiveFailures abaixo) — é só o
// tamanho do lote de cada volta no banco, pra não puxar o histórico inteiro
// de uma vez só quando a integração está saudável (caso comum: já para na
// 1ª página, no primeiro "SUCESSO"). Uma integração realmente quebrada por
// muito tempo sem nenhum sucesso no meio pagina mais de uma vez, mas sem
// limite algum — sempre conta certo, não satura.
const FAILURE_COUNT_PAGE_SIZE = 200;

/**
 * Conta quantas sincronizações seguidas (mais recente primeiro, essa
 * incluída) não terminaram em "SUCESSO" — pára no primeiro "SUCESSO"
 * encontrado. Uma linha presa em "EM_ANDAMENTO" (ex.: processo interrompido
 * no meio, banco caiu) conta como falha também, pelo mesmo motivo: não foi
 * confirmada como bem-sucedida.
 *
 * Sem teto de linhas lidas: pagina pelo histórico até achar um "SUCESSO" ou
 * esgotar os registros. Um `take` fixo aqui já causou um bug real — acima do
 * teto a contagem saturava (sempre retornava o valor do teto), o que por sua
 * vez quebrava o throttle de `shouldNotifySyncFailure` (que depende de
 * `% 3 === 0`) permanentemente a partir daquele ponto.
 */
async function countConsecutiveFailures(integration: SyncIntegration, empresaId: string): Promise<number> {
  let count = 0;
  let skip = 0;

  while (true) {
    const pageArgs = {
      where: { empresaId },
      orderBy: { startedAt: "desc" } as const,
      skip,
      take: FAILURE_COUNT_PAGE_SIZE,
      select: { status: true } as const,
    };
    const rows =
      integration === "SAIPOS"
        ? await prisma.saiposSyncLog.findMany(pageArgs)
        : integration === "META_ADS"
          ? await prisma.metaAdsSyncLog.findMany(pageArgs)
          : await prisma.ifoodSyncLog.findMany(pageArgs);

    if (rows.length === 0) return count;

    for (const row of rows) {
      if (row.status === "SUCESSO") return count;
      count++;
    }

    if (rows.length < FAILURE_COUNT_PAGE_SIZE) return count; // esgotou o histórico, nunca teve sucesso
    skip += FAILURE_COUNT_PAGE_SIZE;
  }
}

/**
 * Notifica os administradores do sistema quando uma sincronização automática
 * (Saipos, Meta Ads ou iFood) falha — pra ninguém descobrir só quando
 * reparar que os números de vendas/tráfego pago no portal estão
 * desatualizados.
 *
 * Vai só pra quem tem cargo ADMINISTRADOR ("dono" do sistema): é uma falha
 * de infraestrutura/integração, não algo operacional de uma loja específica
 * (diferente das notificações de escalonamento de Checklist/Manutenção/
 * Recebimento, que vão pra ADMINISTRADOR + GESTOR + GERENTE da loja) — não
 * teria sentido, por exemplo, notificar o gerente de uma loja sobre o token
 * da API estar vencido, já que ele não tem como resolver isso.
 *
 * Nunca lança: uma falha aqui (ex.: banco fora do ar no pior momento
 * possível) não pode derrubar a resposta de erro que a sincronização já ia
 * devolver de qualquer forma — só loga e segue.
 */
export async function notifySyncFailure(params: {
  empresaId: string;
  integration: SyncIntegration;
  errorMessage: string;
}): Promise<void> {
  const { empresaId, integration, errorMessage } = params;

  try {
    const consecutiveFailures = await countConsecutiveFailures(integration, empresaId);
    if (!shouldNotifySyncFailure(consecutiveFailures)) return;

    const [empresa, admins] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { name: true } }),
      prisma.user.findMany({ where: { active: true, role: "ADMINISTRADOR" }, select: { id: true } }),
    ]);
    if (admins.length === 0) return;

    const label = INTEGRATION_LABEL[integration];
    const empresaName = empresa?.name ?? "uma loja";
    // Math.max defende contra consecutiveFailures = 0 gerar "pela 0ª vez
    // seguida" — hoje inalcançável pelos 2 call sites reais (o log da falha
    // atual já foi gravado antes de chamar notifySyncFailure, então a
    // contagem inclui pelo menos essa 1 linha), mas sem custo manter a guarda.
    const vezes = consecutiveFailures === 1 ? "agora" : `pela ${Math.max(consecutiveFailures, 1)}ª vez seguida`;

    const title = `Sincronização do ${label} falhando — ${empresaName}`;
    const body =
      `A sincronização automática com o ${label} falhou ${vezes}. Os números de ${empresaName} no portal ` +
      `podem estar desatualizados até isso ser resolvido. Detalhe: ${summarizeError(errorMessage)}`;

    await createNotifications(
      admins.map((admin) => ({
        userId: admin.id,
        type: "INTEGRACAO_SYNC_FALHOU",
        title,
        body,
        priority: consecutiveFailures >= 3 ? "CRITICA" : "ATENCAO",
        url: "/portal/configuracoes",
      }))
    );
  } catch (err) {
    console.error(`[sync-notifications] falha ao notificar administradores sobre sync de ${integration}:`, err);
  }
}
