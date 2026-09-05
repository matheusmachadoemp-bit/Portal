import { invitationState, loadInvitationByToken } from "@/lib/satisfaction-server";
import { RespostaClient } from "./resposta-client";

const STATE_MESSAGE: Record<string, { title: string; body: string }> = {
  invalido: { title: "Link inválido", body: "Esse link de pesquisa não existe ou já expirou." },
  encerrada: { title: "Pesquisa encerrada", body: "Essa pesquisa não está mais aceitando respostas." },
  "ja-respondido": { title: "Resposta já enviada", body: "Você já respondeu essa pesquisa. Obrigado pela participação!" },
};

export default async function ResponderPesquisaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await loadInvitationByToken(token);
  const state = invitationState(invitation);

  if (state !== "ok") {
    const msg = STATE_MESSAGE[state];
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-nord-panel border border-nord-border rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-white font-semibold text-lg">{msg.title}</h1>
          <p className="text-nord-gray text-sm">{msg.body}</p>
        </div>
      </div>
    );
  }

  const survey = invitation!.survey;
  const serialized = {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    anonima: survey.anonima,
    permitirComentarioAdicional: survey.permitirComentarioAdicional,
    embaralharPerguntas: survey.embaralharPerguntas,
    exibirResultadoColaborador: survey.exibirResultadoColaborador,
    perguntas: survey.perguntas.map((q) => ({
      id: q.id,
      tipo: q.tipo,
      titulo: q.titulo,
      orientacao: q.orientacao,
      obrigatoria: q.obrigatoria,
      opcoes: q.opcoes.map((o) => ({ id: o.id, texto: o.texto })),
    })),
  };

  return (
    <div className="min-h-screen w-full bg-nord-black">
      <RespostaClient token={token} survey={serialized} empresa={invitation!.employee.empresa} />
    </div>
  );
}
