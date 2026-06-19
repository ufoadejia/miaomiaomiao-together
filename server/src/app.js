import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { DishStatus } from '@prisma/client';
import { prisma } from './db.js';
import { config } from './config.js';
import { sortRankedDishes } from './ranking.js';
import { BISTU_SCHOOL, UPSTREAM_CANTEENS, cloneFloors } from './legacy-data.js';

const BISTU_LEGACY_ID = BISTU_SCHOOL.legacyId;
const DEV_BISTU_ADMIN_PASSWORD = '123456';
const LEGACY_ADMIN_ACTIONS = new Set([
  'addSchool',
  'updateSchool',
  'deleteSchool',
  'updateSchoolOrder',
  'initCanteenData',
  'addCanteen',
  'deleteCanteen',
  'addShop',
  'deleteShop',
  'addFloor',
  'deleteFloor',
  'getAllSchoolStats',
  'getAllShopStats',
  'setAnnouncement',
  'updateShopInfo',
  'getSuggestions'
]);
const LEGACY_MASTER_ACTIONS = new Set([
  'addSchool',
  'updateSchool',
  'deleteSchool',
  'updateSchoolOrder',
  'getAllSchoolStats',
  'getSuggestions'
]);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function signUserToken(user) {
  return jwt.sign({ type: 'user', sub: user.id }, config.jwtSecret, { expiresIn: '30d' });
}

function signAdminToken(sessionId, role, schoolId) {
  return jwt.sign({ type: 'admin', sid: sessionId, role, schoolId: schoolId || null }, config.jwtSecret, { expiresIn: '12h' });
}

function bearerToken(request) {
  const auth = request.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

async function requireUser(request) {
  const token = bearerToken(request);
  if (!token) throw httpError(401, '请先登录');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw httpError(401, '登录已失效');
  }
  if (payload.type !== 'user') throw httpError(401, '登录类型错误');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw httpError(401, '用户不存在');
  return user;
}

async function optionalUser(request) {
  try {
    return await requireUser(request);
  } catch {
    return null;
  }
}

async function optionalAdmin(request) {
  if (!bearerToken(request)) return null;
  return requireAdmin(request);
}

async function requireAdmin(request) {
  const token = bearerToken(request);
  if (!token) throw httpError(401, '请先登录管理后台');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw httpError(401, '管理登录已失效');
  }
  if (payload.type !== 'admin') throw httpError(401, '登录类型错误');

  const session = await prisma.adminSession.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!session || session.expiresAt < new Date()) throw httpError(401, '管理登录已过期');
  return { ...session, role: payload.role, schoolId: payload.schoolId || session.schoolId };
}

function toSchool(school) {
  return {
    _id: school.legacyId || school.id,
    id: school.id,
    name: school.name,
    abbr: school.abbr,
    admin: school.admin || '',
    order: school.order,
    status: school.status
  };
}

function toCanteen(canteen) {
  return {
    _id: canteen.id,
    id: canteen.id,
    schoolId: canteen.school?.legacyId || canteen.schoolId,
    name: canteen.name,
    order: canteen.order,
    floors: normalizeFloors(canteen.floors)
  };
}

function dishHeadline(dish) {
  const name = String(dish.name || '这道菜').trim();
  const shop = String(dish.shopName || dish.canteen?.name || '').trim();
  const category = String(dish.category?.name || '').trim();
  const ratingCount = Number(dish.ratingCount || 0);

  if (ratingCount >= 20) return `${name}收获${ratingCount}张食堂票，继续留在今日版面`;
  if (ratingCount > 0) return `${name}拿到${ratingCount}张新票，正在冲上风味榜`;
  if (shop) return `${shop}把${name}送上今日候选`;
  if (category) return `${name}登上${category}栏目，等待第一张票`;
  return `${name}成为今天的食堂头条候选`;
}

