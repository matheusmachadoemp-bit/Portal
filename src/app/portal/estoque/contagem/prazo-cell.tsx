import { Badge } from "@/components/ui/stat-card";

// Fuso fixo (São Paulo): o mesmo texto no servidor (SSR) e no navegador, sem aviso de hidratação.
const PRAZO_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Prazo de uma contagem (ver `StockCount.prazo`) + selo "Atrasada" se já passou e a contagem
 *  ainda não foi concluída/aprovada. `prazo` null = sem prazo. */
export function PrazoCell({ prazo, status }: { prazo: string | null; status: string }) {
  if (!prazo) return <span className="text-nord-gray">—</span>;
  const date = new Date(prazo);
  // Selo de "atrasada" é por natureza relativo ao horário atual; reavalia a cada render/atualização da lista.
  // eslint-disable-next-line react-hooks/purity -- depende do relógio de propósito
  const atrasada = date.getTime() < Date.now() && status !== "CONCLUIDA" && status !== "APROVADA";
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={atrasada ? "text-nord-danger" : "text-nord-gray"}>{PRAZO_FORMAT.format(date).replace(",", "")}</span>
      {atrasada && <Badge tone="danger">Atrasada</Badge>}
    </span>
  );
}
