import crypto from "crypto";

// Formato atual (a partir desta mudança, task #177): AES-256-GCM, que já inclui uma tag de
// autenticação nativa — ao contrário do CBC legado abaixo, uma alteração no ciphertext guardado
// no banco é DETECTADA na decriptação (`decipher.final()` lança) em vez de produzir "lixo"
// silencioso. Formato gravado: "gcm:<iv hex, 12 bytes>:<ciphertext hex>:<tag hex, 16 bytes>".
const ALGO_GCM = "aes-256-gcm";
const GCM_IV_BYTES = 12; // tamanho de nonce recomendado para GCM (NIST SP 800-38D) — não precisa
// ser do mesmo tamanho do IV de 16 bytes usado pelo CBC legado.

// Formato legado (pré-GCM, sem tag de autenticação): "<iv hex, 16 bytes>:<ciphertext hex>", sem o
// prefixo "gcm:". Nenhum encryptSecret novo grava neste formato a partir desta mudança — mantido
// só para continuar lendo segredo já salvo no banco antes dela (Cofre de senhas, tokens
// Saipos/Meta Ads, senha de Curso), sem precisar de uma migração de re-criptografia: o valor
// antigo some naturalmente do banco na próxima vez que alguém salvar aquele mesmo segredo de novo
// pela tela (todo encryptSecret daqui em diante já grava em GCM).
const ALGO_CBC_LEGACY = "aes-256-cbc";

function getKey() {
  const secret = process.env.VAULT_SECRET;
  // Nunca cair num valor reserva aqui: uma chave fixa escrita no código-fonte permitiria
  // decifrar Cofre de senhas, tokens Saipos/Meta Ads e senha dos Cursos pra qualquer pessoa que
  // leia o repositório. Melhor quebrar visivelmente numa configuração errada (VAULT_SECRET
  // ausente) do que cifrar tudo com uma chave pública.
  if (!secret) {
    throw new Error("VAULT_SECRET não configurada — obrigatória para usar criptografia de segredos.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO_GCM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptSecret(cipherText: string): string {
  if (cipherText.startsWith("gcm:")) {
    const [, ivHex, dataHex, tagHex] = cipherText.split(":");
    if (!ivHex || !tagHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO_GCM, getKey(), iv);
    decipher.setAuthTag(tag);
    // Diferente do caminho CBC legado abaixo: se o ciphertext ou a tag guardados no banco
    // tiverem sido alterados, `decipher.final()` lança aqui em vez de devolver texto corrompido
    // sem avisar ninguém.
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  }

  // Formato legado (CBC, sem tag de autenticação) — ver comentário de ALGO_CBC_LEGACY acima.
  const [ivHex, dataHex] = cipherText.split(":");
  if (!ivHex || !dataHex) return "";
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO_CBC_LEGACY, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

// Reconhece tanto o formato novo (GCM, com prefixo "gcm:") quanto o legado (CBC, sem prefixo) —
// ver comentários de ALGO_GCM/ALGO_CBC_LEGACY acima. Um valor que bate em qualquer um dos dois é
// tratado como já criptografado; qualquer outra coisa (string vazia, texto puro, etc.) é tratada
// como um valor legado gravado antes de existir criptografia para aquele campo (ex.:
// Course.senhaCipher, que até a introdução do CBC se chamava "senha" e guardava texto puro).
// Isso é uma heurística de formato, não uma prova criptográfica: em tese um texto puro poderia
// por acaso bater num desses formatos exatos, mas é um caso extremamente improvável na prática.
const ENCRYPTED_SECRET_FORMAT =
  /^(?:gcm:[0-9a-f]{24}:(?:[0-9a-f]{2})*:[0-9a-f]{32}|[0-9a-f]{32}:(?:[0-9a-f]{2})+)$/i;

export function isEncryptedSecret(value: string): boolean {
  return ENCRYPTED_SECRET_FORMAT.test(value);
}
