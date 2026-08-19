"use client";

import { useEffect, useRef, useState } from "react";
import "./etiquetas.css";
import { Label, type Etiqueta } from "./label";
import {
  carregarHistorico,
  formatarHorario,
  registrarHistorico,
  type HistoricoItem,
} from "./historico";

const EXEMPLO = {
  pedido: "609",
  cliente: "Charles Xavier",
  totalPacotes: "7",
  observacoes: "X-Burger\n3x carnes\nSem alface",
};

type Erros = {
  pedido?: string;
  cliente?: string;
  totalPacotes?: string;
};

function gerarEtiquetasDoPedido(
  pedido: string,
  cliente: string,
  totalPacotes: number,
  observacoes: string
): Etiqueta[] {
  return Array.from({ length: totalPacotes }, (_, i) => ({
    pedido,
    cliente,
    totalPacotes,
    pacoteAtual: i + 1,
    observacoes,
  }));
}

export function EtiquetasClient() {
  const [pedido, setPedido] = useState(EXEMPLO.pedido);
  const [cliente, setCliente] = useState(EXEMPLO.cliente);
  const [totalPacotes, setTotalPacotes] = useState(EXEMPLO.totalPacotes);
  const [observacoes, setObservacoes] = useState(EXEMPLO.observacoes);
  const [erros, setErros] = useState<Erros>({});
  const [aviso, setAviso] = useState("");

  const [labels, setLabels] = useState<Etiqueta[]>([]);
  const [selecionada, setSelecionada] = useState(0);
  const [printQueue, setPrintQueue] = useState<Etiqueta[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>(() => carregarHistorico());

  const pedidoRef = useRef<HTMLInputElement>(null);
  const pendenteRef = useRef<Omit<HistoricoItem, "id" | "horario"> | null>(null);

  useEffect(() => {
    pedidoRef.current?.focus();
  }, []);

  useEffect(() => {
    function aoFinalizarImpressao() {
      if (pendenteRef.current) {
        setHistorico(registrarHistorico(pendenteRef.current));
        pendenteRef.current = null;
        limparFormulario();
      }
    }
    window.addEventListener("afterprint", aoFinalizarImpressao);
    return () => window.removeEventListener("afterprint", aoFinalizarImpressao);
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        limparFormulario();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        imprimirTodas();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, pedido, cliente, totalPacotes, observacoes]);

  function validar(): boolean {
    const novosErros: Erros = {};
    const totalNumero = Number(totalPacotes);

    if (!pedido.trim()) novosErros.pedido = "Informe o número do pedido.";
    if (!cliente.trim()) novosErros.cliente = "Informe o nome do cliente.";
    if (!totalPacotes.trim() || !Number.isInteger(totalNumero) || totalNumero < 1) {
      novosErros.totalPacotes = "A quantidade de pacotes deve ser maior que zero.";
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  function handleGerar(e?: React.FormEvent) {
    e?.preventDefault();
    setAviso("");
    if (!validar()) return;
    const novas = gerarEtiquetasDoPedido(
      pedido.trim(),
      cliente.trim(),
      Number(totalPacotes),
      observacoes
    );
    setLabels(novas);
    setSelecionada(0);
  }

  function dispararImpressao(fila: Etiqueta[]) {
    if (fila.length === 0) {
      setAviso("Gere as etiquetas antes de imprimir.");
      return;
    }
    pendenteRef.current = {
      pedido: fila[0].pedido,
      cliente: fila[0].cliente,
      totalPacotes: fila[0].totalPacotes,
      observacoes: fila[0].observacoes,
    };
    setPrintQueue(fila);
    requestAnimationFrame(() => window.print());
  }

  function imprimirTodas() {
    dispararImpressao(labels);
  }

  function imprimirSelecionada() {
    if (labels.length === 0) {
      setAviso("Gere as etiquetas antes de imprimir.");
      return;
    }
    dispararImpressao([labels[selecionada]]);
  }

  function limparFormulario() {
    setPedido("");
    setCliente("");
    setTotalPacotes("");
    setObservacoes("");
    setErros({});
    setAviso("");
    setLabels([]);
    setSelecionada(0);
    setPrintQueue([]);
    pedidoRef.current?.focus();
  }

  function handleObservacoesChange(valor: string) {
    const linhas = valor.split("\n").slice(0, 3);
    setObservacoes(linhas.join("\n"));
  }

  function reimprimir(item: HistoricoItem) {
    const novas = gerarEtiquetasDoPedido(
      item.pedido,
      item.cliente,
      item.totalPacotes,
      item.observacoes
    );
    setPedido(item.pedido);
    setCliente(item.cliente);
    setTotalPacotes(String(item.totalPacotes));
    setObservacoes(item.observacoes);
    setLabels(novas);
    setSelecionada(0);
    dispararImpressao(novas);
  }

  return (
    <div className="etq-page">
      <div id="etq-app-screen" className="mx-auto flex min-h-full max-w-6xl flex-col gap-4 p-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#17181c]">Etiquetas de Entrega</h1>
            <p className="text-sm text-[#6b6f76]">Nord Pizza Burger — expedição de pedidos</p>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          <form
            onSubmit={handleGerar}
            className="flex flex-col gap-4 rounded-2xl border border-[#e1e3e8] bg-white p-4"
          >
            <div>
              <label htmlFor="pedido" className="mb-1 block text-sm font-semibold text-[#17181c]">
                Número do pedido *
              </label>
              <input
                ref={pedidoRef}
                id="pedido"
                type="number"
                inputMode="numeric"
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                className="w-full rounded-xl border-2 border-[#2952e3] bg-white px-4 py-3 text-2xl font-extrabold tracking-wide text-[#17181c] outline-none"
                placeholder="609"
              />
              {erros.pedido && <p className="mt-1 text-sm font-medium text-red-600">{erros.pedido}</p>}
            </div>

            <div>
              <label htmlFor="cliente" className="mb-1 block text-sm font-semibold text-[#17181c]">
                Nome do cliente *
              </label>
              <input
                id="cliente"
                type="text"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full rounded-xl border border-[#d7d9de] bg-white px-4 py-3 text-lg font-medium text-[#17181c] outline-none focus:border-[#2952e3]"
                placeholder="Charles Xavier"
              />
              {erros.cliente && <p className="mt-1 text-sm font-medium text-red-600">{erros.cliente}</p>}
            </div>

            <div>
              <label
                htmlFor="totalPacotes"
                className="mb-1 block text-sm font-semibold text-[#17181c]"
              >
                Quantidade total de pacotes *
              </label>
              <input
                id="totalPacotes"
                type="number"
                min={1}
                step={1}
                value={totalPacotes}
                onChange={(e) => setTotalPacotes(e.target.value)}
                className="w-full rounded-xl border border-[#d7d9de] bg-white px-4 py-3 text-lg font-medium text-[#17181c] outline-none focus:border-[#2952e3]"
                placeholder="7"
              />
              {erros.totalPacotes && (
                <p className="mt-1 text-sm font-medium text-red-600">{erros.totalPacotes}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="observacoes"
                className="mb-1 block text-sm font-semibold text-[#17181c]"
              >
                Informações adicionais (opcional, até 3 linhas)
              </label>
              <textarea
                id="observacoes"
                rows={3}
                value={observacoes}
                onChange={(e) => handleObservacoesChange(e.target.value)}
                className="w-full resize-none rounded-xl border border-[#d7d9de] bg-white px-4 py-3 text-base text-[#17181c] outline-none focus:border-[#2952e3]"
                placeholder={"X-Burger\n3x carnes\nSem alface"}
              />
            </div>

            {aviso && <p className="text-sm font-medium text-red-600">{aviso}</p>}

            <button
              type="submit"
              className="mt-1 rounded-xl bg-[#2952e3] px-4 py-4 text-lg font-bold text-white transition hover:bg-[#2340bb]"
            >
              Gerar etiquetas
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={imprimirTodas}
                className="rounded-xl bg-[#17181c] px-4 py-3 text-base font-bold text-white transition hover:bg-black"
              >
                Imprimir todas
              </button>
              <button
                type="button"
                onClick={imprimirSelecionada}
                className="rounded-xl border-2 border-[#17181c] px-4 py-3 text-base font-bold text-[#17181c] transition hover:bg-[#f1f2f4]"
              >
                Imprimir selecionada
              </button>
            </div>
            <button
              type="button"
              onClick={limparFormulario}
              className="rounded-xl border border-[#d7d9de] px-4 py-3 text-sm font-semibold text-[#6b6f76] transition hover:bg-[#f1f2f4]"
            >
              Limpar pedido
            </button>
            <p className="text-center text-xs text-[#9a9da4]">
              Enter gera as etiquetas · Ctrl+P imprime · Esc limpa o formulário
            </p>
          </form>

          <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-[#e1e3e8] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#17181c]">
                Prévia das etiquetas {labels.length > 0 && `(${labels.length})`}
              </h2>
              {labels.length === 0 ? (
                <p className="text-sm text-[#9a9da4]">
                  Preencha o formulário e clique em “Gerar etiquetas” para ver a prévia.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {labels.map((etiqueta, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelecionada(i)}
                      className={`etq-preview-card ${i === selecionada ? "selecionada" : ""}`}
                      title={`Selecionar etiqueta ${etiqueta.pacoteAtual} / ${etiqueta.totalPacotes}`}
                    >
                      <Label {...etiqueta} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#e1e3e8] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#17181c]">
                Histórico recente
              </h2>
              {historico.length === 0 ? (
                <p className="text-sm text-[#9a9da4]">Nenhum pedido impresso ainda.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[#eceef1]">
                  {historico.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#17181c]">
                          #{item.pedido} — {item.cliente}
                        </p>
                        <p className="text-xs text-[#9a9da4]">
                          {item.totalPacotes} pacote{item.totalPacotes > 1 ? "s" : ""} ·{" "}
                          {formatarHorario(item.horario)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => reimprimir(item)}
                        className="shrink-0 rounded-lg border border-[#d7d9de] px-3 py-1.5 text-xs font-semibold text-[#17181c] transition hover:bg-[#f1f2f4]"
                      >
                        Reimprimir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      <div id="etq-print-sheet">
        {printQueue.map((etiqueta, i) => (
          <Label key={i} {...etiqueta} />
        ))}
      </div>
    </div>
  );
}
