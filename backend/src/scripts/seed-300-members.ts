import { PrismaClient, MemberGender, MemberStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://mertsevinc@localhost:5432/gym_management_dev';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

// Türk isimleri
const firstNamesMale = [
  'Ahmet',
  'Mehmet',
  'Mustafa',
  'Ali',
  'Hüseyin',
  'İbrahim',
  'Can',
  'Efe',
  'Burak',
  'Emre',
  'Ömer',
  'Murat',
  'Serkan',
  'Hakan',
  'Kemal',
  'Osman',
  'Yusuf',
  'Erdem',
  'Onur',
  'Berk',
  'Çağlar',
  'Deniz',
  'Tuncay',
  'Volkan',
  'Arda',
  'Barış',
  'Cem',
  'Tolga',
  'Kaan',
  'Eren',
];

const firstNamesFemale = [
  'Ayşe',
  'Fatma',
  'Zeynep',
  'Elif',
  'Emine',
  'Merve',
  'Esra',
  'Seda',
  'Büşra',
  'Şeyma',
  'Ebru',
  'Gül',
  'Nur',
  'Dilara',
  'Defne',
  'Ece',
  'Selin',
  'Ceren',
  'Pınar',
  'Nazlı',
  'Cansu',
  'İrem',
  'Tuğba',
  'Sibel',
  'Aslı',
  'Aylin',
  'Sevgi',
  'Yasemin',
  'Gizem',
  'Serap',
];

const lastNames = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Yıldız',
  'Yıldırım',
  'Öztürk',
  'Aydın',
  'Özdemir',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Aslan',
  'Çetin',
  'Kara',
  'Koç',
  'Kurt',
  'Özkan',
  'Şimşek',
  'Erdoğan',
  'Polat',
  'Aksoy',
  'Türk',
  'Aktaş',
  'Güneş',
  'Korkmaz',
  'Özer',
  'Taş',
  'Acar',
  'Başar',
  'Tekin',
  'Güven',
  'Soylu',
  'Öz',
  'Turan',
  'Bozkurt',
  'Karaca',
  'Sönmez',
  'Toprak',
];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generatePhoneNumber(): string {
  const prefix = '05' + Math.floor(Math.random() * 10);
  const number = Math.floor(Math.random() * 100000000)
    .toString()
    .padStart(8, '0');
  return `${prefix}${number}`;
}

function generateEmail(
  firstName: string,
  lastName: string,
  index: number,
): string {
  const cleanFirst = firstName
    .toLowerCase()
    .replace('ı', 'i')
    .replace('ğ', 'g')
    .replace('ü', 'u')
    .replace('ş', 's')
    .replace('ö', 'o')
    .replace('ç', 'c');

  const cleanLast = lastName
    .toLowerCase()
    .replace('ı', 'i')
    .replace('ğ', 'g')
    .replace('ü', 'u')
    .replace('ş', 's')
    .replace('ö', 'o')
    .replace('ç', 'c');

  return `${cleanFirst}.${cleanLast}${index}@test.com`;
}

function getRandomDateInMonth(year: number, month: number): Date {
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.floor(Math.random() * daysInMonth) + 1;
  const hour = Math.floor(Math.random() * 24);
  const minute = Math.floor(Math.random() * 60);
  return new Date(year, month - 1, day, hour, minute);
}

function getRandomDateOfBirth(): Date {
  const year = 1970 + Math.floor(Math.random() * 35); // 1970-2004 arası
  const month = Math.floor(Math.random() * 12);
  const day = Math.floor(Math.random() * 28) + 1;
  return new Date(year, month, day);
}

async function main() {
  console.log('300 test üyesi ekleniyor...');

  // Tenant ve branch bilgilerini al
  const tenant = await prisma.tenant.findFirst({
    where: { slug: { contains: 'test' } },
  });

  if (!tenant) {
    console.error('Test tenant bulunamadı!');
    return;
  }

  const branch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });

  if (!branch) {
    console.error('Branch bulunamadı!');
    return;
  }

  // Membership plan al
  const membershipPlan = await prisma.membershipPlan.findFirst({
    where: {
      tenantId: tenant.id,
      status: 'ACTIVE',
    },
  });

  if (!membershipPlan) {
    console.error('Aktif membership plan bulunamadı!');
    return;
  }

  // User bilgisi al (payment için gerekli)
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
  });

  if (!user) {
    console.error('User bulunamadı!');
    return;
  }

  // 300 üyeyi 12 aya dağıt (her ay yaklaşık 25 üye)
  const membersPerMonth = 25;
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  let totalCreated = 0;

  for (const month of months) {
    console.log(`${month}. ay için üyeler oluşturuluyor...`);

    const membersInThisMonth =
      month === 12 ? 300 - totalCreated : membersPerMonth;

    for (let i = 0; i < membersInThisMonth; i++) {
      const gender =
        Math.random() > 0.5 ? MemberGender.MALE : MemberGender.FEMALE;
      const firstName =
        gender === MemberGender.MALE
          ? getRandomElement(firstNamesMale)
          : getRandomElement(firstNamesFemale);
      const lastName = getRandomElement(lastNames);

      const createdAt = getRandomDateInMonth(2025, month);
      const membershipStartDate = new Date(createdAt);

      // Membership süresini hesapla (plan duration'a göre)
      const membershipEndDate = new Date(membershipStartDate);
      if (membershipPlan.durationType === 'MONTHS') {
        membershipEndDate.setMonth(
          membershipEndDate.getMonth() + membershipPlan.durationValue,
        );
      } else {
        membershipEndDate.setDate(
          membershipEndDate.getDate() + membershipPlan.durationValue,
        );
      }

      const memberIndex = totalCreated + i + 1;

      try {
        // Member oluştur
        const member = await prisma.member.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            firstName,
            lastName,
            gender,
            dateOfBirth: getRandomDateOfBirth(),
            phone: generatePhoneNumber(),
            email: generateEmail(firstName, lastName, memberIndex),
            membershipPlanId: membershipPlan.id,
            membershipStartDate,
            membershipEndDate,
            membershipPriceAtPurchase: membershipPlan.price,
            status: MemberStatus.ACTIVE,
            createdAt,
            updatedAt: createdAt,
          },
        });

        // İlk ödemeyi ekle
        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            memberId: member.id,
            amount: membershipPlan.price,
            paidOn: membershipStartDate,
            paymentMethod: getRandomElement([
              'CASH',
              'CREDIT_CARD',
              'BANK_TRANSFER',
            ] as any[]),
            createdBy: user.id,
            createdAt,
            updatedAt: createdAt,
          },
        });

        totalCreated++;

        if (totalCreated % 50 === 0) {
          console.log(`${totalCreated} üye oluşturuldu...`);
        }
      } catch (error) {
        console.error(`Üye oluşturulurken hata (${memberIndex}):`, error);
      }
    }
  }

  console.log(`\nToplam ${totalCreated} üye başarıyla oluşturuldu!`);
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Branch: ${branch.name}`);
  console.log(`Plan: ${membershipPlan.name}`);
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
