import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: MAX_MEMORY,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) {
    throw new Error('Kata sandi harus memiliki 12 hingga 256 karakter.');
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$');
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== String(COST) ||
    parts[2] !== String(BLOCK_SIZE) ||
    parts[3] !== String(PARALLELIZATION) ||
    password.length > 256
  ) {
    await derive(password.slice(0, 256), Buffer.alloc(16, 0x51));
    return false;
  }

  const saltPart = parts[4];
  const hashPart = parts[5];
  if (!saltPart || !hashPart || !/^[A-Za-z0-9_-]+$/.test(saltPart) || !/^[A-Za-z0-9_-]+$/.test(hashPart)) {
    await derive(password.slice(0, 256), Buffer.alloc(16, 0x51));
    return false;
  }
  const salt = Buffer.from(saltPart, 'base64url');
  const expected = Buffer.from(hashPart, 'base64url');
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) {
    await derive(password.slice(0, 256), Buffer.alloc(16, 0x51));
    return false;
  }
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