function toDish(dish) {
  return {
    id: dish.id,
    schoolId: dish.school?.legacyId || dish.schoolId,
    schoolName: dish.school?.name || '',
    categoryId: dish.categoryId,
    categoryName: dish.category?.name || '',
    canteenId: dish.canteenId,
    canteenName: dish.canteen?.name || '',
    floorName: dish.floorName || '',
    shopName: dish.shopName || '',
    name: dish.name,
    headline: dishHeadline(dish),
    description: dish.description || '',
    imageUrl: dish.imageUrl || '',
    status: dish.status,
    avgScore: Number(dish.avgScore || 0),
    ratingCount: dish.ratingCount || 0,
    rankScore: Number(dish.rankScore || 0),
    lastRatedAt: dish.lastRatedAt,
    createdAt: dish.createdAt,
    updatedAt: dish.updatedAt
  };
}

function normalizeFloors(floors) {
  if (!Array.isArray(floors)) return [];
  return floors.map((floor) => ({
    name: String(floor.name || ''),
    shops: Array.isArray(floor.shops) ? floor.shops.map(String) : []
  }));
}

function assertAdminCanAccessSchool(admin, schoolId) {
  if (admin.role === 'MASTER') return;
  if (!schoolId || admin.schoolId !== schoolId) throw httpError(403, '无权操作该学校');
}

async function resolveSchoolId(externalId) {
  if (!externalId) return null;
  const school = await prisma.school.findFirst({
    where: { OR: [{ id: externalId }, { legacyId: externalId }] }
  });
  return school?.id || null;
}

async function getDefaultSchoolId() {
  const school = await prisma.school.findFirst({
    where: { OR: [{ legacyId: BISTU_LEGACY_ID }, { abbr: 'BISTU' }] }
  });
  return school?.id || null;
}

async function resolveLegacyActionSchoolId(event) {
  const externalSchoolId = event?.schoolId || event?.data?.schoolId;
  const schoolId = await resolveSchoolId(externalSchoolId);
  if (schoolId) return schoolId;

  const canteenId = event?.data?.canteenId;
  if (canteenId) {
    const canteen = await prisma.canteen.findUnique({
      where: { id: canteenId },
      select: { schoolId: true }
    });
    if (canteen?.schoolId) return canteen.schoolId;
  }

  return getDefaultSchoolId();
}

async function requireLegacyActionAdmin(request, event) {
  const action = event?.action;
  if (!LEGACY_ADMIN_ACTIONS.has(action)) return null;

  const admin = await requireAdmin(request);
  if (LEGACY_MASTER_ACTIONS.has(action) && admin.role !== 'MASTER') {
    throw httpError(403, '需要总后台权限');
  }

  if (!LEGACY_MASTER_ACTIONS.has(action)) {
    const schoolId = await resolveLegacyActionSchoolId(event);
    assertAdminCanAccessSchool(admin, schoolId);
  }

  return admin;
}

async function ensureBistuSchool() {
  const existing = await prisma.school.findFirst({
    where: { OR: [{ legacyId: BISTU_LEGACY_ID }, { abbr: 'BISTU' }] }
  });
  if (existing) return existing;

  const password = config.bistuAdminPassword || DEV_BISTU_ADMIN_PASSWORD;
  return prisma.school.create({
    data: {
      ...BISTU_SCHOOL,
      passwordHash: await bcrypt.hash(password, 10),
      order: BISTU_SCHOOL.order
    }
  });
}

async function ensureDefaultCanteens(schoolId) {
  const count = await prisma.canteen.count({ where: { schoolId } });
  if (count > 0) return;

  await prisma.canteen.createMany({
    data: UPSTREAM_CANTEENS.map((canteen, index) => ({
      schoolId,
      name: canteen.name,
      order: index + 1,
      floors: cloneFloors(canteen.floors)
    })),
    skipDuplicates: true
  });
}

async function resolveCategory(categoryId, categoryName, schoolId) {
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw httpError(404, '分类不存在');
    if (category.schoolId && category.schoolId !== schoolId) throw httpError(400, '分类不属于当前学校');
    return category.id;
  }
  if (!categoryName || !String(categoryName).trim()) return null;

  const name = String(categoryName).trim();
  const existing = await prisma.category.findFirst({ where: { schoolId, name } });
  if (existing) return existing.id;

  const category = await prisma.category.create({ data: { schoolId, name } });
  return category.id;
}

