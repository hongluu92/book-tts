import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Tạo tài khoản mặc định
  const defaultEmail = 'admin@example.com';
  const defaultPassword = 'admin123';

  // Kiểm tra xem user đã tồn tại chưa
  const existingUser = await prisma.user.findUnique({
    where: { email: defaultEmail },
  });

  if (existingUser) {
    console.log(`✅ User ${defaultEmail} already exists`);
    return;
  }

  // Hash password
  const passwordHash = await argon2.hash(defaultPassword);

  // Tạo user
  const user = await prisma.user.create({
    data: {
      email: defaultEmail,
      passwordHash: passwordHash,
    },
  });

  console.log(`✅ Created default user:`);
  console.log(`   Email: ${defaultEmail}`);
  console.log(`   Password: ${defaultPassword}`);
  console.log(`   ID: ${user.id}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the default password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
