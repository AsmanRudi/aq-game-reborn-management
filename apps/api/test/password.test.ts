import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/password.service.js';

describe('staff password hashing', () => {
  it('stores passwords in a salted scrypt format and verifies only the matching password', async () => {
    const firstHash = await hashPassword('correct horse battery staple');
    const secondHash = await hashPassword('correct horse battery staple');

    expect(firstHash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword('correct horse battery staple', firstHash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', firstHash)).resolves.toBe(false);
  });

  it('rejects unsupported or malformed stored hash formats', async () => {
    await expect(verifyPassword('any password', 'legacy-hash')).resolves.toBe(false);
    await expect(hashPassword('short')).rejects.toThrow('12 hingga 256 karakter');
  });
});
