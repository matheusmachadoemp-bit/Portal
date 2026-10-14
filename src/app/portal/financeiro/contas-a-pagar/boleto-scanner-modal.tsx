"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/**
 * Modal de leitura de código de barras/QR pela câmera (Contas a Pagar: cadastro de boleto). Usa
 * `@zxing/browser` + `@zxing/library` (MIT/Apache-2.0, zero custo, mantidas ativamente) importadas
 * sob demanda (`import()` dentro do `useEffect`, só quando o modal abre) para não entrar no bundle
 * principal da tela de Contas a Pagar — a maioria das pessoas que abre essa tela não vai ler um
 * código nesse carregamento específico da página.
 *
 * Restringe a leitura a ITF (Interleaved 2 of 5 — o formato do código de barras de boleto
 * bancário) e QR Code (Pix "copia e cola" em QR, cada vez mais comum em boleto) — não tenta ler
 * outros formatos (EAN, Code128 etc.), que não fazem sentido aqui e só deixariam a busca mais
 * lenta/com mais falso positivo.
 */
export function BoletoScannerModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Ref (não dependência do efeito abaixo): `onDetected` normalmente é uma função nova a cada
  // render do componente pai — se entrasse no array de dependências, o efeito reiniciaria a
  // câmera (parando e pedindo a permissão de novo) a cada render enquanto o modal estivesse
  // aberto, em vez de só uma vez ao abrir.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Reinicia o estado visual de uma sessão de leitura anterior (erro/"abrindo a câmera") assim
    // que o modal abre de novo, antes de pedir a câmera — não tem como derivar isso de props/state
    // (é o próprio começo de um efeito externo, iniciar a câmera), só mesmo resetar aqui.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setReady(false);

    (async () => {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      if (cancelled) return;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.ITF, BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);

      try {
        const video = videoRef.current;
        if (!video) return;
        // `facingMode: { ideal: "environment" }` pede a câmera traseira no celular (melhor foco de
        // perto para um código de barras) sem travar num notebook/webcam que só tem uma câmera e
        // não tem "environment": é só uma preferência, não uma exigência que derrubaria a captura.
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            // Chamado a cada tentativa de leitura de um novo quadro de vídeo — a maioria vem sem
            // resultado (NotFoundException, câmera ainda procurando um código no quadro) e não é
            // um erro de verdade, só ignora e deixa a busca continuar até achar algo ou fechar.
            if (result) {
              controlsRef.current?.stop();
              onDetectedRef.current(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "Permissão de câmera negada. Permita o acesso à câmera nas configurações do navegador, ou digite o código manualmente abaixo."
            : name === "NotFoundError"
              ? "Nenhuma câmera encontrada neste dispositivo. Digite o código manualmente abaixo."
              : "Não foi possível acessar a câmera. Digite o código manualmente abaixo."
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  function handleClose() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ler boleto (código de barras ou QR)" widthClass="max-w-md">
      {error ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30">
          <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
          <p className="text-xs text-nord-danger">{error}</p>
        </div>
      ) : (
        <>
          <div className="relative rounded-lg overflow-hidden bg-black aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {/* Viewfinder: só um guia visual pra pessoa saber onde enquadrar o código — não recorta nem processa a imagem. */}
            <div className="absolute inset-6 border-2 border-nord-blue-light/80 rounded-lg pointer-events-none" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-xs text-white">Abrindo a câmera...</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-nord-gray text-center">
            Aponte a câmera para o código de barras ou o QR code do boleto. A leitura é automática.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={handleClose}
        className="w-full mt-4 border border-nord-border text-nord-gray hover:text-white text-sm font-medium rounded-lg py-2.5"
      >
        Cancelar
      </button>
    </Modal>
  );
}
