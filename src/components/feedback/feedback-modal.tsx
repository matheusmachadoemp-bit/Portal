"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Upload as UploadIcon,
  X,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";

type FeedbackTipo = "BUG" | "SUGESTAO";

type ModuloOption = {
  id: string;
  key: string;
  name: string;
  subcategories: { id: string; key: string; name: string }[];
};

type AnexoDraft = { name: string; fileUrl: string; mimeType: string; sizeBytes: number };

type Step = "escolha" | "formulario" | "sucesso";

const TITULO_MAX_LENGTH = 120;
const DESCRICAO_MAX_LENGTH = 8000;
const MAX_ANEXOS = 10;
// O backend é a fonte da verdade (limite configurável via env `FEEDBACK_MAX_ATTACHMENT_SIZE_MB`,
// default 50MB — ver src/lib/feedback-server.ts) — este valor é só pra dar feedback imediato no
// cliente antes de tentar o upload; o backend sempre confere de novo.
const MAX_ANEXO_SIZE_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_MIME_TYPES = ["video/mp4"];

const CATEGORIA_PROBLEMA_OPTIONS: { value: string; label: string }[] = [
  { value: "FUNCIONALIDADE_NAO_FUNCIONA", label: "Funcionalidade não funciona" },
  { value: "INFORMACOES_INCORRETAS", label: "Informações incorretas" },
  { value: "ERRO_VISUAL", label: "Erro visual ou de layout" },
  { value: "LENTIDAO", label: "Lentidão" },
  { value: "TRAVAMENTO", label: "Travamento" },
  { value: "PROBLEMA_ACESSO", label: "Problema de acesso" },
  { value: "ERRO_AO_SALVAR", label: "Erro ao salvar informações" },
  { value: "OUTRO", label: "Outro" },
];

const IMPACTO_OPTIONS: { value: string; label: string }[] = [
  { value: "BAIXO", label: "Baixo — não impede o uso" },
  { value: "MEDIO", label: "Médio — dificulta algumas tarefas" },
  { value: "ALTO", label: "Alto — impede uma funcionalidade importante" },
  { value: "CRITICO", label: "Crítico — sistema indisponível ou operação bloqueada" },
];

function emptyFormState() {
  return {
    moduloValue: "",
    moduloTextoLivre: "",
    categoriaProblema: "",
    titulo: "",
    descricao: "",
    impacto: "",
    beneficioEsperado: "",
  };
}

/**
 * Ícone fixo de "Reportar Bug ou Sugerir Melhoria" (Fase 2 da Central de Bugs e Melhorias) — a
 * modal em si. A montagem (`open`/`onClose`) é controlada pelo `Topbar`, que mantém uma única
 * instância desta modal viva em toda página — por isso o estado interno (passo atual, módulos
 * carregados, campos do formulário) reseta ao fechar/reabrir (`handleClose`), mas a lista de
 * módulos (`GET /api/feedback/modulos`) só é buscada uma vez por sessão de página.
 */
