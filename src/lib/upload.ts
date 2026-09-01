// Nomes de arquivo "do mundo real" (fotos de celular, prints, downloads do
// ChatGPT etc.) costumam ter espacos, acentos, virgulas e mais de um ponto
// (ex.: "ChatGPT Image 3 de ago. de 2026, 11_17_50.png"). O Vercel Blob
// rejeita esses nomes com 400 Bad Request, e o navegador reporta isso como
// erro de CORS (a resposta de erro nao inclui os headers de CORS), entao o
// upload trava sem uma mensagem clara. Sanitizar o nome antes de enviar
// evita isso.
function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
}

export function sanitizeFileName(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < name.length - 1;
  const base = hasExt ? name.slice(0, dotIndex) : name;
  const ext = hasExt ? name.slice(dotIndex + 1) : "";

  const safeBase =
    stripDiacritics(base)
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "arquivo";

  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, "");

  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}
