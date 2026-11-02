import { GenericModulePage } from "@/components/generic-module/generic-module-page";

// Catch-all pra SUBCATEGORIA de "reservas" sem pasta física própria — com a Etapa 4 completa,
// as 7 subcategorias atuais (visao-geral, reservas, calendario, mesas-ambientes, fila-espera,
// clientes, configuracoes) já têm pasta própria e por isso nunca caem aqui; isto fica como rede
// de segurança para uma subcategoria nova sem tela própria ainda. ("relatorios" existiu como
// subcategoria/pasta própria até a tarefa "reservas-unificar-visao-relatorios", que a mesclou
// dentro de "visao-geral" — ver prisma/migrations/
// 20261102030000_remove_relatorios_subcategoria_reservas; a key "relatorios" não existe mais
// nem na tabela Subcategory, então um link antigo pra /portal/reservas/relatorios cai aqui e
// recebe 404 de `loadGenericContent`, igual qualquer key desconhecida.)
// Mesmo padrão de src/app/portal/producao/[sub]/page.tsx — Next.js App Router sempre prioriza
// pasta literal sobre este segmento dinâmico no mesmo nível.
export default async function ReservasGenericSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  return <GenericModulePage categoryKey="reservas" subcategoryKey={sub} />;
}
