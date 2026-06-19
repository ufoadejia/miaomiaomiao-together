import '../src/load-env.js';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  BISTU_SCHOOL,
  UPSTREAM_CANTEENS,
  cloneFloors,
  countCanteenHierarchy
} from '../src/legacy-data.js';

const prisma = new PrismaClient();

function getRequiredSchoolPassword() {
  const password = process.env.BISTU_ADMIN_PASSWORD;
  if (password && password.trim() && password.trim() !== 'change-this-school-admin-password') {
    return password.trim();
  }
  if (process.env.ALLOW_DEFAULT_BISTU_PASSWORD === '1') return '123456';
  throw new Error('缺少 BISTU_ADMIN_PASSWORD。生产导入必须显式设置 BISTU 学校管理员密码。');
}

async function upsertBistuSchool(passwordHash) {
  const existing = await prisma.school.findFirst({
    where: {
      OR: [
        { legacyId: BISTU_SCHOOL.legacyId },
        { abbr: BISTU_SCHOOL.abbr },
        { name: BISTU_SCHOOL.name }
      ]
    }
  });

  if (existing) {
    return prisma.school.update({
      where: { id: existing.id },
      data: {
        legacyId: BISTU_SCHOOL.legacyId,
        name: BISTU_SCHOOL.name,
        abbr: BISTU_SCHOOL.abbr,
        admin: BISTU_SCHOOL.admin,
        order: BISTU_SCHOOL.order,
        status: 1,
        passwordHash
      }
    });
  }

  return prisma.school.create({
    data: {
      ...BISTU_SCHOOL,
      status: 1,
      passwordHash
    }
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(getRequiredSchoolPassword(), 10);
  const school = await upsertBistuSchool(passwordHash);

  for (const [index, canteen] of UPSTREAM_CANTEENS.entries()) {
    await prisma.canteen.upsert({
      where: { schoolId_name: { schoolId: school.id, name: canteen.name } },
      create: {
        schoolId: school.id,
        name: canteen.name,
        order: index + 1,
        floors: cloneFloors(canteen.floors)
      },
      update: {
        order: index + 1,
        floors: cloneFloors(canteen.floors)
      }
    });
  }

  const counts = countCanteenHierarchy();
  console.log([
    '上游层级数据导入完成',
    `school=${school.legacyId || school.id}`,
    `canteens=${counts.canteens}`,
    `floors=${counts.floors}`,
    `shops=${counts.shops}`,
    'dishes=0'
  ].join(' '));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
