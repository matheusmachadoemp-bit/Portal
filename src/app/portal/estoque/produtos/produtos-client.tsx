"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { SECTORS } from "@/lib/estoque";
import { CategoriasClient, type StockCategoryDTO } from "./categorias-client";

type Ingredient = {
  id: string;
  name: string;
  codigoInterno: string | null;
  codigoBarras: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  setor: string | null;
  unidade: string;
  unidadeCompra: string | null;
  fatorConversao: number;
  precoAtual: number;
  quantidadeEmbalagem: number;
  rendimentoAproveitavel: number | null;
  percentualPerda: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueMaximo: number | null;
  pontoReposicao: number | null;
  localArmazenamento: string | null;
  fornecedorPrincipalId: string | null;
  fornecedorNome: string | null;
  validade: string | null;
  perecivel: boolean;
  active: boolean;
};

// Resultado por item da exclusão em lote (POST /api/ficha-tecnica/insumos/excluir-lote).
// `nome` vem `null` quando o item não foi encontrado ou não pertence a uma loja que o
// usuário tem acesso — nesses 2 casos a UI não pode exibir o nome real do produto.
type LoteResultado = {
  id: string;
  nome: string | null;
  excluido: boolean;
  motivo?: string;
};

type LoteResponse = {
  resultados: LoteResultado[];
  totalExcluidos: number;
  totalBloqueados: number;
};

const emptyForm = {
  id: "",
  name: "",
  codigoInterno: "",
  codigoBarras: "",
  categoryId: "",
  setor: "",
  unidade: "kg",
  unidadeCompra: "",
  fatorConversao: "1",
  precoAtual: "",
  quantidadeEmbalagem: "1",
  rendimentoAproveitavel: "",
  percentualPerda: "0",
  estoqueAtual: "0",
  estoqueMinimo: "0",
  estoqueMaximo: "",
  pontoReposicao: "",
  localArmazenamento: "",
  fornecedorPrincipalId: "",
  validade: "",
  perecivel: false,
  active: true,
};

