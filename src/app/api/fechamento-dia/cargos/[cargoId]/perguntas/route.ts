import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spDateKey, spStartOfDay } from "@/lib/checklist";

const PERGUNTA_SELECT = {
  id: true,
  texto: true,
  orientacao: true,
  tipo: true,
  obrigatoria: true,
  ordem: true,
  abreOcorrencia: true,
  perguntaPaiId: true,
  valorPaiQueExibe: true,
  gravidadeSugerida: true,
  categoriaSugerida: { select: { id: true, nome: true } },
  opcoes: { select: { id: true, texto: true, ordem: true }, orderBy: { ordem: "asc" as const } },
};

/**
 * Formulário de perguntas de um cargo (pra montar a tela dinamicamente —
 * tela em si é fase futura, do Caio) + a submissão do dia informado (ou de
 * hoje), se já existir, com as respostas já registradas — evita uma 3ª rota
 * só pra saber "isso já foi preenchido, e com o quê".
 */
export async function GET(req: Request, { params }: { params: Promise<{ cargoId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cargoId } = await params;
  const cargo = await prisma.fechamentoCargo.findUnique({
    where: { id: cargoId },
    include: { empresa: { select: { id: true, name: true } } },
  });
  if (!cargo || !cargo.ativo) {
    return NextResponse.json({ error: "Cargo do Fechamento do Dia não encontrado." }, { status: 404 });
  }

  const temAcessoALoja = await assertEmpresaAccess(session.user.id, session.user.role, cargo.empresaId);
  if (!temAcessoALoja) {
    return NextResponse.json({ error: "Sem acesso a esta loja." }, { status: 403 });
  }

  const [podeVisualizar, podeExecutar] = await Promise.all([
    hasModulePermission(session.user.id, "fechamento-dia", "canView", cargo.key),
    hasModulePermission(session.user.id, "fechamento-dia", "canExecute", cargo.key),
  ]);
  if (!podeVisualizar && !podeExecutar) {
    return NextResponse.json(
      { error: `Seu perfil de permissão não permite ver o formulário de ${cargo.nome}.` },
      { status: 403 }
    );
  }

  const perguntasCargo = await prisma.fechamentoPerguntaCargo.findMany({
    where: { cargoId: cargo.id, pergunta: { ativa: true } },
    select: { pergunta: { select: PERGUNTA_SELECT } },
    orderBy: { pergunta: { ordem: "asc" } },
  });
  const perguntas = perguntasCargo.map((pc) => pc.pergunta);

  const { searchParams } = new URL(req.url);
  const dateKey = searchParams.get("date") || spDateKey();
  const day = spStartOfDay(dateKey);

  const submissaoAtual = await prisma.fechamentoSubmissao.findUnique({
    where: { cargoId_data: { cargoId: cargo.id, data: day } },
    include: { respostas: true },
  });

  return NextResponse.json({
    cargo: {
      id: cargo.id,
      key: cargo.key,
      nome: cargo.nome,
      icon: cargo.icon,
      empresa: cargo.empresa,
      horarioLiberacao: cargo.horarioLiberacao,
      horarioLimite: cargo.horarioLimite,
    },
    perguntas,
    podeExecutar,
    date: dateKey,
    submissaoAtual,
  });
}
