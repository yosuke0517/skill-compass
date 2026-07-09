import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_SALT_LENGTH = 16;

type HashPasswordOptions = {
  salt?: Buffer;
  keyLength?: number;
};

export async function hashPassword(
  password: string,
  options: HashPasswordOptions = {},
): Promise<string> {
  const salt = options.salt ?? randomBytes(DEFAULT_SALT_LENGTH);
  const keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;
  const derivedKey = await scrypt(password, salt, keyLength, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
}

export async function verifyPasswordHash(passwordHash: string, password: string): Promise<boolean> {
  const parts = passwordHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nValue, rValue, pValue, saltValue, hashValue] = parts;
  const expectedKey = Buffer.from(hashValue, "base64");
  const salt = Buffer.from(saltValue, "base64");
  const derivedKey = await scrypt(password, salt, expectedKey.length, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
  });

  return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
}

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}
