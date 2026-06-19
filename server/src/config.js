import path from 'node:path';
import './load-env.js';

const isProduction = process.env.NODE_ENV === 'production';

function parseCorsOrigins(value) {
  if (!value) return isProduction ? false : true;
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export const config = {
  isProduction,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3002),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  masterPassword: process.env.MASTER_PASSWORD || '000000',
  bistuAdminPassword: process.env.BISTU_ADMIN_PASSWORD || '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3002',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || '/var/lib/dish-rank/uploads'),
  uploadPublicPath: process.env.UPLOAD_PUBLIC_PATH || '/dish-uploads',
  maxImageBytes: 5 * 1024 * 1024,
  wechatAppId: process.env.WECHAT_APPID || '',
  wechatSecret: process.env.WECHAT_SECRET || ''
};

function productionConfigError(keys) {
  return new Error(`生产环境缺少安全配置：${keys.join(', ')}`);
}

if (config.isProduction) {
  const missing = [];
  if (!config.jwtSecret || config.jwtSecret === 'dev-only-change-me' || config.jwtSecret === 'change-this-in-production' || config.jwtSecret.length < 32) {
    missing.push('JWT_SECRET');
  }
  if (!config.masterPassword || config.masterPassword === '000000' || config.masterPassword === 'change-this-master-password') {
    missing.push('MASTER_PASSWORD');
  }
  if (!config.bistuAdminPassword || config.bistuAdminPassword === '123456' || config.bistuAdminPassword === 'change-this-school-admin-password') {
    missing.push('BISTU_ADMIN_PASSWORD');
  }
  if (!config.publicBaseUrl || !config.publicBaseUrl.startsWith('https://')) {
    missing.push('PUBLIC_BASE_URL');
  }
  if (!config.wechatAppId || !config.wechatSecret) {
    missing.push('WECHAT_APPID/WECHAT_SECRET');
  }
  if (missing.length) throw productionConfigError(missing);
}
