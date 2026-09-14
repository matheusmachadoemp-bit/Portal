"use client";

import { useState } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { Camera, FileText, Paperclip, Star } from "lucide-react";
import type { FechamentoTipoResposta } from "@prisma/client";
import type { FechamentoRespostaInput } from "@/lib/fechamento";
import { fechamentoRespostaEstaPreenchida } from "@/lib/fechamento";
import { sanitizeFileName } from "@/lib/upload";

export type PerguntaDTO = {
  id: string;
  texto: string;
  orientacao: string | null;
  tipo: FechamentoTipoResposta;
  obrigatoria: boolean;
  perguntaPaiId: string | null;
  valorPaiQueExibe: string | null;
  opcoes: { id: string; texto: string }[];
};

type Pessoa = { id: string; name: string };

/**
 * Nome de exibição de um anexo salvo — o schema só guarda a URL (sem o nome
 * original do arquivo), então usamos o último trecho do caminho da URL. O
 * Vercel Blob acrescenta um sufixo aleatório antes da extensão (ex.:
 * "planilha-fK3xQ29z1a.xlsx"); não tentamos removê-lo aqui (uma tentativa
 * anterior com regex acabava cortando nomes legítimos com hífen no meio,
 * ex. "planilha-perdas" virava só "planilha") — prefira um nome um pouco
 * menos limpo a um nome errado.
 */
function nomeArquivoFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "arquivo anexado");
  } catch {
    return "arquivo anexado";
  }
}

/** Só usada em `renderEdicao` (modo somente-leitura usa `renderLeitura`, sem estes botões). */
function classeToggle(selecionado: boolean): string {
  return selecionado ? "bg-nord-blue border-nord-blue text-white" : "bg-nord-panel border-nord-border text-white hover:border-white/30";
}

