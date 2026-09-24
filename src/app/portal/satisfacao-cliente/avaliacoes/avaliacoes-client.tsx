"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Eye, Search } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { PeriodFilterBar, type PeriodFilterOption } from "@/components/ui/period-filter";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { formatNumber } from "@/lib/calc";

type FiltroTopo = "todas" | "positivas" | "neutras" | "criticas" | "resolvidas" | "pendentes";

const FILTRO_TOPO_OPTIONS: { key: FiltroTopo; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "positivas", label: "Positivas" },
  { key: "neutras", label: "Neutras" },
  { key: "criticas", label: "Críticas" },
  { key: "resolvidas", label: "Resolvidas" },
  { key: "pendentes", label: "Pendentes" },
];
const FILTRO_TOPO_VALUES: string[] = FILTRO_TOPO_OPTIONS.map((o) => o.key);

type StatusEnum = "NOVA" | "EM_ATENDIMENTO" | "RESOLVIDA";
const STATUS_OPTIONS: StatusEnum[] = ["NOVA", "EM_ATENDIMENTO", "RESOLVIDA"];
const STATUS_LABEL: Record<StatusEnum, string> = { NOVA: "Nova", EM_ATENDIMENTO: "Em atendimento", RESOLVIDA: "Resolvida" };
const STATUS_TONE: Record<StatusEnum, "warning" | "info" | "success"> = {
  NOVA: "warning",
  EM_ATENDIMENTO: "info",
  RESOLVIDA: "success",
};

const NOTA_OPTIONS = Array.from({ length: 11 }, (_, i) => i);

/** "Qualquer período" (default) + os presets padrão do portal — mesma ideia de
 *  `TaskFiltersBar` (tarefas/task-filters.tsx), que também estende o preset padrão com uma opção
 *  vazia: essa é uma tela de histórico/auditoria (não "o que vence em breve"), então o padrão
 *  certo é mostrar tudo, não só "hoje". */
type PeriodoKey = "" | RollingPeriodKey;
const PERIODO_OPTIONS: PeriodFilterOption<PeriodoKey>[] = [
  { key: "", label: "Qualquer período" },
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "mes-atual", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "personalizado", label: "Personalizado" },
];

