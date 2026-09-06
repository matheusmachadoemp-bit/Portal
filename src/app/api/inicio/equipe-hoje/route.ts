import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserEmpresas } from "@/lib/empresa";
import {
  perfilInicioForRole,
  perfilPodeVerPainelGerencial,
  loadEquipePresenteHoje,
  loadEquipeOcorrenciasHoje,
} from "@/lib/inicio";

/**
 * "Equipe de hoje" da Tela de Início (painéis de Proprietário e Gerente,
 * mesma restrição de /api/inicio/indicadores). Visão da LOJA INTEIRA, sem
 * filtro de setor — isso fica para quando o Líder tiver sua própria versão
 * desta tela, em fase futura.
 *
 * "De folga" sempre volta como lista vazia: não existe no schema nenhuma
 * escala/tabela de turno que diga quem está programado para folgar num dia
 * específico (`Employee.escala` é só um campo de texto livre, ex. "6x1").
 * Ver src/lib/inicio.ts (comentário acima de `loadEquipeOcorrenciasHoje`)
 * para o detalhe completo do que foi e não foi incluído neste painel.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = perfilInicioForRole(session.user.role);
  if (!perfilPodeVerPainelGerencial(perfil)) {
    return NextResponse.json({ error: "Sem acesso a este painel." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  if (!empresaId) {
    return NextResponse.json({ error: "Parâmetro empresaId é obrigatório." }, { status: 400 });
  }

  // Nunca confiar cegamente no empresaId da query string: precisa estar
  // entre as lojas que o usuário logado pode ver (mesma checagem de
  // src/app/api/empresa-context/route.ts).
  const empresasPermitidas = await getUserEmpresas(session.user.id, session.user.role);
  if (!empresasPermitidas.some((e) => e.id === empresaId)) {
    return NextResponse.json({ error: "Loja inválida ou sem permissão." }, { status: 403 });
  }

  const [presentes, ocorrencias] = await Promise.all([
    loadEquipePresenteHoje(empresaId),
    loadEquipeOcorrenciasHoje(empresaId),
  ]);

  return NextResponse.json({
    presentes,
    totalPresentes: presentes.length,
    deFolga: [],
    ausencias: ocorrencias.ausencias,
    atestados: ocorrencias.atestados,
    atrasos: ocorrencias.atrasos,
  });
}
