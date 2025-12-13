import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

function generateCuid() {
  // Simple CUID-like ID generator
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(8).toString('hex');
  return `c${timestamp}${randomPart}`;
}

async function main() {
  const tenantId = 'gym-dev';
  const email = 'admin@gym-dev.com';
  const password = 'Admin123!';
  const firstName = 'Admin';
  const lastName = 'User';

  // Hash the password
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = generateCuid();
  const now = new Date().toISOString();

  // Generate SQL
  const sql = `
INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", role, "isActive", "createdAt", "updatedAt")
VALUES (
  '${userId}',
  '${tenantId}',
  '${email}',
  '${passwordHash}',
  '${firstName}',
  '${lastName}',
  'ADMIN',
  true,
  '${now}',
  '${now}'
);
  `.trim();

  console.log('✅ SQL Query Generated!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Run this SQL query in your database:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(sql);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📧 Email:', email);
  console.log('🔑 Password:', password);
  console.log('👤 Name:', `${firstName} ${lastName}`);
  console.log('🏢 Tenant ID:', tenantId);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
