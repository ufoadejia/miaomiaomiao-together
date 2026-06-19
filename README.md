# 今天吃什么

<div align="center">

一个帮助解决"今天吃什么"选择困难症的微信小程序

[![微信小程序](https://img.shields.io/badge/平台-微信小程序-green.svg)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![后端](https://img.shields.io/badge/后端-Fastify%20%2B%20Prisma-blue.svg)](./server)

</div>

## 项目简介

"今天吃什么"是一个微信小程序应用，旨在帮助高校学生解决每天面对食堂众多选择时的困扰。当前 fork 已迁移为微信小程序原生前端 + Fastify/Prisma/Postgres 后端，主界面采用纸质小报阅读版式，支持随机推荐、菜品投稿、评分榜单和学校后台管理。

### 核心功能

- 随机抽取 - 智能随机选择食堂、楼层和店铺，避免选择困难
- 多学校支持 - 支持多个学校独立使用，数据互不干扰
- 人气榜单 - 根据真实评分动态展示最受欢迎的菜品
- 菜品投稿 - 用户登录后可上传菜品和图片，后台审核后上架
- 公告系统 - 学校管理员可发布实时公告
- 菜品评分 - 用户登录后可对菜品评分，榜单实时更新
- 权限管理 - 支持超级管理员和学校管理员分级管理

## 功能展示

### 主要功能

1. **随机抽取**
   - 支持选择特定食堂或全部食堂
   - 智能权重算法，避免重复选择
   - 抽取结果支持一键复制分享

2. **学校切换**
   - 快速切换不同学校
   - 搜索学校功能
   - 记录最近使用的学校

3. **人气榜单**
   - 展示用户选择最多的店铺
   - 激励视频广告展示（可选）

4. **管理后台**
   - 学校管理员：管理本校食堂、楼层、店铺数据
   - 超级管理员：管理所有学校和全局配置

## 技术栈

- **前端**：微信小程序原生框架
- **后端**：Fastify + Prisma + Postgres
  - `/dish-api/` 统一接口
  - `/dish-uploads/` 图片静态访问
  - 兼容原小程序食堂层级数据
- **UI组件**：原生组件 + 自定义组件

## 项目结构

```
miaomiaomiao-together/
├── miniprogram/              # 微信小程序原生前端
│   ├── pages/newspaper/      # 纸质小报首页、投稿、榜单、随机推荐
│   ├── pages/auth/register/  # 微信身份/个人资料
│   ├── pages/admin/          # 学校后台
│   ├── utils/api.js          # 统一后端 API 调用
│   ├── app.js
│   ├── app.json
│   └── app.wxss
├── server/                   # Fastify + Prisma + Postgres 后端
├── web/                      # Web 辅助展示
├── cloudfunctions/           # 原项目迁移参考，不再作为运行后端
├── project.config.json
└── README.md
```

## 数据库设计

### 主要数据表

| 表名 | 说明 |
|--------|------|
| `School` | 学校信息与学校管理员密码哈希 |
| `Canteen` | 食堂信息，`floors` JSON 保存楼层和窗口 |
| `Dish` | 菜品、图片、上架状态、聚合评分 |
| `Rating` | 用户对菜品的评分 |
| `Category` | 菜品分类 |
| `Announcement` | 学校公告 |

## 快速开始

### 前置要求

- 已注册微信小程序账号
- 可用的 Fastify/Postgres 后端服务
- 安装微信开发者工具

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/what-to-eat-today.git
   cd what-to-eat-today
   ```

2. **导入项目**
   - 打开微信开发者工具
   - 选择"导入项目"
   - 选择项目目录
   - 填入你的 AppID

3. **配置生产后端**
   - 后端默认域名为 `https://tantanzhang.cn/dish-api`
   - 生产 `.env` 需要配置数据库、JWT、后台密码、微信 AppID/Secret
   - 微信小程序后台需要配置合法 request/upload/download 域名

4. **初始化数据库**
   - 先运行 `npm run prisma:import:upstream-hierarchy` 导入学校/食堂/楼层/窗口
   - 正式上线再运行 `npm run prisma:seed:launch-data` 写入首批菜品、评分和公告

## 新后端生产部署与上游层级导入

当前 fork 已加入 Fastify + Prisma + Postgres 后端。生产环境首次部署时，先导入上游仓库的学校/食堂/楼层/店铺层级，再写入首批上线菜品数据，避免小程序公开榜单为空。

```bash
git clone https://github.com/tantan1hao/miaomiaomiao-together.git /opt/miaomiaomiao-together
cd /opt/miaomiaomiao-together/server
npm ci
cp .env.example .env
# 编辑 .env：DATABASE_URL、JWT_SECRET、MASTER_PASSWORD、BISTU_ADMIN_PASSWORD、PUBLIC_BASE_URL、WECHAT_APPID、WECHAT_SECRET
npm run prisma:generate
npm run prisma:migrate
npm run prisma:import:upstream-hierarchy
npm run prisma:seed:launch-data
npm start
```

上游层级导入脚本会 upsert `legacyId=bistu` 的学校，以及一食堂/二食堂的完整楼层和店铺 JSON；上线数据脚本会创建首批上架菜品、分类、评分和公告。导入完成后可用以下接口验证：

```bash
curl http://127.0.0.1:3002/dish-api/health
curl http://127.0.0.1:3002/dish-api/schools
curl 'http://127.0.0.1:3002/dish-api/rankings?schoolId=bistu&limit=3'
curl -X POST http://127.0.0.1:3002/dish-api/miniprogram/call \
  -H 'content-type: application/json' \
  -d '{"action":"getCanteenData","schoolId":"bistu"}'
```

建议用 `systemd` 托管后端进程，并由 Nginx 代理 `/dish-api/` 到 `127.0.0.1:3002`，代理 `/dish-uploads/` 到 `/var/lib/dish-rank/uploads`。模板见 `server/deploy/dish-rank-server.service.example` 和 `server/deploy/nginx-dish.conf.example`。

### 配置说明

在 `project.config.json` 中确认小程序 AppID；生产接口地址在 `miniprogram/app.js` 中配置：

```json
{
  "appid": "你的小程序AppID"
}
```

```js
globalData: {
  apiBaseUrl: 'https://tantanzhang.cn/dish-api'
}
```

## 使用说明

### 普通用户

1. 打开小程序进入小报首页
2. 上下滑动切换版面
3. 查看今日头条、风味榜和随机推荐
4. 设置个人资料后可投稿和评分

### 管理员

1. 在小报标题“明天吃什么日报”处连续点击6次
2. 输入管理员密码
3. 进入管理后台进行数据管理

## 自定义配置

### 添加新学校

通过超级管理员后台添加新学校：

1. 学校名称
2. 英文简称
3. 管理员密码
4. 管理员名称

### 管理食堂数据

学校管理员可进行以下操作：

- 添加/删除食堂
- 添加/删除楼层
- 添加/删除店铺
- 发布学校公告

## 统计功能

- **全局统计**：所有学校总使用次数
- **学校统计**：各学校独立统计
- **今日统计**：当天使用次数
- **人气榜单**：店铺被选择次数排行

## 安全说明

- 管理员密码只保存在服务器环境变量和数据库哈希中，前端无法直接访问
- 用户评分需登录后才能进行
- 敏感操作均在服务器接口中鉴权完成

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 更新日志

### v1.0.0
- 初始版本发布
- 支持随机抽取功能
- 支持多学校管理
- 支持人气榜单
- 支持公告系统

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 作者

**西风漂流**

## 致谢

- 感谢微信小程序团队提供的开发平台
- 感谢所有为这个项目提供建议的用户

## 联系方式

如有问题或建议，欢迎通过以下方式联系：

- 提交 [Issue](https://github.com/your-username/what-to-eat-today/issues)
- 小程序内"建议反馈"页面

---

<div align="center">

如果这个项目对你有帮助，请给一个 Star 支持一下！

Made with love by 西风漂流

</div>
