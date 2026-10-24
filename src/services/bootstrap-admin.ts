import { StaffUser } from '@prisma/client';
import { prisma } from './db.js';
import { hashPassword } from './services/password.service.js';

export async function bootstrapAdmin({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}): Promise<StaffUser> {
  // Check if any admin exists
  const existingAdmin = await prisma.staffUser.findFirst({
    where: { role: 'ADMIN' },
  });

  if (existingAdmin) {
    throw new Error('Admin already exists. Cannot create another admin user.');
  }

  // Validate input
  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required.');
  }

  if (!email.includes('@')) {
    throw new Error('Invalid email format.');
  }

  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters long.');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create admin user
  const adminUser = await prisma.staffUser.create({
    data: {
      id: '00000000-0000-0000-0000-000000000000', // Use a known UUID for the first admin
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      active: true,
    },
  });

  return adminUser;
}