async function incrementStat(client, scope, schoolId = null, date = null) {
  return client.usageStat.upsert({
    where: { scope },
    create: { scope, schoolId, date, count: 1 },
    update: { count: { increment: 1 } }
  });
}

async function getStat(scope) {
  const stat = await prisma.usageStat.findUnique({ where: { scope } });
  return stat?.count || 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function parseDishPayload(request) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) return request.body || {};

  const fields = {};
  let imageUrl = '';

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (!part.filename) continue;
      if (part.fieldname !== 'image') {
        part.file.resume();
        continue;
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(part.mimetype)) {
        throw httpError(400, '图片仅支持 jpg、png、webp、gif');
      }

      await fs.mkdir(config.uploadDir, { recursive: true });
      const ext = path.extname(part.filename).toLowerCase() || '.jpg';
      const filename = `${nanoid(18)}${ext}`;
      await pipeline(part.file, createWriteStream(path.join(config.uploadDir, filename)));
      imageUrl = `${config.publicBaseUrl}${config.uploadPublicPath}/${filename}`;
    } else {
      fields[part.fieldname] = part.value;
    }
  }

  return { ...fields, imageUrl };
}

async function exchangeWechatCode(code) {
  if (config.wechatAppId && config.wechatSecret && code) {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', config.wechatAppId);
    url.searchParams.set('secret', config.wechatSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const res = await fetch(url);
    const data = await res.json();
    if (data.openid) return data.openid;
    throw httpError(401, data.errmsg || '微信登录失败');
  }

  if (config.isProduction) throw httpError(500, '微信登录未配置');
  return `dev_${code || nanoid(16)}`;
}

async function verifyAdminPassword(password) {
  if (!password) return null;
  if (password === config.masterPassword) return { role: 'MASTER', schoolId: null };

  const schools = await prisma.school.findMany({ where: { passwordHash: { not: null } } });
  for (const school of schools) {
    if (await bcrypt.compare(password, school.passwordHash)) {
      return { role: 'SCHOOL', schoolId: school.id, schoolName: school.name };
    }
  }
  return null;
}

async function createAdminSession(login) {
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const tempToken = signAdminToken(nanoid(12), login.role, login.schoolId);
  const session = await prisma.adminSession.create({
    data: {
      tokenHash: tokenHash(tempToken),
      role: login.role,
      schoolId: login.schoolId,
      expiresAt
    }
  });
  const token = signAdminToken(session.id, login.role, login.schoolId);
  await prisma.adminSession.update({
    where: { id: session.id },
    data: { tokenHash: tokenHash(token) }
  });
  return { token, expiresAt };
}

async function updateDishRatingAggregate(tx, dishId) {
  const aggregate = await tx.rating.aggregate({
    where: { dishId },
    _avg: { score: true },
    _sum: { score: true },
    _count: { score: true }
  });

  return tx.dish.update({
    where: { id: dishId },
    data: {
      avgScore: aggregate._avg.score || 0,
      scoreSum: aggregate._sum.score || 0,
      ratingCount: aggregate._count.score || 0,
      lastRatedAt: new Date()
    },
    include: { category: true, school: true, canteen: true }
  });
}

async function registerApiRoutes(app, prefix) {
  await app.register(async (api) => {
    api.get('/health', async () => ({
      ok: true,
      service: 'dish-rank-server',
      time: new Date().toISOString()
    }));

    api.post('/auth/wechat', async (request) => {
      const { code, nickname, avatarUrl } = request.body || {};
      const cleanNickname = String(nickname || '').trim();
      const cleanAvatarUrl = String(avatarUrl || '').trim();
      const updateData = {};
      if (cleanNickname) updateData.nickname = cleanNickname;
      if (cleanAvatarUrl) updateData.avatarUrl = cleanAvatarUrl;
      const openid = await exchangeWechatCode(code);
      const user = await prisma.user.upsert({
        where: { openid },
        create: {
          openid,
          nickname: cleanNickname || '微信读者',
          avatarUrl: cleanAvatarUrl
        },
        update: updateData
      });
      return { success: true, data: { token: signUserToken(user), user } };
    });

    api.post('/auth/web', async (request) => {
      const { nickname } = request.body || {};
      const openid = `web_${request.ip}_${nickname || 'guest'}`;
      const user = await prisma.user.upsert({
        where: { openid },
        create: { openid, nickname: nickname || '网页用户' },
        update: { nickname: nickname || '网页用户' }
      });
      return { success: true, data: { token: signUserToken(user), user } };
    });

    api.post('/admin/login', async (request) => {
      const login = await verifyAdminPassword(request.body?.password);
      if (!login) throw httpError(401, '密码错误');
      const session = await createAdminSession(login);
      return { success: true, data: { ...session, role: login.role, schoolId: login.schoolId, schoolName: login.schoolName || '' } };
    });

    api.get('/schools', async () => {
      await ensureBistuSchool();
      const schools = await prisma.school.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
      return { success: true, data: schools.map(toSchool) };
    });

    api.get('/categories', async (request) => {
      const schoolId = await resolveSchoolId(request.query.schoolId);
      const categories = await prisma.category.findMany({
        where: { OR: [{ schoolId }, { schoolId: null }] },
        orderBy: [{ order: 'asc' }, { name: 'asc' }]
      });
      return { success: true, data: categories };
    });

    api.post('/categories', async (request) => {
      const admin = await requireAdmin(request);
      const schoolId = admin.role === 'MASTER'
        ? await resolveSchoolId(request.body?.schoolId)
        : admin.schoolId;
      const name = String(request.body?.name || '').trim();
      if (!name) throw httpError(400, '分类名称不能为空');
      const category = await prisma.category.create({ data: { schoolId, name } });
      return { success: true, data: category };
    });

    api.get('/dishes', async (request) => {
      let schoolId = await resolveSchoolId(request.query.schoolId);
      let includeOffline = false;
      if (request.query.includeOffline === '1') {
        const admin = await optionalAdmin(request);
        includeOffline = Boolean(admin);
        if (admin?.role !== 'MASTER') {
          if (schoolId && schoolId !== admin.schoolId) throw httpError(403, '无权查看该学校菜品');
          schoolId = admin?.schoolId || schoolId;
        }
      }
      const where = {
        ...(includeOffline ? {} : { status: DishStatus.ACTIVE }),
        ...(schoolId ? { schoolId } : {}),
        ...(request.query.categoryId ? { categoryId: request.query.categoryId } : {})
      };
      const dishes = await prisma.dish.findMany({
        where,
        include: { category: true, school: true, canteen: true },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Number(request.query.limit || 100), 200)
      });
      return { success: true, data: dishes.map(toDish) };
    });

    api.post('/dishes', async (request) => {
      const user = await requireUser(request);
      const body = await parseDishPayload(request);
      const name = String(body.name || '').trim();
      if (!name) throw httpError(400, '菜品名称不能为空');

      const schoolId = await resolveSchoolId(body.schoolId) || await getDefaultSchoolId();
      const categoryId = await resolveCategory(body.categoryId, body.categoryName || body.category, schoolId);
      const canteenId = body.canteenId || null;
      const dish = await prisma.dish.create({
        data: {
          schoolId,
          categoryId,
          canteenId,
          uploaderId: user.id,
          name,
          shopName: body.shopName || null,
          floorName: body.floorName || null,
          description: body.description || '',
          imageUrl: body.imageUrl || '',
          status: DishStatus.PENDING
        },
        include: { category: true, school: true, canteen: true }
      });
      return { success: true, data: toDish(dish) };
    });

    const updateDishHandler = async (request) => {
      const admin = await requireAdmin(request);
      const current = await prisma.dish.findUnique({ where: { id: request.params.id } });
      if (!current) throw httpError(404, '菜品不存在');
      assertAdminCanAccessSchool(admin, current.schoolId);

      const body = request.body || {};
      const data = {};
      for (const key of ['name', 'description', 'shopName', 'floorName', 'imageUrl']) {
        if (body[key] !== undefined) data[key] = body[key];
      }
      if (body.status !== undefined) {
        if (!Object.values(DishStatus).includes(body.status)) throw httpError(400, '状态不合法');
        data.status = body.status;
      }
      if (body.categoryId || body.categoryName) {
        data.categoryId = await resolveCategory(body.categoryId, body.categoryName, current.schoolId);
      }
      const dish = await prisma.dish.update({
        where: { id: request.params.id },
        data,
        include: { category: true, school: true, canteen: true }
      });
      return { success: true, data: toDish(dish) };
    };

    api.patch('/dishes/:id', updateDishHandler);
    api.put('/dishes/:id', updateDishHandler);

    api.post('/ratings', async (request) => {
      const user = await requireUser(request);
      const dishId = request.body?.dishId;
      const score = Number(request.body?.score);
      if (!dishId) throw httpError(400, '缺少菜品 ID');
      if (!Number.isInteger(score) || score < 1 || score > 5) throw httpError(400, '评分必须是 1-5 的整数');

      const dish = await prisma.$transaction(async (tx) => {
        const target = await tx.dish.findUnique({ where: { id: dishId } });
        if (!target || target.status !== DishStatus.ACTIVE) throw httpError(404, '菜品不存在或已下架');
        await tx.rating.upsert({
          where: { dishId_userId: { dishId, userId: user.id } },
          create: { dishId, userId: user.id, score, comment: request.body?.comment || '' },
          update: { score, comment: request.body?.comment || '' }
        });
        return updateDishRatingAggregate(tx, dishId);
      });

      return { success: true, data: toDish(dish) };
    });

    api.get('/rankings', async (request) => {
      const schoolId = await resolveSchoolId(request.query.schoolId);
      const dishes = await prisma.dish.findMany({
        where: {
          status: DishStatus.ACTIVE,
          ...(schoolId ? { schoolId } : {})
        },
        include: { category: true, school: true, canteen: true },
        take: 300
      });
      const ranked = sortRankedDishes(dishes).slice(0, Math.min(Number(request.query.limit || 50), 100));
      return { success: true, data: ranked.map(toDish) };
    });

    api.get('/announcements', async (request) => {
      const schoolId = await resolveSchoolId(request.query.schoolId);
      const announcement = await prisma.announcement.findFirst({
        where: { schoolId, active: true },
        orderBy: { updatedAt: 'desc' }
      });
      return { success: true, data: announcement?.content || '' };
    });

    api.put('/announcements', async (request) => {
      const admin = await requireAdmin(request);
      const schoolId = admin.role === 'MASTER'
        ? await resolveSchoolId(request.body?.schoolId)
        : admin.schoolId;
      const content = String(request.body?.content || '');
      await prisma.announcement.updateMany({ where: { schoolId }, data: { active: false } });
      const announcement = await prisma.announcement.create({ data: { schoolId, content, active: true } });
      return { success: true, data: announcement };
    });

    api.post('/miniprogram/call', async (request) => {
      const event = request.body || {};
      await requireLegacyActionAdmin(request, event);
      return runLegacyAction(event);
    });
  }, { prefix });
}

