import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all pra SUBCATEGORIA de "reservas" sem pasta física própria ainda (visao-geral,
// reservas, calendario, fila-espera, clientes, relatorios — "configuracoes/" e
// "mesas-ambientes/" já têm pasta própria e por isso nunca caem aqui). Mesmo padrão de
// src/app/portal/producao/[sub]/page.tsx — Next.js App Router sempre prioriza pasta literal
// sobre este segmento dinâmico no mesmo nível.
export default async function ReservasGenericSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  return <GenericModulePage categoryKey="reservas" subcategoryKey={sub} />;
}