type AvaliacaoRow = {
  id: string;
  empresaId: string;
  submittedAt: string;
  cliente: { id: string | null; nome: string };
  mesa: { id: string; numero: string } | null;
  garcom: { id: string; nome: string } | null;
  notaGeral: number;
  critica: boolean;
  status: StatusEnum;
  resumo: string | null;
};
type ListResponse = {
  avaliacoes: AvaliacaoRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type MesaOption = { id: string; numero: string };

export function AvaliacoesClient({
  isGrupoNordMode,
  empresas,
  garcons,
}: {
  isGrupoNordMode: boolean;
  empresas: { id: string; name: string; color: string }[];
  garcons: { id: string; name: string }[];
}) {
  const searchParams = useSearchParams();
  // Deep link já usado pelo push de avaliação crítica (Fase 3) e pela Central de Oportunidades do
  // CRM: /portal/satisfacao-cliente/avaliacoes?filtro=criticas (ver src/lib/crm-dashboard.ts).
  const [filtro, setFiltro] = useState<FiltroTopo>(() => {
    const raw = searchParams.get("filtro");
    return raw && FILTRO_TOPO_VALUES.includes(raw) ? (raw as FiltroTopo) : "todas";
  });

  const [periodo, setPeriodo] = useState<PeriodoKey>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [garcomId, setGarcomId] = useState("");
  const [mesaId, setMesaId] = useState("");
  const [nota, setNota] = useState("");
  const [status, setStatus] = useState("");
  const [clienteInput, setClienteInput] = useState("");
  const [cliente, setCliente] = useState("");
  const [page, setPage] = useState(1);

  const [mesas, setMesas] = useState<MesaOption[]>([]);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Busca por cliente: debounce de 400ms antes de disparar a requisição (única tela do portal com
  // busca por texto livre resolvida no servidor/paginada — nas outras, a busca filtra uma lista já
  // carregada por inteiro no cliente, sem round-trip por tecla digitada).
  useEffect(() => {
    const t = setTimeout(() => {
      setCliente(clienteInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [clienteInput]);

  // "Identidade" da loja ativa: "grupo-nord" no modo Grupo Nord (não há uma loja única — o filtro
  // de unidade abaixo é escolha do usuário, não deve resetar sozinho enquanto o Grupo Nord
  // continuar ativo), ou o id da própria loja no modo loja única (nesse modo `empresas` sempre vem
  // com 1 item só: a loja ativa — ver o `page.tsx` desta tela). Serve de dependência pro efeito
  // abaixo: o StoreSwitcher da sidebar (store-switcher.tsx) troca a loja ativa com
  // `router.refresh()`, que só atualiza props (isGrupoNordMode/empresas/garcons) — NÃO remonta
  // este client component, então o useState local dos filtros sobreviveria à troca (continuando a
  // filtrar pela loja anterior) se não fosse resetado explicitamente aqui.
  const activeStoreKey = isGrupoNordMode ? "grupo-nord" : (empresas[0]?.id ?? "");

  // Filtros vinculados à loja ativa (unidade/mesa/garçom) + lista de mesas do dropdown "Mesa":
  // reseta e rebusca sempre que `activeStoreKey` muda, cobrindo as 3 transições possíveis —
  // Grupo Nord -> loja única (zera "unidade", filtro que só existe no modo Grupo Nord), loja
  // única -> Grupo Nord (zera "mesa"/"garçom", filtros que somem da tela nesse modo) e entre duas
  // lojas únicas diferentes (zera "mesa"/"garçom" E rebusca a lista de mesas — sem isso ela
  // continuaria mostrando as mesas da loja anterior). Mesma restrição de
  // GET /api/satisfacao-cliente/mesas: só busca no modo loja única (400 no Grupo Nord).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reseta filtros vinculados à loja ativa (e a página) sempre que a loja ativa muda
    setEmpresaId("");
    setMesaId("");
    setGarcomId("");
    setMesas([]);
    setPage(1);

    if (isGrupoNordMode) return;

    let cancelled = false;
    fetch("/api/satisfacao-cliente/mesas")
      .then((res) => (res.ok ? res.json() : { mesas: [] }))
      .then((json) => {
        if (cancelled) return;
        setMesas((json.mesas ?? []).map((m: { id: string; numero: string }) => ({ id: m.id, numero: m.numero })));
      })
      .catch(() => {
        if (!cancelled) setMesas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeStoreKey, isGrupoNordMode]);

  const range = useMemo(() => {
    if (periodo === "") return null;
    if (periodo === "personalizado") {
      if (!customFrom || !customTo) return null;
      return resolveRollingPeriod("personalizado", { from: customFrom, to: customTo });
    }
    return resolveRollingPeriod(periodo);
  }, [periodo, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ filtro, page: String(page), pageSize: "20" });
        if (empresaId) params.set("empresaId", empresaId);
        if (garcomId) params.set("garcomId", garcomId);
        if (mesaId) params.set("mesaId", mesaId);
        if (nota !== "") params.set("nota", nota);
        if (status) params.set("status", status);
        if (cliente) params.set("cliente", cliente);
        if (range) {
          params.set("from", range.from.toISOString());
          params.set("to", range.to.toISOString());
        }
        const res = await fetch(`/api/satisfacao-cliente/avaliacoes?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Não foi possível carregar as avaliações.");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filtro, page, empresaId, garcomId, mesaId, nota, status, cliente, range]);

  function selectFiltro(f: FiltroTopo) {
    setFiltro(f);
    setPage(1);
  }

  function applyPeriodo(key: PeriodoKey, from?: string, to?: string) {
    setPeriodo(key);
    if (key === "personalizado") {
      setCustomFrom(from ?? "");
      setCustomTo(to ?? "");
    }
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTRO_TOPO_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => selectFiltro(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filtro === opt.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Section title="Filtros">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-nord-gray mb-1.5">Período</p>
            <PeriodFilterBar
              periodo={periodo}
              onApply={applyPeriodo}
              options={PERIODO_OPTIONS}
              initialCustomFrom={customFrom}
              initialCustomTo={customTo}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isGrupoNordMode && (
              <select
                value={empresaId}
                onChange={(e) => {
                  setEmpresaId(e.target.value);
                  setPage(1);
                }}
                className="input w-44"
              >
                <option value="">Todas as unidades</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            {!isGrupoNordMode && garcons.length > 0 && (
              <select
                value={garcomId}
                onChange={(e) => {
                  setGarcomId(e.target.value);
                  setPage(1);
                }}
                className="input w-44"
              >
                <option value="">Todos os garçons</option>
                {garcons.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            {!isGrupoNordMode && mesas.length > 0 && (
              <select
                value={mesaId}
                onChange={(e) => {
                  setMesaId(e.target.value);
                  setPage(1);
                }}
                className="input w-40"
              >
                <option value="">Todas as mesas</option>
                {mesas.map((m) => (
                  <option key={m.id} value={m.id}>
                    Mesa {m.numero}
                  </option>
                ))}
              </select>
            )}
            <select
              value={nota}
              onChange={(e) => {
                setNota(e.target.value);
                setPage(1);
              }}
              className="input w-36"
            >
              <option value="">Todas as notas</option>
              {NOTA_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Nota {n}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="input w-40"
            >
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
              <input
                value={clienteInput}
                onChange={(e) => setClienteInput(e.target.value)}
                placeholder="Buscar cliente (nome ou telefone)"
                className="input w-72 pl-8"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Avaliações"
        action={
          data ? (
            <span className="text-xs text-nord-gray">
              {formatNumber(data.pagination.total)} encontrada{data.pagination.total === 1 ? "" : "s"}
              {loading ? " · atualizando..." : ""}
            </span>
          ) : undefined
        }
      >
        {loading && !data ? (
          <div className="p-8 text-center text-sm text-nord-gray">Carregando...</div>
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-nord-danger">{loadError}</div>
        ) : (
          data && (
            <>
              <div className="overflow-x-auto nord-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                      <th className="py-2 pr-4">Data/Hora</th>
                      <th className="py-2 pr-4">Cliente</th>
                      <th className="py-2 pr-4">Mesa</th>
                      <th className="py-2 pr-4">Garçom</th>
                      <th className="py-2 pr-4">Nota</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Resumo</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.avaliacoes.map((a) => (
                      <tr key={a.id} className="border-b border-nord-border/50 hover:bg-white/5">
                        <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">
                          {format(new Date(a.submittedAt), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="py-2.5 pr-4 text-white">{a.cliente.nome}</td>
                        <td className="py-2.5 pr-4 text-nord-gray">{a.mesa ? a.mesa.numero : "—"}</td>
                        <td className="py-2.5 pr-4 text-nord-gray">{a.garcom ? a.garcom.nome : "—"}</td>
                        <td className="py-2.5 pr-4">
                          <Badge tone={a.critica ? "danger" : "default"}>{a.notaGeral}</Badge>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-nord-gray max-w-xs truncate" title={a.resumo ?? undefined}>
                          {a.resumo ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4">
                          <Link
                            href={`/portal/satisfacao-cliente/avaliacoes/${a.id}`}
                            className="inline-flex items-center gap-1 text-xs text-nord-blue-light hover:underline whitespace-nowrap"
                          >
                            <Eye size={13} /> Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {data.avaliacoes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-nord-gray text-sm">
                          Nenhuma avaliação encontrada com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {data.avaliacoes.length > 0 && (
                <div className="flex items-center justify-between mt-4 text-xs text-nord-gray flex-wrap gap-2">
                  <span>
                    Página {data.pagination.page} de {data.pagination.totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={data.pagination.page <= 1}
                      className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                      disabled={data.pagination.page >= data.pagination.totalPages}
                      className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </Section>
    </div>
  );
}
