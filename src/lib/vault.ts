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
