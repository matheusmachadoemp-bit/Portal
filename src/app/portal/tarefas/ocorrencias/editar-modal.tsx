"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/modal";
import { GRAVIDADE_OPTIONS } from "./constants";
import type { CategoriaOption, Ocorrencia } from "./types";

// PATCH /api/fechamento-dia/ocorrencias/[id] — só aceita status ABERTA/RESOLVIDA/DESCARTADA
// (nunca TRANSFORMADA: essa transição só acontece via a rota .../transformar). O select de
// status abaixo por isso nunca oferece "Transformada" como opção real — mas quando a ocorrência
// já está transformada, ainda precisa de uma opção NEUTRA equivalente a "não mexer nisso": sem
// ela, o form teria que pré-selecionar ABERTA/RESOLVIDA/DESCARTADA por padrão, e salvar sem
// tocar no campo Status (ex.: só pra corrigir a gravidade) enviaria esse valor "de mentira" pro
// PATCH e desfaria o status TRANSFORMADA sem o usuário ter pedido isso — bug real, encontrado
// testando esta tela (ver relatório final).
const MANTER_TRANSFORMADA = "MANTER_TRANSFORMADA" as const;
type StatusForm = "ABERTA" | "RESOLVIDA" | "DESCARTADA" | typeof MANTER_TRANSFORMADA;

const STATUS_EDITAVEL: { key: "ABERTA" | "RESOLVIDA" | "DESCARTADA"; label: string }[] = [
  { key: "ABERTA", label: "Aberta" },
  { key: "RESOLVIDA", label: "Resolvida" },
  { key: "DESCARTADA", label: "Descartada" },
];

export function EditarOcorrenciaModal({
  ocorrencia,
  categorias,
  onClose,
  onSaved,
}: {
  ocorrencia: Ocorrencia | null;
  categorias: CategoriaOption[];
  onClose: () => void;
  /** A resposta do PATCH só traz os campos escalares (sem `categoria`/`empresa`/etc. — a rota não
   * usa `include`), então o mais simples e seguro é o pai recarregar a lista inteira em vez de
   * tentar mesclar um objeto parcial no estado local (mesmo padrão já usado em Checklist/
   * Chamados: refresh completo após editar, não merge cirúrgico). */
  onSaved: () => void;
}) {
  // Inicializado só na criação desta instância (lazy initializer), a partir do `ocorrencia`
  // recebido — não um useEffect resincronizando a cada mudança de prop (o que dispararia
  // `react-hooks/set-state-in-effect`). O pai é responsável por remontar este componente (via
  // `key`) toda vez que abre o modal para edição, então cada abertura já nasce com os valores
  // certos, sem precisar de um efeito para "copiar" o prop para o estado depois do primeiro
  // render — e sem o efeito colateral de reabrir a MESMA ocorrência mostrando um rascunho
  // abandonado de uma edição cancelada anteriormente.
  const [categoriaId, setCategoriaId] = useState(ocorrencia?.categoriaId ?? "");
  const [gravidade, setGravidade] = useState<Ocorrencia["gravidade"]>(ocorrencia?.gravidade ?? "ATENCAO");
  const [status, setStatus] = useState<StatusForm>(
    ocorrencia?.status === "TRANSFORMADA" ? MANTER_TRANSFORMADA : (ocorrencia?.status ?? "ABERTA")
  );
  const [descricao, setDescricao] = useState(ocorrencia?.descricao ?? "");
  const [comoFoiResolvido, setComoFoiResolvido] = useState(ocorrencia?.comoFoiResolvido ?? "");
  const [pendencia, setPendencia] = useState(ocorrencia?.pendencia ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ocorrencia) return null;

  // Categoria é escopada por loja — só faz sentido oferecer as categorias da MESMA empresa
  // desta ocorrência (é o que a rota PATCH valida: `categoria.findFirst({ id, empresaId })`).
  const categoriasDaLoja = categorias.filter((c) => c.empresaId === ocorrencia.empresaId);
  // Baseado no status ORIGINAL (não no valor atual do select) — a opção "manter" precisa
  // continuar disponível mesmo se o usuário escolher outro status e depois voltar atrás.
  const eraTransformada = ocorrencia.status === "TRANSFORMADA";

  async function submit() {
    if (!ocorrencia) return;
    if (!descricao.trim()) {
      setError("Descrição não pode ficar vazia.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fechamento-dia/ocorrencias/${ocorrencia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoriaId,
          gravidade,
          // `undefined` some do JSON — é assim que se diz pra rota "não mexa no status" (mesma
          // convenção que a própria rota já usa pra comoFoiResolvido/pendencia abaixo).
          status: status === MANTER_TRANSFORMADA ? undefined : status,
          descricao: descricao.trim(),
          comoFoiResolvido: comoFoiResolvido.trim() ? comoFoiResolvido.trim() : null,
          pendencia: pendencia.trim() ? pendencia.trim() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar as alterações.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!ocorrencia} onClose={onClose} title="Editar ocorrência" widthClass="max-w-lg">
      <FormError message={error} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <select className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              {categoriasDaLoja.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Gravidade</span>
            <select
              className="input"
              value={gravidade}
              onChange={(e) => setGravidade(e.target.value as Ocorrencia["gravidade"])}
            >
              {GRAVIDADE_OPTIONS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusForm)}>
            {eraTransformada && <option value={MANTER_TRANSFORMADA}>Transformada (manter)</option>}
            {STATUS_EDITAVEL.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {eraTransformada && (
            <p className="text-[11px] text-nord-gray mt-1">
              Esta ocorrência já foi transformada em {ocorrencia.transformadoEmTask ? "uma tarefa" : "um chamado"}.
              Deixe em &ldquo;Transformada (manter)&rdquo; para não mexer nisso — os outros status também não desfazem a
              transformação em si, só mudam a etiqueta.
            </p>
          )}
        </label>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Descrição</span>
          <textarea className="input min-h-20" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Como foi resolvido (opcional)</span>
          <textarea
            className="input min-h-16"
            value={comoFoiResolvido}
            onChange={(e) => setComoFoiResolvido(e.target.value)}
            placeholder="Deixe em branco se ainda não foi resolvido"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Pendência (opcional)</span>
          <textarea
            className="input min-h-16"
            value={pendencia}
            onChange={(e) => setPendencia(e.target.value)}
            placeholder="O que ainda falta resolver, se houver"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
