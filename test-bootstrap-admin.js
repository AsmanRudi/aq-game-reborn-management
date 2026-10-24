//!/usr/bin/env node
// Test script to verify bootstrap admin functionality

const { prisma } = require('./src/db');
const { bootstrapAdmin } = require('./src/services/bootstrap-admin');

async function testBootstrapAdmin() {
  console.log('Testing bootstrap admin functionality...');

  // Clean up any existing test data
  try {
    await prisma.booking.deleteMany({ where: {} });
    await prisma.station.deleteMany({ where: { code: { startsWith: 'TEST-' } } });
    await prisma.rate.deleteMany({ where: { key: { startsWith: 'TEST-RATE' } } });
    await prisma.staffUser.deleteMany({ where: {} });
    console.log('Cleaned up existing test data');
  } catch (error) {
    console.error('Error cleaning up:', error);
  }

  // Check if any admin exists
  const existingAdmin = await prisma.staffUser.findFirst({
    where: { role: 'ADMIN' },
  });

  if (existingAdmin) {
    console.log('Admin already exists:', existingAdmin.email);
    return;
  }

  console.log('No admin found. Creating first admin...');

  // Test the bootstrap function
  const result = await bootstrapAdmin({
    name: 'Super Admin',
    email: 'admin-test@example.com',
    password: 'TestPassword123!',
  });

  console.log('Bootstrap admin result:', result);

  // Verify the admin was created
  const createdAdmin = await prisma.staffUser.findFirst({
    where: { email: 'admin-test@example.com' },
  });

  if (createdAdmin) {
    console.log('✅ Admin created successfully:');
    console.log('  ID:', createdAdmin.id);
    console.log('  Name:', createdAdmin.name);
    console.log('  Email:', createdAdmin.email);
    console.log('  Role:', createdAdmin.role);
    console.log('  Active:', createdAdmin.active);
    console.log('\n✅ Bootstrap admin functionality is working correctly!');
  } else {
    console.error('❌ Failed to create admin');
    process.exit(1);
  }

  // Clean up
  await prisma.booking.deleteMany({ where: {} });
  await prisma.station.deleteMany({ where: { code: { startsWith: 'TEST-' } } });
  await prisma.rate.deleteMany({ where: { key: { startsWith: 'TEST-RATE' } } });
  await prisma.staffUser.deleteMany({ where: { id: createdAdmin.id } });
  await prisma.$disconnect();

  console.log('\n✅ Test completed successfully!');
}

// Import bootstrap admin function
type { bootstrapAdmin } from './src/services/bootstrap-admin';