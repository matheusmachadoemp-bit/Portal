import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all pra SUBCATEGORIA de "reservas" sem pasta física própria — com a Etapa 4 completa,
// todas as 8 subcategorias atuais (visao-geral, reservas, calendario, mesas-ambientes,
// fila-espera, clientes, relatorios, configuracoes) já têm pasta própria e por isso nunca caem
// aqui; isto fica como rede de segurança para uma subcategoria nova sem tela própria ainda.
// Mesmo padrão de src/app/portal/producao/[sub]/page.tsx — Next.js App Router sempre prioriza
// pasta literal sobre este segmento dinâmico no mesmo nível.
export default async function ReservasGenericSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  return <GenericModulePage categoryKey="reservas" subcategoryKey={sub} />;
}