export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("escolha");
  const [tipo, setTipo] = useState<FeedbackTipo | null>(null);
  const [form, setForm] = useState(emptyFormState());
  const [anexos, setAnexos] = useState<AnexoDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState<string | null>(null);

  const [modulos, setModulos] = useState<ModuloOption[]>([]);
  const [modulosLoading, setModulosLoading] = useState(false);
  const modulosFetchedRef = useRef(false);
  // Ref pro `<input type="file" hidden>` de anexos — o botão "Anexar" é um `<button>` de
  // verdade que aciona esse input via `.click()` (mesmo padrão de `UserMenu`, troca de foto de
  // perfil: `src/components/topbar/user-menu.tsx`). Antes era um `<label>` envolvendo o input:
  // um `<label>` sem `tabindex` não entra na ordem de tabulação nativa do navegador, então quem
  // navegava só por teclado não conseguia alcançar o controle de anexo de jeito nenhum (achado
  // do Teulis, revisão desta tarefa, confirmado com Tab de verdade, não programático).
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || modulosFetchedRef.current) return;
    modulosFetchedRef.current = true;
    setModulosLoading(true);
    fetch("/api/feedback/modulos")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => setModulos(Array.isArray(data.modulos) ? data.modulos : []))
      .catch(() => setModulos([]))
      .finally(() => setModulosLoading(false));
  }, [open]);

  function set<K extends keyof ReturnType<typeof emptyFormState>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetAll() {
    setStep("escolha");
    setTipo(null);
    setForm(emptyFormState());
    setAnexos([]);
    setUploading(false);
    setUploadProgressLabel(null);
    setSubmitting(false);
    setError(null);
    setProtocolo(null);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  function chooseTipo(next: FeedbackTipo) {
    setTipo(next);
    setForm(emptyFormState());
    setAnexos([]);
    setError(null);
    setStep("formulario");
  }

  function handleBack() {
    setStep("escolha");
    setTipo(null);
    setForm(emptyFormState());
    setAnexos([]);
    setError(null);
  }

  async function handleAddFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const allowedMimes = tipo === "BUG" ? [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES] : IMAGE_MIME_TYPES;
    setError(null);

    if (anexos.length + files.length > MAX_ANEXOS) {
      setError(`Você pode anexar no máximo ${MAX_ANEXOS} arquivos por relato.`);
      return;
    }
    for (const file of files) {
      if (!allowedMimes.includes(file.type)) {
        setError(
          `O arquivo "${file.name}" não é um formato aceito (use JPG, PNG ou WEBP${tipo === "BUG" ? ", ou MP4" : ""}).`
        );
        return;
      }
      if (file.size > MAX_ANEXO_SIZE_BYTES) {
        setError(`O arquivo "${file.name}" excede o tamanho máximo de 50MB.`);
        return;
      }
    }

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgressLabel(files.length > 1 ? `Enviando arquivo ${i + 1} de ${files.length}...` : "Enviando arquivo...");
        const file = files[i];
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        const draft: AnexoDraft = { name: file.name, fileUrl: blob.url, mimeType: file.type, sizeBytes: file.size };
        setAnexos((prev) => [...prev, draft]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar um dos arquivos.");
    } finally {
      setUploading(false);
      setUploadProgressLabel(null);
    }
  }

  function removeAnexo(idx: number) {
    setAnexos((prev) => prev.filter((_, i) => i !== idx));
  }

  function resolveModuloPayload():
    | { categoriaId: string | null; subcategoriaId: string | null; moduloAfetadoTexto: string | null }
    | null {
    const { moduloValue, moduloTextoLivre } = form;
    if (moduloValue.startsWith("sub:")) {
      return { categoriaId: null, subcategoriaId: moduloValue.slice(4), moduloAfetadoTexto: null };
    }
    if (moduloValue.startsWith("cat:")) {
      return { categoriaId: moduloValue.slice(4), subcategoriaId: null, moduloAfetadoTexto: null };
    }
    if (moduloValue === "geral") {
      return { categoriaId: null, subcategoriaId: null, moduloAfetadoTexto: "Geral" };
    }
    if (moduloValue === "outro") {
      const texto = moduloTextoLivre.trim();
      if (texto.length < 2) return null;
      return { categoriaId: null, subcategoriaId: null, moduloAfetadoTexto: texto.slice(0, 120) };
    }
    return null;
  }

  async function handleSubmit() {
    if (submitting || uploading || !tipo) return;
    setError(null);

    const tituloTrim = form.titulo.trim();
    if (!tituloTrim) return setError("Informe um título.");
    if (tituloTrim.length > TITULO_MAX_LENGTH) {
      return setError(`O título pode ter no máximo ${TITULO_MAX_LENGTH} caracteres.`);
    }
    const descricaoTrim = form.descricao.trim();
    if (!descricaoTrim) return setError(tipo === "BUG" ? "Descreva o problema." : "Descreva sua sugestão.");
    if (descricaoTrim.length > DESCRICAO_MAX_LENGTH) {
      return setError(`A descrição pode ter no máximo ${DESCRICAO_MAX_LENGTH} caracteres.`);
    }

    const moduloPayload = resolveModuloPayload();
    if (!moduloPayload) {
      return setError(
        form.moduloValue === "outro" ? "Digite o nome do módulo (mínimo 2 caracteres)." : "Selecione o módulo afetado."
      );
    }

    if (tipo === "BUG" && !form.categoriaProblema) return setError("Selecione a categoria do problema.");
    if (tipo === "BUG" && !form.impacto) return setError("Selecione o impacto do problema.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          titulo: tituloTrim,
          descricao: descricaoTrim,
          ...moduloPayload,
          categoriaProblema: tipo === "BUG" ? form.categoriaProblema : undefined,
          impacto: tipo === "BUG" ? form.impacto : undefined,
          beneficioEsperado:
            tipo === "SUGESTAO" && form.beneficioEsperado.trim() ? form.beneficioEsperado.trim() : undefined,
          anexos,
          rotaOrigem: window.location.pathname,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data?.error === "string" ? data.error : "Não foi possível enviar o relato. Tente novamente."
        );
      }
      const data = await res.json();
      setProtocolo(typeof data?.report?.protocolo === "string" ? data.report.protocolo : null);
      setStep("sucesso");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o relato. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  const widthClass = step === "escolha" ? "max-w-lg" : step === "sucesso" ? "max-w-md" : "max-w-2xl";

  return (
    <Modal open={open} onClose={handleClose} title="Ajude a melhorar o Portal Nord" widthClass={widthClass}>
      {step === "escolha" && (
        <div className="space-y-4">
          <p className="text-sm text-nord-gray">
            Encontrou algum problema ou tem uma ideia para melhorar nosso Portal? Conte para a gente!
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => chooseTipo("BUG")}
              className="nord-card border-t-2 p-5 text-left hover:border-nord-danger/70 transition flex flex-col gap-3"
              style={{ borderTopColor: "#ef4444" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ef444422" }}>
                <Bug size={20} style={{ color: "#ef4444" }} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Reportar Bug</p>
                <p className="text-xs text-nord-gray mt-1">
                  Encontrou um erro ou alguma funcionalidade que não está funcionando corretamente?
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => chooseTipo("SUGESTAO")}
              className="nord-card border-t-2 p-5 text-left hover:border-nord-warning/70 transition flex flex-col gap-3"
              style={{ borderTopColor: "#f59e0b" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#f59e0b22" }}>
                <Lightbulb size={20} style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Sugerir Melhoria</p>
                <p className="text-xs text-nord-gray mt-1">
                  Tem uma ideia para melhorar uma funcionalidade ou adicionar algo novo ao Portal?
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {step === "formulario" && tipo && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button type="button" onClick={handleBack} className="flex items-center gap-1.5 text-xs text-nord-gray hover:text-white">
              <ArrowLeft size={14} /> Voltar
            </button>
            <span className="text-[11px] text-nord-gray">Passo 2 de 2</span>
          </div>

          <div className="flex items-center gap-2">
            {tipo === "BUG" ? (
              <Bug size={16} className="text-nord-danger shrink-0" />
            ) : (
              <Lightbulb size={16} className="text-nord-warning shrink-0" />
            )}
            <p className="text-white font-semibold text-sm">{tipo === "BUG" ? "Reportar Bug" : "Sugerir Melhoria"}</p>
          </div>

          <FormError message={error} />

          <Field label={tipo === "BUG" ? "Módulo afetado *" : "Módulo relacionado *"}>
            <ModuloSelect
              modulos={modulos}
              loading={modulosLoading}
              tipo={tipo}
              value={form.moduloValue}
              onChange={(v) => set("moduloValue", v)}
            />
            {form.moduloValue === "outro" && (
              <input
                className="input w-full mt-2"
                placeholder="Digite o nome do módulo ou tela"
                maxLength={120}
                value={form.moduloTextoLivre}
                onChange={(e) => set("moduloTextoLivre", e.target.value)}
              />
            )}
          </Field>

          {tipo === "BUG" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de problema *">
                <select className="input w-full" value={form.categoriaProblema} onChange={(e) => set("categoriaProblema", e.target.value)}>
                  <option value="">Selecione...</option>
                  {CATEGORIA_PROBLEMA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Impacto no trabalho *">
                <select className="input w-full" value={form.impacto} onChange={(e) => set("impacto", e.target.value)}>
                  <option value="">Selecione...</option>
                  {IMPACTO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <Field label={tipo === "BUG" ? "Título *" : "Título da sugestão *"} hint={`${form.titulo.length}/${TITULO_MAX_LENGTH}`}>
            <input
              className="input w-full"
              maxLength={TITULO_MAX_LENGTH}
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder={tipo === "BUG" ? "Resuma o problema em poucas palavras" : "Resuma sua ideia em poucas palavras"}
            />
          </Field>

          <Field
            label={tipo === "BUG" ? "Descrição *" : "Descrição da melhoria *"}
            hint={`${form.descricao.length}/${DESCRICAO_MAX_LENGTH}`}
          >
            <textarea
              className="input w-full min-h-[90px]"
              maxLength={DESCRICAO_MAX_LENGTH}
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder={
                tipo === "BUG"
                  ? "Explique o que aconteceu, o que você estava tentando fazer e qual resultado esperava."
                  : "Explique sua ideia e como ela poderia melhorar o Portal Nord."
              }
            />
          </Field>

          {tipo === "SUGESTAO" && (
            <Field label="Benefício esperado">
              <textarea
                className="input w-full min-h-[60px]"
                value={form.beneficioEsperado}
                onChange={(e) => set("beneficioEsperado", e.target.value)}
                placeholder="Opcional — o que melhoraria no dia a dia com essa mudança?"
              />
            </Field>
          )}

          <div>
            <span className="text-xs text-nord-gray mb-1 block">
              {tipo === "BUG" ? `Anexar evidências (opcional, até ${MAX_ANEXOS})` : "Anexar imagem (opcional)"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || anexos.length >= MAX_ANEXOS}
                className={`btn-outline inline-flex ${uploading ? "opacity-60" : ""}`}
              >
                <UploadIcon size={13} /> Anexar
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept={tipo === "BUG" ? [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",") : IMAGE_MIME_TYPES.join(",")}
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                  e.target.value = "";
                }}
                disabled={uploading || anexos.length >= MAX_ANEXOS}
              />
              {uploading && (
                <span className="flex items-center gap-1.5 text-xs text-nord-gray">
                  <Loader2 size={13} className="animate-spin" /> {uploadProgressLabel ?? "Enviando..."}
                </span>
              )}
            </div>
            {anexos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {anexos.map((a, idx) => (
                  <span
                    key={`${a.fileUrl}-${idx}`}
                    className="inline-flex items-center gap-1.5 bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white max-w-[220px]"
                  >
                    {a.mimeType.startsWith("video/") ? (
                      <Film size={12} className="shrink-0 text-nord-gray" />
                    ) : (
                      <ImageIcon size={12} className="shrink-0 text-nord-gray" />
                    )}
                    <span className="truncate">{a.name}</span>
                    <button onClick={() => removeAnexo(idx)} className="text-nord-gray hover:text-nord-danger shrink-0">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </button>
            <button className="btn-primary flex items-center gap-1.5" onClick={handleSubmit} disabled={submitting || uploading}>
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Enviando..." : "Enviar relato"}
            </button>
          </div>
        </div>
      )}

      {step === "sucesso" && (
        <div className="text-center space-y-3 py-2">
          <CheckCircle2 size={36} className="text-nord-success mx-auto" />
          <p className="text-white font-semibold">Feedback enviado com sucesso!</p>
          <p className="text-sm text-nord-gray">
            Obrigado por contribuir para a melhoria do Portal Nord. Seu relato foi registrado.
          </p>
          {protocolo && (
            <div className="inline-flex items-center gap-2 bg-nord-blue/10 border border-nord-blue/30 rounded-lg px-4 py-2 mt-1">
              <span className="text-xs text-nord-gray">Protocolo</span>
              <span className="text-white font-mono font-semibold tracking-wide">{protocolo}</span>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pt-3">
            <button className="btn-outline" onClick={() => setStep("escolha")}>
              Enviar outro
            </button>
            <button className="btn-primary" onClick={handleClose}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ModuloSelect({
  modulos,
  loading,
  tipo,
  value,
  onChange,
}: {
  modulos: ModuloOption[];
  loading: boolean;
  tipo: FeedbackTipo;
  value: string;
  onChange: (value: string) => void;
}) {
  const hasGeral = modulos.some((m) => m.name.trim().toLowerCase() === "geral");
  return (
    <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      <option value="">{loading ? "Carregando módulos..." : "Selecione..."}</option>
      {tipo === "SUGESTAO" && !hasGeral && <option value="geral">Geral (não é sobre um módulo específico)</option>}
      {modulos.map((m) =>
        m.subcategories.length > 0 ? (
          <optgroup key={m.id} label={m.name}>
            {m.subcategories.map((s) => (
              <option key={s.id} value={`sub:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={m.id} value={`cat:${m.id}`}>
            {m.name}
          </option>
        )
      )}
      <option value="outro">Outro (não está na lista)</option>
    </select>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1">
        <span className="text-xs text-nord-gray">{label}</span>
        {hint && <span className="text-[11px] text-nord-gray/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
