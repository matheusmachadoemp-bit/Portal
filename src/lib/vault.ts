import crypto from "crypto";

const ALGO = "aes-256-cbc";

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
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(cipherText: string): string {
  const [ivHex, dataHex] = cipherText.split(":");
  if (!ivHex || !dataHex) return "";
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

// encryptSecret sempre produz "<iv em hex, 16 bytes = 32 caracteres>:<dado
// cifrado em hex>". Um valor que bate nesse formato é tratado como já
// criptografado; qualquer outra coisa (string vazia, texto puro, etc.) é
// tratada como um valor legado gravado antes de existir criptografia para
// aquele campo (ex.: Course.senhaCipher, que até esta mudança se chamava
// "senha" e guardava texto puro). Isso é uma heurística de formato, não uma
// prova criptográfica: em tese um texto puro poderia por acaso ter esse
// formato exato, mas é um caso extremamente improvável na prática.
const ENCRYPTED_SECRET_FORMAT = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+$/i;

export function isEncryptedSecret(value: string): boolean {
  return ENCRYPTED_SECRET_FORMAT.test(value);
}
