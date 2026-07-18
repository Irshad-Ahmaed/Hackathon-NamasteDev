import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKeyring(): Record<string, Buffer> {
  const keyringJson = process.env.ENCRYPTION_KEYRING;
  if (keyringJson) {
    try {
      const parsed = JSON.parse(keyringJson);
      const keyring: Record<string, Buffer> = {};
      for (const [ver, hex] of Object.entries(parsed)) {
        keyring[ver] = Buffer.from(hex as string, 'hex');
        if (keyring[ver].length !== 32) {
          throw new Error(`Key version ${ver} length must be 32 bytes`);
        }
      }
      return keyring;
    } catch (e: unknown) {
      const error = e as Error;
      throw new Error('Invalid ENCRYPTION_KEYRING config: ' + error.message);
    }
  }

  // Fallback to legacy single key mode (defaulting to v1 or env-specified version)
  const hexKey = process.env.ENCRYPTION_KEY;
  const activeVersion = process.env.ENCRYPTION_KEY_VERSION || 'v1';
  if (!hexKey) throw new Error('ENCRYPTION_KEY or ENCRYPTION_KEYRING is not set');
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 characters)');
  }
  return { [activeVersion]: key };
}

export function encryptText(text: string): string {
  const activeVersion = process.env.ENCRYPTION_KEY_VERSION || 'v1';
  const keyring = getKeyring();
  const key = keyring[activeVersion];
  if (!key) {
    throw new Error(`Active encryption key version ${activeVersion} not found in keyring`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptText(encryptedText: string, version: string = 'v1'): string {
  const keyring = getKeyring();
  const key = keyring[version];
  if (!key) {
    throw new Error(`Encryption key version ${version} not found in keyring`);
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = decipher.update(encrypted);
  const finalDecrypted = decipher.final();
  return Buffer.concat([decrypted, finalDecrypted]).toString('utf8');
}
