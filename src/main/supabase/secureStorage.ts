import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Armazena a sessão do Supabase (access/refresh token) criptografada, pra o
// usuário não precisar logar toda vez que abrir o app.
//
// Preferimos o Keychain/DPAPI do SO (Electron safeStorage) quando disponível.
// Mas em produção apareceu um Mac (macOS bem recente, "26.5") onde
// safeStorage.isEncryptionAvailable() retorna false — o supabase-js usa esse
// storage como fonte de verdade pra decidir se há sessão ativa, então sem
// persistência a cada request depois do login ia sem o header de
// autenticação, e o RLS do banco filtrava tudo como se ninguém tivesse
// logado. Em vez de desistir de criptografar quando o Keychain falha (o que
// deixaria o token em texto puro em disco), geramos e guardamos nossa
// própria chave AES-256-GCM local — continua criptografado em repouso,
// só não depende mais do Keychain do SO funcionar. Vale pra Macs antigos e
// novos, e serve de fallback também no Windows se o DPAPI um dia falhar.

function filePath(): string {
  return path.join(app.getPath('userData'), 'auth-session.enc');
}

function fallbackFilePath(): string {
  return path.join(app.getPath('userData'), 'auth-session.local-enc.json');
}

function fallbackKeyPath(): string {
  return path.join(app.getPath('userData'), 'auth-session.key');
}

function debugLog(label: string, data: unknown): void {
  try {
    const line = `[${new Date().toISOString()}] [secureStorage] ${label} ${JSON.stringify(data)}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug-auth.log'), line);
  } catch {
    // ignora falha de log
  }
}

// Chave local de 32 bytes, gerada uma vez e reaproveitada. Guardada com
// permissão restrita ao dono do arquivo (equivalente a "só esse usuário do
// SO lê"), que é a mesma garantia prática que already tínhamos com
// auth-session.enc antes de depender do Keychain.
function getOrCreateFallbackKey(): Buffer {
  try {
    return Buffer.from(fs.readFileSync(fallbackKeyPath(), 'utf8'), 'base64');
  } catch {
    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(fallbackKeyPath()), { recursive: true });
    fs.writeFileSync(fallbackKeyPath(), key.toString('base64'), { mode: 0o600 });
    return key;
  }
}

function fallbackEncrypt(plaintext: string): string {
  const key = getOrCreateFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function fallbackDecrypt(payload: string): string {
  const { iv, authTag, ciphertext } = JSON.parse(payload) as { iv: string; authTag: string; ciphertext: string };
  const key = getOrCreateFallbackKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

function readAll(): Record<string, string> {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      debugLog('readAll: Keychain/DPAPI indisponível, usando chave local', {});
      try {
        return JSON.parse(fallbackDecrypt(fs.readFileSync(fallbackFilePath(), 'utf8')));
      } catch {
        return {};
      }
    }
    const raw = fs.readFileSync(filePath());
    const decrypted = safeStorage.decryptString(raw);
    return JSON.parse(decrypted);
  } catch (err) {
    debugLog('readAll falhou', { message: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

function writeAll(data: Record<string, string>): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      debugLog('writeAll: Keychain/DPAPI indisponível, gravando com chave local', {});
      fs.mkdirSync(path.dirname(fallbackFilePath()), { recursive: true });
      fs.writeFileSync(fallbackFilePath(), fallbackEncrypt(JSON.stringify(data)), { mode: 0o600 });
      return;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(data));
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), encrypted);
  } catch (err) {
    // Se o Keychain/DPAPI falhar de um jeito inesperado (não coberto pelo
    // check de isEncryptionAvailable), não deixamos isso derrubar o fluxo de
    // login — a sessão só não fica salva pra próxima abertura.
    debugLog('writeAll falhou', { message: err instanceof Error ? err.message : String(err) });
  }
}

// Implementa a interface de storage assíncrono esperada pelo supabase-js
// (getItem/setItem/removeItem), já que o processo main não tem localStorage.
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = readAll()[key] ?? null;
    debugLog('getItem', { key, found: value !== null });
    return value;
  },
  async setItem(key: string, value: string): Promise<void> {
    debugLog('setItem', { key, valueLength: value.length });
    const data = readAll();
    data[key] = value;
    writeAll(data);
  },
  async removeItem(key: string): Promise<void> {
    const data = readAll();
    delete data[key];
    writeAll(data);
  },
};