async function runLegacyAction(event) {
  const { action, data = {}, schoolId } = event;

  switch (action) {
    case 'getSchools':
      return getSchoolsAction();
    case 'addSchool':
      return addSchoolAction(data);
    case 'updateSchool':
      return updateSchoolAction(data);
    case 'deleteSchool':
      return deleteSchoolAction(data);
    case 'updateSchoolOrder':
      return updateSchoolOrderAction(data);
    case 'verifyPassword':
      return verifyPasswordAction(data);
    case 'getCanteenData':
      return getCanteenDataAction(schoolId);
    case 'initCanteenData':
      return initCanteenDataAction(schoolId);
    case 'addCanteen':
      return addCanteenAction(data, schoolId);
    case 'deleteCanteen':
      return deleteCanteenAction(data);
    case 'addShop':
      return addShopAction(data);
    case 'deleteShop':
      return deleteShopAction(data);
    case 'addFloor':
      return addFloorAction(data);
    case 'deleteFloor':
      return deleteFloorAction(data);
    case 'getStats':
      return getStatsAction();
    case 'incrementStats':
      return incrementStatsAction(schoolId);
    case 'getSchoolStats':
      return getSchoolStatsAction(schoolId);
    case 'getAllSchoolStats':
      return getAllSchoolStatsAction();
    case 'getAnnouncement':
      return getAnnouncementAction(schoolId);
    case 'setAnnouncement':
      return setAnnouncementAction(data, schoolId);
    case 'addToReputationShop':
      return addToReputationShopAction(data, schoolId);
    case 'getReputationStats':
      return getReputationStatsAction(schoolId);
    case 'getShopStats':
      return getShopStatsAction(event.shopKey, schoolId);
    case 'updateShopInfo':
      return updateShopInfoAction(data, schoolId);
    case 'getShopList':
      return getShopListAction(schoolId);
    case 'getAllShopStats':
      return getAllShopStatsAction(schoolId);
    case 'submitSuggestion':
      return submitSuggestionAction(data);
    case 'getSuggestions':
      return getSuggestionsAction();
    default:
      return { success: false, message: '未知操作' };
  }
}