export function PerguntaItem({
  pergunta,
  valor,
  onChange,
  readOnly,
  obrigatoriaAgora,
  destacarErro,
  produtos,
  colaboradores,
  indent,
}: {
  pergunta: PerguntaDTO;
  valor: FechamentoRespostaInput | undefined;
  onChange: (perguntaId: string, patch: FechamentoRespostaInput) => void;
  readOnly: boolean;
  obrigatoriaAgora: boolean;
  destacarErro: boolean;
  produtos: Pessoa[];
  colaboradores: Pessoa[];
  indent: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(file: File | undefined, campo: "fotoUrl" | "anexoUrl") {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
      if (campo === "fotoUrl") onChange(pergunta.id, { fotoUrl: blob.url });
      else onChange(pergunta.id, { anexoUrl: blob.url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  const respondida = fechamentoRespostaEstaPreenchida(pergunta.tipo, valor);

  function renderEdicao() {
    switch (pergunta.tipo) {
      case "SIM_NAO":
        return (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChange(pergunta.id, { valorBooleano: true })}
              className={`py-3.5 rounded-xl text-sm font-semibold border transition ${classeToggle(valor?.valorBooleano === true)}`}
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => onChange(pergunta.id, { valorBooleano: false })}
              className={`py-3.5 rounded-xl text-sm font-semibold border transition ${classeToggle(valor?.valorBooleano === false)}`}
            >
              Não
            </button>
          </div>
        );
      case "MULTIPLA_ESCOLHA":
        return (
          <div className="flex flex-wrap gap-2">
            {pergunta.opcoes.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(pergunta.id, { opcaoId: o.id })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${classeToggle(valor?.opcaoId === o.id)}`}
              >
                {o.texto}
              </button>
            ))}
          </div>
        );
      case "NOTA_1_5":
        return (
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Nota ${n} de 5`}
                onClick={() => onChange(pergunta.id, { valorNota: n })}
                className="p-1 -m-1"
              >
                <Star size={30} className={(valor?.valorNota ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-nord-border"} />
              </button>
            ))}
            {valor?.valorNota != null && <span className="text-sm text-nord-gray ml-1">{valor.valorNota} de 5</span>}
          </div>
        );
      case "TEXTO":
        return (
          <textarea
            className="input min-h-[88px]"
            placeholder="Escreva sua resposta..."
            value={valor?.valorTexto ?? ""}
            onChange={(e) => onChange(pergunta.id, { valorTexto: e.target.value })}
          />
        );
      case "NUMERO":
        return (
          <input
            type="number"
            inputMode="decimal"
            className="input"
            placeholder="0"
            value={valor?.valorNumero ?? ""}
            onChange={(e) => onChange(pergunta.id, { valorNumero: e.target.value === "" ? null : Number(e.target.value) })}
          />
        );
      case "PRODUTO":
        return (
          <select className="input" value={valor?.produtoId ?? ""} onChange={(e) => onChange(pergunta.id, { produtoId: e.target.value || null })}>
            <option value="">Selecione o produto...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        );
      case "COLABORADOR":
        return (
          <select
            className="input"
            value={valor?.colaboradorId ?? ""}
            onChange={(e) => onChange(pergunta.id, { colaboradorId: e.target.value || null })}
          >
            <option value="">Selecione o colaborador...</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        );
      case "FOTO":
        return (
          <div className="space-y-2">
            <label className={`btn-outline inline-flex cursor-pointer w-fit ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              <Camera size={14} /> {uploading ? "Enviando..." : valor?.fotoUrl ? "Trocar foto" : "Tirar/enviar foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0], "fotoUrl")}
              />
            </label>
            {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
            {valor?.fotoUrl && (
              <a href={valor.fotoUrl} target="_blank" rel="noreferrer" className="block w-fit">
                <Image
                  src={valor.fotoUrl}
                  alt="Foto enviada"
                  width={96}
                  height={96}
                  className="w-24 h-24 object-cover rounded-lg border border-nord-border"
                />
              </a>
            )}
          </div>
        );
      case "ANEXO":
        return (
          <div className="space-y-2">
            <label className={`btn-outline inline-flex cursor-pointer w-fit ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              <Paperclip size={13} /> {uploading ? "Enviando..." : valor?.anexoUrl ? "Trocar anexo" : "Anexar arquivo"}
              <input type="file" className="hidden" disabled={uploading} onChange={(e) => handleUpload(e.target.files?.[0], "anexoUrl")} />
            </label>
            {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
            {valor?.anexoUrl && (
              <a
                href={valor.anexoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline"
              >
                <FileText size={13} /> {nomeArquivoFromUrl(valor.anexoUrl)}
              </a>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  function renderLeitura() {
    switch (pergunta.tipo) {
      case "SIM_NAO":
        return <p className="text-sm text-white font-medium">{valor?.valorBooleano ? "Sim" : "Não"}</p>;
      case "MULTIPLA_ESCOLHA": {
        const texto = pergunta.opcoes.find((o) => o.id === valor?.opcaoId)?.texto ?? "-";
        return <p className="text-sm text-white font-medium">{texto}</p>;
      }
      case "NOTA_1_5":
        return (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={20} className={(valor?.valorNota ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-nord-border"} />
            ))}
            <span className="text-sm text-nord-gray ml-1">{valor?.valorNota} de 5</span>
          </div>
        );
      case "TEXTO":
        return <p className="text-sm text-white bg-nord-panel rounded-lg p-3 whitespace-pre-wrap">{valor?.valorTexto}</p>;
      case "NUMERO":
        return <p className="text-sm text-white">{valor?.valorNumero}</p>;
      case "PRODUTO": {
        const nome = produtos.find((p) => p.id === valor?.produtoId)?.name ?? "Produto não encontrado";
        return <p className="text-sm text-white">{nome}</p>;
      }
      case "COLABORADOR": {
        const nome = colaboradores.find((c) => c.id === valor?.colaboradorId)?.name ?? "Colaborador não encontrado";
        return <p className="text-sm text-white">{nome}</p>;
      }
      case "FOTO":
        return valor?.fotoUrl ? (
          <a href={valor.fotoUrl} target="_blank" rel="noreferrer" className="block w-fit">
            <Image
              src={valor.fotoUrl}
              alt="Foto enviada"
              width={96}
              height={96}
              className="w-24 h-24 object-cover rounded-lg border border-nord-border"
            />
          </a>
        ) : null;
      case "ANEXO":
        return valor?.anexoUrl ? (
          <a
            href={valor.anexoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline"
          >
            <FileText size={13} /> {nomeArquivoFromUrl(valor.anexoUrl)}
          </a>
        ) : null;
      default:
        return null;
    }
  }

  return (
    <div
      className={`nord-card p-4 space-y-3 transition-colors ${indent ? "ml-4 sm:ml-6 border-l-2 border-l-nord-blue/40" : ""} ${
        destacarErro ? "border-red-500/70" : ""
      }`}
    >
      <div>
        <p className="text-white text-sm font-medium">
          {pergunta.texto}
          {obrigatoriaAgora && <span className="text-amber-400"> *</span>}
        </p>
        {pergunta.orientacao && <p className="text-xs text-nord-gray mt-0.5">{pergunta.orientacao}</p>}
      </div>

      {readOnly ? respondida ? renderLeitura() : <p className="text-sm text-nord-gray italic">Não respondida.</p> : renderEdicao()}

      {destacarErro && <p className="text-xs text-red-400">Essa pergunta precisa de uma resposta.</p>}
    </div>
  );
}
