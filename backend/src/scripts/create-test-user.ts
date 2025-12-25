import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/gym_management_dev';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

async function main() {
  console.log('Creating test tenant and user...');

  // Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Gym',
      slug: 'test-gym',
      defaultCurrency: 'TRY',
      planKey: 'SINGLE',
      billingStatus: 'ACTIVE',
    },
  });

  console.log('✅ Tenant created:', {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
  });

  // Create default branch for the tenant
  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Ana Şube',
      address: 'Test Adresi, İstanbul',
      isDefault: true,
      isActive: true,
    },
  });

  console.log('✅ Branch created:', {
    id: branch.id,
    name: branch.name,
  });

  // Create User with hashed password
  const password = 'Test123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@testgym.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✅ User created:', {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  });

  console.log('\n🎉 Test data created successfully!');
  console.log('\nLogin credentials:');
  console.log('Email:', user.email);
  console.log('Password:', password);
  console.log('Tenant Slug:', tenant.slug);
}

main()
  .catch((e) => {
    console.error('Error creating test data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