async function getSchoolsAction() {
  await ensureBistuSchool();
  const schools = await prisma.school.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return { success: true, data: schools.map(toSchool) };
}

async function addSchoolAction(data) {
  const name = String(data.name || '').trim();
  const abbr = String(data.abbr || '').trim().toUpperCase();
  const password = String(data.password || '').trim();
  if (!name || !abbr || !password) return { success: false, message: '学校名称、简称和密码不能为空' };
  const exists = await prisma.school.findFirst({ where: { name } });
  if (exists) return { success: false, message: '学校名称已存在' };
  const school = await prisma.school.create({
    data: {
      name,
      abbr,
      admin: data.admin ? String(data.admin).trim() : '',
      passwordHash: await bcrypt.hash(password, 10)
    }
  });
  return { success: true, data: toSchool(school) };
}

async function updateSchoolAction(data) {
  const id = await resolveSchoolId(data.schoolId);
  if (!id) return { success: false, message: '学校不存在' };
  const update = {};
  if (data.name) update.name = String(data.name).trim();
  if (data.abbr) update.abbr = String(data.abbr).trim().toUpperCase();
  if (data.admin !== undefined) update.admin = String(data.admin).trim();
  if (data.password) update.passwordHash = await bcrypt.hash(String(data.password).trim(), 10);
  await prisma.school.update({ where: { id }, data: update });
  return { success: true };
}