export function ProdutosClient({
  initialIngredients,
  initialCategories,
  suppliers,
  canCreate,
  canDelete,
  canCreateCategoria,
  canEditCategoria,
}: {
  initialIngredients: Ingredient[];
  /** Lista completa de categorias de estoque (ativas e inativas, com contagem de produtos).
   *  O estado fica aqui — nível comum entre os dropdowns de categoria desta aba (filtro e
   *  formulário de produto) e o grid de gerenciamento da aba "Categorias" — pra que criar,
   *  editar ou ativar/desativar uma categoria reflita nos dois lugares sem precisar de F5.
   *  Mesmo padrão de src/app/portal/financeiro/caixa-da-empresa/ (CaixaClient + accounts). */
  initialCategories: StockCategoryDTO[];
  suppliers: { id: string; name: string }[];
  canCreate: boolean;
  canDelete: boolean;
  canCreateCategoria: boolean;
  canEditCategoria: boolean;
}) {
  // Estoque > Produtos e Estoque > Categorias foram unificadas nesta única tela (subcategoria
  // "Produtos" absorveu "Categorias" — a URL /portal/estoque/categorias não existe mais). O
  // link "Gerenciar categorias" de dentro da Ficha Técnica aponta pra cá com
  // "?tab=categorias" pra já abrir na aba certa.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"produtos" | "categorias">(
    searchParams.get("tab") === "categorias" ? "categorias" : "produtos"
  );

  const [categories, setCategories] = useState(initialCategories);
  // Lista simples (id/nome/cor) usada pelos dois dropdowns de categoria desta aba (filtro da
  // tabela e campo "Categoria" do formulário de produto) — derivada do mesmo estado acima que
  // alimenta o grid de gerenciamento da aba "Categorias".
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    [categories]
  );

  const [ingredients, setIngredients] = useState(initialIngredients);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [setorFilter, setSetorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<LoteResponse | null>(null);

  const vencimentoLimite = useMemo(() => new Date().getTime() + 7 * 86400000, []);

  const nameCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of ingredients) map.set(i.name.trim().toLowerCase(), (map.get(i.name.trim().toLowerCase()) ?? 0) + 1);
    return map;
  }, [ingredients]);

  const filtered = useMemo(
    () =>
      ingredients.filter((i) => {
        if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter && i.categoryId !== categoryFilter) return false;
        if (setorFilter && i.setor !== setorFilter) return false;
        if (statusFilter === "ativo" && !i.active) return false;
        if (statusFilter === "inativo" && i.active) return false;
        return true;
      }),
    [ingredients, search, categoryFilter, setorFilter, statusFilter]
  );

  async function refresh() {
    const res = await fetch("/api/ficha-tecnica/insumos");
    const data = await res.json();
    setIngredients(
      data.ingredients.map((i: Record<string, unknown>) => ({
        id: i.id,
        name: i.name,
        codigoInterno: i.codigoInterno,
        codigoBarras: i.codigoBarras,
        categoryId: i.categoryId,
        categoryName: (i.category as { name: string } | null)?.name ?? null,
        categoryColor: (i.category as { color: string } | null)?.color ?? null,
        setor: i.setor,
        unidade: i.unidade,
        unidadeCompra: i.unidadeCompra,
        fatorConversao: i.fatorConversao,
        precoAtual: i.precoAtual,
        quantidadeEmbalagem: i.quantidadeEmbalagem,
        rendimentoAproveitavel: i.rendimentoAproveitavel,
        percentualPerda: i.percentualPerda,
        estoqueAtual: i.estoqueAtual,
        estoqueMinimo: i.estoqueMinimo,
        estoqueMaximo: i.estoqueMaximo,
        pontoReposicao: i.pontoReposicao,
        localArmazenamento: i.localArmazenamento,
        fornecedorPrincipalId: i.fornecedorPrincipalId,
        fornecedorNome: (i.fornecedorPrincipal as { nomeFantasia: string | null; razaoSocial: string } | null)
          ? (i.fornecedorPrincipal as { nomeFantasia: string | null; razaoSocial: string }).nomeFantasia ??
            (i.fornecedorPrincipal as { nomeFantasia: string | null; razaoSocial: string }).razaoSocial
          : null,
        validade: i.validade,
        perecivel: i.perecivel,
        active: i.active,
      }))
    );
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    const res = await fetch(`/api/ficha-tecnica/insumos/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Não foi possível excluir o produto.");
      return;
    }
    setDeleteError(null);
    // O item excluído pode também estar marcado na seleção em lote (checkbox da
    // própria linha) — remove do Set pra barra "N selecionados" não ficar com
    // contagem inflada, nem um "Excluir selecionados" posterior incluir um id
    // que já não existe mais.
    setSelected((prev) => {
      if (!prev.has(confirmDeleteId)) return prev;
      const next = new Set(prev);
      next.delete(confirmDeleteId);
      return next;
    });
    refresh();
  }

  async function doBulkDelete() {
    if (selected.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    try {
      const res = await fetch("/api/ficha-tecnica/insumos/excluir-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setBulkResult(null);
        setDeleteError(data?.error ?? "Não foi possível excluir os produtos selecionados.");
      } else {
        setDeleteError(null);
        setBulkResult(data as LoteResponse);
      }
    } finally {
      // Sempre limpa a seleção e atualiza a lista ao final, mesmo se parte (ou
      // todo) o lote foi bloqueado — os itens que excluíram de verdade precisam
      // sumir da tela, e manter itens bloqueados selecionados só confundiria.
      setConfirmBulkDelete(false);
      setSelected(new Set());
      setBulkDeleting(false);
      refresh();
    }
  }

  function openEdit(i: Ingredient) {
    setForm({
      id: i.id,
      name: i.name,
      codigoInterno: i.codigoInterno ?? "",
      codigoBarras: i.codigoBarras ?? "",
      categoryId: i.categoryId ?? "",
      setor: i.setor ?? "",
      unidade: i.unidade,
      unidadeCompra: i.unidadeCompra ?? "",
      fatorConversao: String(i.fatorConversao),
      precoAtual: String(i.precoAtual),
      quantidadeEmbalagem: String(i.quantidadeEmbalagem),
      rendimentoAproveitavel: i.rendimentoAproveitavel !== null ? String(i.rendimentoAproveitavel) : "",
      percentualPerda: String(i.percentualPerda),
      estoqueAtual: String(i.estoqueAtual),
      estoqueMinimo: String(i.estoqueMinimo),
      estoqueMaximo: i.estoqueMaximo !== null ? String(i.estoqueMaximo) : "",
      pontoReposicao: i.pontoReposicao !== null ? String(i.pontoReposicao) : "",
      localArmazenamento: i.localArmazenamento ?? "",
      fornecedorPrincipalId: i.fornecedorPrincipalId ?? "",
      validade: i.validade ? i.validade.slice(0, 10) : "",
      perecivel: i.perecivel,
      active: i.active,
    });
    setError(null);
    setShowForm(true);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const isEdit = !!form.id;
      const res = await fetch(isEdit ? `/api/ficha-tecnica/insumos/${form.id}` : "/api/ficha-tecnica/insumos", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar o produto.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-nord-border">
        <button
          onClick={() => setActiveTab("produtos")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "produtos" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
          }`}
        >
          Produtos
        </button>
        <button
          onClick={() => setActiveTab("categorias")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "categorias" ? "border-nord-blue text-white" : "border-transparent text-nord-gray hover:text-white"
          }`}
        >
          Categorias
        </button>
      </div>

      {/* Os dois painéis ficam sempre montados (alternando só a visibilidade via CSS) em vez de
          renderização condicional — assim o estado interno de cada aba (busca, filtros, seleção
          em lote, formulário aberto) sobrevive a trocar de aba e voltar, sem "resetar" pros
          valores da carga inicial da página. */}
      <div className={activeTab === "produtos" ? "" : "hidden"}>
        <Section
          title="Produtos e insumos"
          action={
            <Toolbar
              exportFilename="produtos-estoque"
              exportSheetName="Produtos"
              exportRows={() =>
                filtered.map((i) => ({
                  Código: i.codigoInterno ?? "",
                  Produto: i.name,
                  Categoria: i.categoryName ?? "",
                  Setor: i.setor ?? "",
                  "Estoque atual": i.estoqueAtual,
                  "Estoque mínimo": i.estoqueMinimo,
                  "Custo unitário": i.precoAtual,
                  Fornecedor: i.fornecedorNome ?? "",
                }))
              }
              onRefresh={refresh}
              onAdd={canCreate ? () => { setForm(emptyForm); setError(null); setShowForm(true); } : undefined}
              addLabel="Novo produto"
            />
          }
        >
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <input className="input w-56" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input w-48" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="input w-48" value={setorFilter} onChange={(e) => setSetorFilter(e.target.value)}>
              <option value="">Todos os setores</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="input w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          {deleteError && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30">
              <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
              <p className="text-xs text-nord-danger">{deleteError}</p>
            </div>
          )}

          {canDelete && selected.size > 0 && (
            <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-nord-blue/10 border border-nord-blue/30">
              <span className="text-sm text-white font-medium">{selected.size} produtos selecionados</span>
              <button
                onClick={() => {
                  setDeleteError(null);
                  setConfirmBulkDelete(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-danger/90 hover:bg-nord-danger text-white"
              >
                <Trash2 size={13} /> Excluir selecionados
              </button>
            </div>
          )}

          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  {canDelete && (
                    <th className="py-2 pr-2 w-8">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleAll}
                        className="accent-nord-blue"
                      />
                    </th>
                  )}
                  <th className="py-2 pr-4">Produto</th>
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 pr-4">Setor</th>
                  <th className="py-2 pr-4">Estoque</th>
                  <th className="py-2 pr-4">Custo</th>
                  <th className="py-2 pr-4">Fornecedor</th>
                  <th className="py-2 pr-4">Alertas</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const alerts: string[] = [];
                  if (!i.precoAtual) alerts.push("Sem custo");
                  if (!i.fornecedorPrincipalId) alerts.push("Sem fornecedor");
                  if (i.estoqueAtual <= i.estoqueMinimo) alerts.push("Abaixo do mínimo");
                  if (i.estoqueMaximo && i.estoqueAtual > i.estoqueMaximo) alerts.push("Acima do máximo");
                  if (i.validade && new Date(i.validade).getTime() <= vencimentoLimite) alerts.push("Vencendo");
                  if ((nameCounts.get(i.name.trim().toLowerCase()) ?? 0) > 1) alerts.push("Duplicado");
                  if (!i.unidadeCompra) alerts.push("Conversão não configurada");
                  return (
                    <tr key={i.id} className="border-b border-nord-border/50 hover:bg-white/5">
                      {canDelete && (
                        <td className="py-2.5 pr-2">
                          <input
                            type="checkbox"
                            checked={selected.has(i.id)}
                            onChange={() => toggleRow(i.id)}
                            className="accent-nord-blue"
                          />
                        </td>
                      )}
                      <td className="py-2.5 pr-4 text-white">
                        {i.name}
                        {!i.active && <Badge tone="default"> Inativo</Badge>}
                      </td>
                      <td className="py-2.5 pr-4">
                        {i.categoryName ? (
                          <span className="inline-flex items-center gap-1.5 text-nord-gray">
                            <span className="w-2 h-2 rounded-full" style={{ background: i.categoryColor ?? "#2952E3" }} />
                            {i.categoryName}
                          </span>
                        ) : (
                          <span className="text-nord-gray">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-nord-gray">{i.setor ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">
                        {formatNumber(i.estoqueAtual, 1)} {i.unidade}
                      </td>
                      <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(i.precoAtual)}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{i.fornecedorNome ?? "—"}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {alerts.map((a) => (
                            <Badge key={a} tone={a === "Sem custo" || a === "Vencendo" || a === "Duplicado" ? "danger" : "warning"}>
                              {a}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {canCreate && (
                          <button onClick={() => openEdit(i)} className="text-xs text-nord-blue-light hover:underline">
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDeleteId(i.id);
                            }}
                            className={`text-xs text-nord-danger hover:underline${canCreate ? " ml-3" : ""}`}
                          >
                            Excluir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canDelete ? 9 : 8} className="py-6 text-center text-nord-gray">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? "Editar produto" : "Novo produto"} widthClass="max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block md:col-span-2">
                <span className="block text-xs text-nord-gray mb-1">Nome do produto</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Código interno</span>
                <input className="input" value={form.codigoInterno} onChange={(e) => setForm({ ...form, codigoInterno: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Código de barras</span>
                <input className="input" value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Categoria</span>
                <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Selecione...</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Setor</span>
                <select className="input" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}>
                  <option value="">Selecione...</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade de consumo</span>
                <input className="input" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="kg, g, l, un..." />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade de compra</span>
                <input className="input" value={form.unidadeCompra} onChange={(e) => setForm({ ...form, unidadeCompra: e.target.value })} placeholder="Caixa 20un, Saco 25kg..." />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Fator de conversão (compra → consumo)</span>
                <input className="input" type="number" value={form.fatorConversao} onChange={(e) => setForm({ ...form, fatorConversao: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Rendimento aproveitável (%)</span>
                <input className="input" type="number" value={form.rendimentoAproveitavel} onChange={(e) => setForm({ ...form, rendimentoAproveitavel: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">% de perda de limpeza</span>
                <input className="input" type="number" value={form.percentualPerda} onChange={(e) => setForm({ ...form, percentualPerda: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Custo da última compra (por un. de consumo)</span>
                <input className="input" type="number" value={form.precoAtual} onChange={(e) => setForm({ ...form, precoAtual: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Qtd. por embalagem de compra</span>
                <input className="input" type="number" value={form.quantidadeEmbalagem} onChange={(e) => setForm({ ...form, quantidadeEmbalagem: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Estoque atual</span>
                <input className="input" type="number" value={form.estoqueAtual} onChange={(e) => setForm({ ...form, estoqueAtual: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Estoque mínimo</span>
                <input className="input" type="number" value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Estoque máximo</span>
                <input className="input" type="number" value={form.estoqueMaximo} onChange={(e) => setForm({ ...form, estoqueMaximo: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Ponto de reposição</span>
                <input className="input" type="number" value={form.pontoReposicao} onChange={(e) => setForm({ ...form, pontoReposicao: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Local de armazenamento</span>
                <input className="input" value={form.localArmazenamento} onChange={(e) => setForm({ ...form, localArmazenamento: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Fornecedor principal</span>
                <select className="input" value={form.fornecedorPrincipalId} onChange={(e) => setForm({ ...form, fornecedorPrincipalId: e.target.value })}>
                  <option value="">Selecione...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Validade</span>
                <input className="input" type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={form.perecivel} onChange={(e) => setForm({ ...form, perecivel: e.target.checked })} />
                <span className="text-sm text-white">Produto perecível</span>
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span className="text-sm text-white">Ativo</span>
              </label>
            </div>
            {error && <p className="text-xs text-nord-danger mt-3">{error}</p>}
            <button onClick={submit} disabled={!form.name.trim() || submitting} className="btn-primary w-full mt-4 py-2.5">
              {submitting ? "Salvando..." : "Salvar"}
            </button>
          </Modal>

          <ConfirmDialog
            open={!!confirmDeleteId}
            title="Excluir produto"
            message="Tem certeza que deseja excluir este produto? Essa ação não pode ser desfeita. Se ele estiver em uso — em uma ficha técnica, compra, perda, transferência, contagem ou movimentação de estoque — a exclusão será bloqueada e você poderá desativá-lo em vez de excluir."
            onConfirm={doDelete}
            onCancel={() => setConfirmDeleteId(null)}
            confirmLabel="Excluir"
            danger
          />

          <ConfirmDialog
            open={confirmBulkDelete}
            title="Excluir produtos selecionados"
            message={`Tem certeza que deseja excluir ${selected.size} produto(s)? Essa ação não pode ser desfeita. Produtos em uso (em ficha técnica, compras, perdas, transferências, contagens ou movimentações de estoque) não serão excluídos — a exclusão desses será bloqueada automaticamente e você verá quais foram bloqueados e o motivo de cada um.`}
            onConfirm={doBulkDelete}
            onCancel={() => setConfirmBulkDelete(false)}
            confirmLabel={bulkDeleting ? "Excluindo..." : "Excluir"}
            danger
          />

          <Modal open={!!bulkResult} onClose={() => setBulkResult(null)} title="Resultado da exclusão em lote">
            {bulkResult && (
              <div className="space-y-3">
                {bulkResult.totalExcluidos > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-nord-success/10 border border-nord-success/30">
                    <CheckCircle2 size={14} className="text-nord-success mt-0.5 shrink-0" />
                    <p className="text-xs text-nord-success">
                      {bulkResult.totalExcluidos} produto(s) excluído(s) com sucesso.
                    </p>
                  </div>
                )}
                {bulkResult.totalBloqueados > 0 && (
                  <div className="p-3 rounded-lg bg-nord-warning/10 border border-nord-warning/30">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-nord-warning mt-0.5 shrink-0" />
                      <p className="text-xs text-nord-warning">
                        {bulkResult.totalBloqueados} produto(s) não puderam ser excluídos:
                      </p>
                    </div>
                    <ul className="mt-2 ml-6 list-disc space-y-1 text-xs text-nord-gray">
                      {bulkResult.resultados
                        .filter((r) => !r.excluido)
                        .map((r) => (
                          <li key={r.id}>
                            <span className="text-white">{r.nome ?? "Um item"}</span>
                            {" — "}
                            {r.motivo ?? "Não foi possível excluir."}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setBulkResult(null)} className="btn-primary w-full mt-4 py-2.5">
              Fechar
            </button>
          </Modal>
        </Section>
      </div>

      <div className={activeTab === "categorias" ? "" : "hidden"}>
        <CategoriasClient
          categories={categories}
          onCategoriesChange={setCategories}
          canCreate={canCreateCategoria}
          canEdit={canEditCategoria}
        />
      </div>
    </div>
  );
}
