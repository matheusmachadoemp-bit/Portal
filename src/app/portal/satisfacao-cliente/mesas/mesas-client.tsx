"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, QrCode, Download, Printer, RefreshCw, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";
import { formatNumber } from "@/lib/calc";

type MesaDTO = {
  id: string;
  numero: string;
  ativo: boolean;
  qrGeradoEm: string | null;
  createdAt: string;
  _count: { avaliacoes: number };
  qrCodeUrl: string;
};

type QrState = {
  mesaId: string;
  numero: string;
  qrCodeUrl: string;
  qrCodeDataUrl: string | null;
  loading: boolean;
};

export function MesasClient({
  canCreate,
  canEdit,
  isGrupoNordMode,
}: {
  canCreate: boolean;
  canEdit: boolean;
  isGrupoNordMode: boolean;
}) {
  const [mesas, setMesas] = useState<MesaDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MesaDTO | null>(null);
  const [numeroInput, setNumeroInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [qr, setQr] = useState<QrState | null>(null);
  const [confirmRegenerar, setConfirmRegenerar] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/satisfacao-cliente/mesas");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(json?.error ?? "Não foi possível carregar as mesas.");
        return;
      }
      setMesas(json.mesas);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a lista no mount
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setNumeroInput("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(m: MesaDTO) {
    setEditing(m);
    setNumeroInput(m.numero);
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    if (saving) return;
    if (!numeroInput.trim()) {
      setFormError("Informe o número (ou identificação) da mesa.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const result = await apiRequest(`/api/satisfacao-cliente/mesas/${editing.id}`, "PATCH", { numero: numeroInput.trim() });
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setFormOpen(false);
        await load();
      } else {
        const result = await apiRequest<{ mesa: MesaDTO & { qrCodeDataUrl: string } }>("/api/satisfacao-cliente/mesas", "POST", {
          numero: numeroInput.trim(),
        });
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setFormOpen(false);
        await load();
        // Mostra o QR recém-gerado na hora, já pronto pra baixar/imprimir — evita o admin ter
        // que procurar a mesa na lista e clicar em "Ver QR Code" de novo logo em seguida.
        const mesa = result.data.mesa;
        setQr({ mesaId: mesa.id, numero: mesa.numero, qrCodeUrl: mesa.qrCodeUrl, qrCodeDataUrl: mesa.qrCodeDataUrl, loading: false });
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(m: MesaDTO) {
    setRowError(null);
    setBusyId(m.id);
    try {
      const result = await apiRequest(`/api/satisfacao-cliente/mesas/${m.id}`, "PATCH", { ativo: !m.ativo });
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function openQr(m: MesaDTO) {
    setCopied(false);
    setQr({ mesaId: m.id, numero: m.numero, qrCodeUrl: m.qrCodeUrl, qrCodeDataUrl: null, loading: true });
    const result = await apiRequest<{ qrCodeUrl: string; qrCodeDataUrl: string }>(`/api/satisfacao-cliente/mesas/${m.id}/qrcode`, "GET");
    if (!result.ok) {
      setRowError(result.error);
      setQr(null);
      return;
    }
    setQr({ mesaId: m.id, numero: m.numero, qrCodeUrl: result.data.qrCodeUrl, qrCodeDataUrl: result.data.qrCodeDataUrl, loading: false });
  }

  async function confirmarRegenerar() {
    if (!qr || regenerando) return;
    setRegenerando(true);
    try {
      const result = await apiRequest<{ mesa: MesaDTO & { qrCodeUrl: string; qrCodeDataUrl: string } }>(
        `/api/satisfacao-cliente/mesas/${qr.mesaId}`,
        "PATCH",
        { regenerarToken: true }
      );
      if (!result.ok) {
        setRowError(result.error);
        setConfirmRegenerar(false);
        return;
      }
      setQr({ mesaId: qr.mesaId, numero: qr.numero, qrCodeUrl: result.data.mesa.qrCodeUrl, qrCodeDataUrl: result.data.mesa.qrCodeDataUrl, loading: false });
      setConfirmRegenerar(false);
      await load();
    } finally {
      setRegenerando(false);
    }
  }

  function printQrCode() {
    if (!qr?.qrCodeDataUrl) return;
    const win = window.open("", "_blank", "width=400,height=520");
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>QR Code — Mesa ${qr.numero}</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 24px;">
          <img src="${qr.qrCodeDataUrl}" style="width: 260px; height: 260px;" />
          <h2 style="margin-top: 12px;">Mesa ${qr.numero}</h2>
          <p style="color: #555;">Escaneie para avaliar seu atendimento</p>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  async function copyLink() {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.qrCodeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (ex.: contexto não seguro) — sem crash, só não copia.
    }
  }

  const totalAvaliacoes = mesas.reduce((sum, m) => sum + m._count.avaliacoes, 0);
  const totalAtivas = mesas.filter((m) => m.ativo).length;

  return (
    <div className="space-y-6">
      {!loading && !loadError && (
        <SortableStatCards
          storageKey="satisfacao-cliente-mesas-kpi-order"
          className="grid grid-cols-2 md:grid-cols-3 gap-4"
          cards={[
            { key: "total", label: "Mesas cadastradas", value: formatNumber(mesas.length), icon: "Table2", color: "#1464F4" },
            { key: "ativas", label: "Mesas ativas", value: formatNumber(totalAtivas), icon: "CheckCircle2", color: "#22c55e" },
            { key: "avaliacoes", label: "Avaliações recebidas", value: formatNumber(totalAvaliacoes), icon: "MessagesSquare", color: "#f59e0b" },
          ]}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-medium text-sm">Mesas cadastradas</h2>
        {canCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Nova mesa
          </button>
        )}
      </div>

      {!canCreate && !loading && !loadError && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para cadastrar mesas."
            : "Seu perfil de permissão não permite cadastrar ou editar mesas de Satisfação do Cliente — você pode só visualizar esta tela."}
        </p>
      )}

      <FormError message={rowError} />

      {loading ? (
        <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>
      ) : loadError ? (
        <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>
      ) : (
        <div className="nord-card overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-3 px-4">Mesa</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">QR gerado em</th>
                <th className="py-3 px-4">Avaliações recebidas</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {mesas.map((m) => (
                <tr key={m.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 px-4 text-white font-medium">Mesa {m.numero}</td>
                  <td className="py-2.5 px-4">
                    <Badge tone={m.ativo ? "success" : "danger"}>{m.ativo ? "Ativa" : "Inativa"}</Badge>
                  </td>
                  <td className="py-2.5 px-4 text-nord-gray">{m.qrGeradoEm ? format(new Date(m.qrGeradoEm), "dd/MM/yyyy 'às' HH:mm") : "—"}</td>
                  <td className="py-2.5 px-4 text-nord-gray">{formatNumber(m._count.avaliacoes)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => openQr(m)} className="flex items-center gap-1 text-xs text-nord-gray hover:text-white">
                        <QrCode size={13} /> Ver QR Code
                      </button>
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(m)} className="text-nord-gray hover:text-white">
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => toggleAtivo(m)}
                            disabled={busyId === m.id}
                            className="text-xs text-nord-gray hover:text-white disabled:opacity-50"
                          >
                            {m.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {mesas.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-nord-gray text-sm">
                    Nenhuma mesa cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Editar mesa" : "Nova mesa"} widthClass="max-w-sm">
        <FormError message={formError} />
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Número (ou identificação) da mesa</span>
            <input
              type="text"
              value={numeroInput}
              onChange={(e) => setNumeroInput(e.target.value)}
              className="input"
              placeholder="Ex.: 01, 12, Balcão"
              autoFocus
            />
          </label>
          <button
            onClick={submitForm}
            disabled={saving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar mesa e gerar QR Code"}
          </button>
        </div>
      </Modal>

      <Modal open={qr !== null} onClose={() => setQr(null)} title={qr ? `QR Code — Mesa ${qr.numero}` : "QR Code"} widthClass="max-w-sm">
        {qr && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              {qr.loading || !qr.qrCodeDataUrl ? (
                <div className="w-56 h-56 rounded-lg bg-white/5 flex items-center justify-center text-xs text-nord-gray">Gerando QR Code...</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- imagem data:URL gerada em runtime, não é um asset otimizável pelo next/image
                <img src={qr.qrCodeDataUrl} alt={`QR Code da Mesa ${qr.numero}`} className="w-56 h-56 rounded-lg bg-white p-2" />
              )}
              <div className="w-full flex items-center gap-2 rounded-lg border border-nord-border bg-nord-panel px-2.5 py-2">
                <span className="flex-1 truncate text-[11px] text-nord-gray font-mono">{qr.qrCodeUrl}</span>
                <button onClick={copyLink} title="Copiar link" className="shrink-0 text-nord-gray hover:text-white">
                  {copied ? <Check size={14} className="text-nord-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={qr.qrCodeDataUrl ?? undefined}
                download={`mesa-${qr.numero}-qrcode.png`}
                className={`btn-outline justify-center ${!qr.qrCodeDataUrl ? "pointer-events-none opacity-40" : ""}`}
              >
                <Download size={13} /> Baixar
              </a>
              <button onClick={printQrCode} disabled={!qr.qrCodeDataUrl} className="btn-outline justify-center disabled:opacity-40">
                <Printer size={13} /> Imprimir
              </button>
            </div>

            {canEdit && (
              <button
                onClick={() => setConfirmRegenerar(true)}
                disabled={!qr.qrCodeDataUrl}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-nord-danger/15 text-nord-danger hover:bg-nord-danger/25 disabled:opacity-40"
              >
                <RefreshCw size={13} /> Regenerar QR Code
              </button>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmRegenerar}
        title="Regenerar QR Code"
        message="Isso gera um QR Code novo para essa mesa e o QR Code impresso hoje deixa de funcionar imediatamente. Só confirme se já tiver o QR novo em mãos (ou impresso) para trocar na mesa física — senão os clientes dessa mesa ficarão sem conseguir avaliar até você trocar o QR."
        confirmLabel={regenerando ? "Regenerando..." : "Regenerar mesmo assim"}
        danger
        onConfirm={confirmarRegenerar}
        onCancel={() => setConfirmRegenerar(false)}
      />
    </div>
  );
}