async function deleteSchoolAction(data) {
  const id = await resolveSchoolId(data.schoolId);
  if (!id) return { success: false, message: '学校不存在' };
  await prisma.school.delete({ where: { id } });
  return { success: true };
}

async function updateSchoolOrderAction(data) {
  if (!Array.isArray(data.schoolOrders)) return { success: false, message: '参数错误' };
  for (const [index, externalId] of data.schoolOrders.entries()) {
    const id = await resolveSchoolId(externalId);
    if (id) await prisma.school.update({ where: { id }, data: { order: index + 1 } });
  }
  return { success: true };
}

async function verifyPasswordAction(data) {
  const login = await verifyAdminPassword(data.password);
  if (!login) return { success: false, message: '密码错误' };
  const session = await createAdminSession(login);
  if (login.role === 'MASTER') {
    return { success: true, data: { role: 'master', schoolId: BISTU_LEGACY_ID, schoolName: '北京信息科技大学', token: session.token } };
  }
  const school = await prisma.school.findUnique({ where: { id: login.schoolId } });
  return { success: true, data: { role: 'school', schoolId: school.legacyId || school.id, schoolName: school.name, token: session.token } };
}

async function getCanteenDataAction(externalSchoolId) {
  const school = externalSchoolId ? await resolveSchoolId(externalSchoolId) : await getDefaultSchoolId();
  if (!school) return { success: true, data: [] };
  const canteens = await prisma.canteen.findMany({
    where: { schoolId: school },
    include: { school: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
  });
  return { success: true, data: canteens.map(toCanteen) };
}

async function initCanteenDataAction(externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || (await ensureBistuSchool()).id;
  await ensureDefaultCanteens(schoolId);
  return { success: true };
}

async function addCanteenAction(data, externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const name = String(data.name || '').trim();
  if (!schoolId || !name) return { success: false, message: '食堂名称不能为空' };
  const count = await prisma.canteen.count({ where: { schoolId } });
  await prisma.canteen.create({ data: { schoolId, name, order: count + 1, floors: [] } });
  return { success: true };
}

async function deleteCanteenAction(data) {
  await prisma.canteen.delete({ where: { id: data.canteenId } });
  return { success: true };
}

async function addShopAction(data) {
  const canteen = await prisma.canteen.findUnique({ where: { id: data.canteenId } });
  if (!canteen) return { success: false, message: '食堂不存在' };
  const floors = normalizeFloors(canteen.floors).map((floor) => {
    if (floor.name !== data.floorName) return floor;
    if (!floor.shops.includes(data.shopName)) floor.shops.push(data.shopName);
    return floor;
  });
  await prisma.canteen.update({ where: { id: canteen.id }, data: { floors } });
  return { success: true };
}

async function deleteShopAction(data) {
  const canteen = await prisma.canteen.findUnique({ where: { id: data.canteenId } });
  if (!canteen) return { success: false, message: '食堂不存在' };
  const floors = normalizeFloors(canteen.floors).map((floor) => (
    floor.name === data.floorName
      ? { ...floor, shops: floor.shops.filter((shop) => shop !== data.shopName) }
      : floor
  ));
  await prisma.canteen.update({ where: { id: canteen.id }, data: { floors } });
  return { success: true };
}

async function addFloorAction(data) {
  const canteen = await prisma.canteen.findUnique({ where: { id: data.canteenId } });
  if (!canteen) return { success: false, message: '食堂不存在' };
  const floors = normalizeFloors(canteen.floors);
  if (!floors.some((floor) => floor.name === data.floorName)) floors.push({ name: data.floorName, shops: [] });
  await prisma.canteen.update({ where: { id: canteen.id }, data: { floors } });
  return { success: true };
}

async function deleteFloorAction(data) {
  const canteen = await prisma.canteen.findUnique({ where: { id: data.canteenId } });
  if (!canteen) return { success: false, message: '食堂不存在' };
  await prisma.canteen.update({
    where: { id: canteen.id },
    data: { floors: normalizeFloors(canteen.floors).filter((floor) => floor.name !== data.floorName) }
  });
  return { success: true };
}

async function getStatsAction() {
  return {
    success: true,
    data: {
      total: await getStat('global_total'),
      today: await getStat(`global_${today()}`)
    }
  };
}

async function incrementStatsAction(externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId);
  const day = today();
  await prisma.$transaction(async (tx) => {
    await incrementStat(tx, 'global_total');
    await incrementStat(tx, `global_${day}`, null, day);
    if (schoolId) {
      await incrementStat(tx, `school_${schoolId}_total`, schoolId);
      await incrementStat(tx, `school_${schoolId}_${day}`, schoolId, day);
    }
  });
  return getSchoolStatsAction(externalSchoolId);
}

