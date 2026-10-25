import { PrismaClient } from '@prisma/client';
import { hashPassword } from './apps/api/src/services/password.service.js';

const prisma = new PrismaClient();

async function main() {
  const email = 'rudydanjer@gmail.com';
  const password = 'Lakilaki11';
  const name = 'Super Admin';

  // Check if admin already exists
  const existing = await prisma.staffUser.findUnique({
    where: { email },
  });

  if (existing) {
    console.log(`User with email ${email} already exists. Updating password...`);
    const passwordHash = await hashPassword(password);
    await prisma.staffUser.update({
      where: { email },
      data: { passwordHash, name, role: 'ADMIN', active: true },
    });
    console.log('Password updated successfully.');
  } else {
    console.log(`Creating admin user: ${email}`);
    const passwordHash = await hashPassword(password);
    const user = await prisma.staffUser.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'ADMIN',
        active: true,
      },
    });
    console.log(`Admin user created: ${user.id} - ${user.email}`);
  }

  // Verify
  const user = await prisma.staffUser.findUnique({
    where: { email },
  });
  console.log('\n=== Admin User ===');
  console.log(`ID: ${user?.id}`);
  console.log(`Name: ${user?.name}`);
  console.log(`Email: ${user?.email}`);
  console.log(`Role: ${user?.role}`);
  console.log(`Active: ${user?.active}`);
  console.log('==================');
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });