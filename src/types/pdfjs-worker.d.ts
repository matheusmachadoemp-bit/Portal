// `pdfjs-dist` só publica `.d.mts` ao lado de `legacy/build/pdf.mjs` (o entrypoint "principal"),
// não de `legacy/build/pdf.worker.mjs` — mas o worker é um módulo ESM válido (com `.mjs` de
// verdade), só sem types. Ver `src/lib/ponto-pdf-import.ts` (`ensureFakeWorkerGlobal`) pro motivo de
// importar esse módulo diretamente (contorna o "fake worker" do pdfjs-dist, que quebra dentro do
// bundler do Next.js). Só precisamos do módulo carregado (efeito colateral, atribuído a
// `globalThis.pdfjsWorker`) — `any` é suficiente, não usamos nenhum export dele diretamente aqui.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