async function getSchoolStatsAction(externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  return {
    success: true,
    data: {
      total: schoolId ? await getStat(`school_${schoolId}_total`) : 0,
      today: schoolId ? await getStat(`school_${schoolId}_${today()}`) : 0
    }
  };
}

async function getAllSchoolStatsAction() {
  const schools = await prisma.school.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  const rows = [];
  for (const school of schools) {
    rows.push({
      _id: school.legacyId || school.id,
      name: school.name,
      abbr: school.abbr,
      total: await getStat(`school_${school.id}_total`),
      today: await getStat(`school_${school.id}_${today()}`)
    });
  }
  return { success: true, data: { globalTotal: await getStat('global_total'), schools: rows } };
}

async function getAnnouncementAction(externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const announcement = await prisma.announcement.findFirst({ where: { schoolId, active: true }, orderBy: { updatedAt: 'desc' } });
  return { success: true, data: announcement?.content || '' };
}

async function setAnnouncementAction(data, externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  await prisma.announcement.updateMany({ where: { schoolId }, data: { active: false } });
  await prisma.announcement.create({ data: { schoolId, content: data.content || '', active: true } });
  return { success: true };
}

async function addToReputationShopAction(data, externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const shopName = String(data.shopName || '').trim();
  if (!shopName) return { success: false, message: '店铺名称不能为空' };
  await incrementStat(prisma, `reputation_${schoolId}_${shopName}`, schoolId);
  return getReputationStatsAction(externalSchoolId);
}

