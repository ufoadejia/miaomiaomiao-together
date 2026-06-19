import '../src/load-env.js';
import { PrismaClient, DishStatus } from '@prisma/client';
import { BISTU_SCHOOL, UPSTREAM_CANTEENS } from '../src/legacy-data.js';

const prisma = new PrismaClient();

const categories = ['盖饭', '麻辣', '粉面', '热菜', '小吃', '饮品'];

const scoreProfiles = {
  4.9: [...Array(18).fill(5), ...Array(2).fill(4)],
  4.8: [...Array(16).fill(5), ...Array(4).fill(4)],
  4.7: [...Array(14).fill(5), ...Array(6).fill(4)],
  4.6: [...Array(12).fill(5), ...Array(8).fill(4)],
  4.5: [...Array(10).fill(5), ...Array(10).fill(4)],
  4.4: [...Array(8).fill(5), ...Array(12).fill(4)]
};

const launchDishes = [
  {
    name: '黄焖鸡米饭',
    shopName: '黄焖鸡米饭',
    floorName: '一楼',
    category: '盖饭',
    targetScore: 4.9,
    description: '酱香浓郁，土豆软糯，是不知道吃什么时最稳的一道。'
  },
  {
    name: '麻辣香锅',
    shopName: '麻辣香锅',
    floorName: '一楼',
    category: '麻辣',
    targetScore: 4.8,
    description: '适合多人拼单，辣度稳定，午饭高峰也很有存在感。'
  },
  {
    name: '桂林米粉',
    shopName: '桂林米粉',
    floorName: '一楼',
    category: '粉面',
    targetScore: 4.7,
    description: '出餐快，汤粉和拌粉都适合赶课前后。'
  },
  {
    name: '酸菜鱼',
    shopName: '酸菜鱼',
    floorName: '二楼',
    category: '热菜',
    targetScore: 4.7,
    description: '酸辣开胃，适合想吃热菜又不想太油的时候。'
  },
  {
    name: '煲仔饭',
    shopName: '煲仔饭',
    floorName: '二楼',
    category: '盖饭',
    targetScore: 4.6,
    description: '锅巴香脆，米饭吸满汤汁，适合慢慢吃完。'
  },
  {
    name: '重庆小面',
    shopName: '重庆小面',
    floorName: '一楼',
    category: '粉面',
    targetScore: 4.6,
    description: '麻香明显，份量轻快，适合课间快速补一顿。'
  },
  {
    name: '煎饼果子',
    shopName: '煎饼果子',
    floorName: '一楼',
    category: '小吃',
    targetScore: 4.5,
    description: '现摊现卷，早八和晚课前都能顶上。'
  },
  {
    name: '麻辣烫',
    shopName: '麻辣烫',
    floorName: '三楼',
    category: '麻辣',
    targetScore: 4.5,
    description: '菜品选择多，汤底稳定，适合想自己搭配的人。'
  },
  {
    name: '烤鱼',
    shopName: '烤鱼',
    floorName: '三楼',
    category: '热菜',
    targetScore: 4.4,
    description: '适合两三个人一起吃，香味足，等待时间稍长。'
  },
  {
    name: '奶茶',
    shopName: '奶茶店',
    floorName: '二楼',
    category: '饮品',
    targetScore: 4.4,
    description: '饭后顺手带一杯，甜度建议从少糖开始。'
  }
];

function canteenNameForDish(dish) {
  const match = UPSTREAM_CANTEENS.find((canteen) => (
    canteen.floors || []
  ).some((floor) => floor.name === dish.floorName && (floor.shops || []).includes(dish.shopName)));
  return match?.name || null;
}

async function upsertCategories(schoolId) {
  const result = new Map();
  for (const [index, name] of categories.entries()) {
    const category = await prisma.category.upsert({
      where: { schoolId_name: { schoolId, name } },
      create: { schoolId, name, order: index + 1 },
      update: { order: index + 1 }
    });
    result.set(name, category);
  }
  return result;
}

async function ensureSeedUsers(count) {
  const users = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index + 1).padStart(3, '0');
    const user = await prisma.user.upsert({
      where: { openid: `launch_seed_reader_${suffix}` },
      create: { openid: `launch_seed_reader_${suffix}`, nickname: `食堂读者${suffix}` },
      update: { nickname: `食堂读者${suffix}` }
    });
    users.push(user);
  }
  return users;
}

async function refreshDishAggregate(dishId) {
  const aggregate = await prisma.rating.aggregate({
    where: { dishId },
    _sum: { score: true },
    _count: { score: true }
  });
  const count = aggregate._count.score || 0;
  const sum = aggregate._sum.score || 0;
  return prisma.dish.update({
    where: { id: dishId },
    data: {
      scoreSum: sum,
      ratingCount: count,
      avgScore: count ? Number((sum / count).toFixed(2)) : 0,
      lastRatedAt: count ? new Date() : null
    }
  });
}

async function main() {
  const school = await prisma.school.findFirst({
    where: {
      OR: [
        { legacyId: BISTU_SCHOOL.legacyId },
        { abbr: BISTU_SCHOOL.abbr },
        { name: BISTU_SCHOOL.name }
      ]
    }
  });
  if (!school) {
    throw new Error('未找到 BISTU 学校记录。请先运行 npm run prisma:import:upstream-hierarchy。');
  }

  const categoryByName = await upsertCategories(school.id);
  const seedUsers = await ensureSeedUsers(20);

  for (const item of launchDishes) {
    const category = categoryByName.get(item.category);
    const canteenName = canteenNameForDish(item);
    const canteen = canteenName
      ? await prisma.canteen.findFirst({ where: { schoolId: school.id, name: canteenName } })
      : null;
    const existing = await prisma.dish.findFirst({ where: { schoolId: school.id, name: item.name } });
    const dish = existing
      ? await prisma.dish.update({
        where: { id: existing.id },
        data: {
          categoryId: category?.id,
          canteenId: canteen?.id,
          shopName: item.shopName,
          floorName: item.floorName,
          description: item.description,
          status: DishStatus.ACTIVE
        }
      })
      : await prisma.dish.create({
        data: {
          schoolId: school.id,
          categoryId: category?.id,
          canteenId: canteen?.id,
          name: item.name,
          shopName: item.shopName,
          floorName: item.floorName,
          description: item.description,
          status: DishStatus.ACTIVE
        }
      });

    const scores = scoreProfiles[item.targetScore] || scoreProfiles[4.5];
    for (const [index, score] of scores.entries()) {
      const user = seedUsers[index];
      await prisma.rating.upsert({
        where: { dishId_userId: { dishId: dish.id, userId: user.id } },
        create: { dishId: dish.id, userId: user.id, score },
        update: { score }
      });
    }
    await refreshDishAggregate(dish.id);
  }

  await prisma.announcement.updateMany({ where: { schoolId: school.id }, data: { active: false } });
  await prisma.announcement.create({
    data: {
      schoolId: school.id,
      content: '今日榜单试运行中，欢迎给上榜菜品评分，也可以投稿你发现的好味道。',
      active: true
    }
  });

  console.log(`首批上线菜品写入完成 school=${school.legacyId || school.id} dishes=${launchDishes.length} seededRatings=${launchDishes.length * seedUsers.length}`);
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