async function getReputationStatsAction(externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const rows = await prisma.usageStat.findMany({
    where: { scope: { startsWith: `reputation_${schoolId}_` } },
    orderBy: [{ count: 'desc' }, { updatedAt: 'desc' }],
    take: 30
  });
  const list = rows.map((row) => ({
    shopName: row.scope.replace(`reputation_${schoolId}_`, ''),
    count: row.count
  }));
  return { success: true, data: { count: list.length, list } };
}

function parseShopKey(shopKey) {
  const parts = String(shopKey || '').split('-');
  return {
    canteenName: parts[0] || '',
    floorName: parts[1] || '',
    shopName: parts.slice(2).join('-') || ''
  };
}

async function getShopStatsAction(shopKey, externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const { shopName } = parseShopKey(shopKey);
  const dish = await prisma.dish.findFirst({
    where: { schoolId, shopName },
    orderBy: { updatedAt: 'desc' }
  });
  return {
    success: true,
    data: dish ? {
      signature: dish.name,
      description: dish.description || '',
      tags: [],
      minPrice: '',
      maxPrice: '',
      openTime: '',
      closeTime: '',
      avgRating: dish.avgScore,
      ratingCount: dish.ratingCount
    } : null
  };
}

async function updateShopInfoAction(data, externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const parsed = parseShopKey(data.shopKey);
  const canteen = await prisma.canteen.findFirst({ where: { schoolId, name: parsed.canteenName } });
  const existing = await prisma.dish.findFirst({ where: { schoolId, shopName: parsed.shopName } });
  const payload = {
    schoolId,
    canteenId: canteen?.id || null,
    shopName: parsed.shopName,
    floorName: parsed.floorName,
    name: data.signature || parsed.shopName,
    description: data.description || '',
    status: DishStatus.ACTIVE
  };
  if (existing) {
    await prisma.dish.update({ where: { id: existing.id }, data: payload });
  } else {
    await prisma.dish.create({ data: payload });
  }
  return { success: true };
}

async function getShopListAction(externalSchoolId) {
  const result = await getCanteenDataAction(externalSchoolId);
  const list = [];
  for (const canteen of result.data || []) {
    for (const floor of canteen.floors || []) {
      for (const shop of floor.shops || []) {
        list.push({ canteen: canteen.name, floor: floor.name, shop });
      }
    }
  }
  return { success: true, data: list };
}

async function getAllShopStatsAction(externalSchoolId) {
  const schoolId = await resolveSchoolId(externalSchoolId) || await getDefaultSchoolId();
  const dishes = await prisma.dish.findMany({ where: { schoolId }, include: { category: true, school: true, canteen: true } });
  return { success: true, data: dishes.map(toDish) };
}

async function submitSuggestionAction(data) {
  const content = String(data.content || '').trim();
  if (!content) return { success: false, message: '建议内容不能为空' };
  await prisma.suggestion.create({
    data: {
      type: data.type || '建议',
      content,
      contact: data.contact ? String(data.contact).trim() : ''
    }
  });
  return { success: true };
}

async function getSuggestionsAction() {
  const suggestions = await prisma.suggestion.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return { success: true, data: suggestions.map((item) => ({ ...item, _id: item.id })) };
}

export async function buildApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(cors, { origin: config.corsOrigins });
  await app.register(multipart, { limits: { fileSize: config.maxImageBytes } });

  await fs.mkdir(config.uploadDir, { recursive: true }).catch(() => {});
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: `${config.uploadPublicPath}/`,
    decorateReply: false
  });
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/uploads/',
    decorateReply: false
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    request.log[statusCode >= 500 ? 'error' : 'warn'](error);
    reply.code(statusCode).send({
      success: false,
      message: statusCode >= 500 ? '服务器内部错误' : error.message
    });
  });

  app.get('/health', async () => ({ ok: true, service: 'dish-rank-server' }));

  await registerApiRoutes(app, '/api');
  await registerApiRoutes(app, '/dish-api');

  return app;
}
