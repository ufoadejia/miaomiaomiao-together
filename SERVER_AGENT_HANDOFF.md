# Server Agent Handoff

## 目标

把 fork 仓库部署到生产服务器，先导入 upstream 原项目里的学校/食堂/楼层/店铺层级数据，再为正式上线写入首批可展示的菜品、分类、评分和公告数据。

生产层级导入命令必须先使用：

```bash
npm run prisma:import:upstream-hierarchy
```

正式上线前如果 `/dish-api/dishes` 和 `/dish-api/rankings` 仍为空，继续执行：

```bash
npm run prisma:seed:launch-data
```

不要把 `prisma:seed` 当成正式导入脚本；`prisma:seed` 仍是开发示例数据。正式首批数据使用 `prisma:seed:launch-data`，它会创建首批上架菜品、分类、种子评分和公告，让小程序首页不再只有模拟样张。

## 当前同步状态

- 同步源：`https://github.com/ufoadejia/miaomiaomiao-together`
- 已 fetch 的 upstream commit：`e76022bf4dc9df76903cdf379e8c2f9d2269b5fe` (`e76022b`)
- 上游默认层级位置：`cloudfunctions/canteenService/index.js` 的 `initCanteenData/defaultData`
- 本地导入源：`server/src/legacy-data.js`
- 已校验本地导入源与上游默认层级一致
- 当前层级数量：`canteens=2 floors=7 shops=42`
- 本机没有可用 Postgres：`127.0.0.1:5432` 连接失败，且未安装 `psql/postgres/docker`，所以实际数据库写入需要在服务器执行下面的导入命令

## 仓库信息

- Fork 仓库：`https://github.com/tantan1hao/miaomiaomiao-together.git`
- 部署目录建议：`/opt/miaomiaomiao-together`
- 后端目录：`/opt/miaomiaomiao-together/server`
- Web 构建目录：`/opt/miaomiaomiao-together/web/dist`
- API 监听地址：`127.0.0.1:3002`
- 上传目录：`/var/lib/dish-rank/uploads`

如果服务器拉不到最新文件，先确认本地这些改动已经 commit 并 push：

- `server/src/legacy-data.js`
- `server/prisma/import-upstream-hierarchy.js`
- `server/prisma/seed-launch-data.js`
- `server/src/load-env.js`
- `server/deploy/dish-rank-server.service.example`
- `server/deploy/nginx-dish.conf.example`
- `server/package.json`
- `server/.env.example`

## 生产环境变量

在服务器创建 `/opt/miaomiaomiao-together/server/.env`，至少包含：

```bash
DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/dish_rank?schema=public"
NODE_ENV="production"
HOST="127.0.0.1"
PORT="3002"
JWT_SECRET="replace-with-long-random-secret"
MASTER_PASSWORD="replace-master-admin-password"
BISTU_ADMIN_PASSWORD="replace-school-admin-password"
PUBLIC_BASE_URL="https://YOUR_DOMAIN"
CORS_ORIGINS="https://YOUR_DOMAIN"
UPLOAD_DIR="/var/lib/dish-rank/uploads"
UPLOAD_PUBLIC_PATH="/dish-uploads"
WECHAT_APPID="replace-wechat-appid"
WECHAT_SECRET="replace-wechat-secret"
```

注意：`JWT_SECRET` 建议至少 32 位随机字符串；`MASTER_PASSWORD`、`BISTU_ADMIN_PASSWORD`、`WECHAT_APPID`、`WECHAT_SECRET` 在 `NODE_ENV=production` 时都必须显式设置，不能使用 `.env.example` 里的占位值。导入脚本会拒绝使用默认学校管理员密码。

## 后台登录与密码交接

当前小程序端已经指向生产 API：

```text
https://tantanzhang.cn/dish-api
```

所以用户在小程序后台登录页输入密码时，请按生产服务器 `/opt/miaomiaomiao-together/server/.env` 和数据库里的真实配置排查，不要按本地开发默认值判断。

后台登录接口：

```http
POST /dish-api/admin/login
Content-Type: application/json

{"password":"后台密码"}
```

后端有两类后台密码：

- `MASTER_PASSWORD`：总后台密码，来自 `.env`，服务重启后生效。
- `BISTU_ADMIN_PASSWORD`：北信科/学校后台密码，导入脚本会写入数据库里的 `School.passwordHash`。如果学校记录已经存在，只改 `.env` 不会自动生效，必须重新运行 `npm run prisma:import:upstream-hierarchy` 或由服务器 agent 手动更新数据库哈希。

请不要把真实密码写进仓库、日志或聊天记录。服务器 agent 如果需要交接密码，优先直接在服务器上重置成新密码，然后只回传“已重置”和验证结果。

### 1. 先确认生产环境变量是否存在

```bash
cd /opt/miaomiaomiao-together/server
set -a
. ./.env
set +a

printf 'MASTER_PASSWORD set: %s\n' "${MASTER_PASSWORD:+yes}"
printf 'BISTU_ADMIN_PASSWORD set: %s\n' "${BISTU_ADMIN_PASSWORD:+yes}"
printf 'NODE_ENV=%s\n' "$NODE_ENV"
```

如果任意密码输出为空，先补齐 `.env`。生产环境不能使用 `000000`、`123456` 或 `replace-...` 这类默认/占位值。

### 2. 重置总后台密码

编辑：

```bash
/opt/miaomiaomiao-together/server/.env
```

设置：

```bash
MASTER_PASSWORD="新的强密码"
```

然后重启服务：

```bash
sudo systemctl restart dish-rank-server
```

验证：

```bash
curl -sS -X POST http://127.0.0.1:3002/dish-api/admin/login \
  -H 'content-type: application/json' \
  -d '{"password":"新的强密码"}'
```

期望返回包含：

```json
{"success":true,"data":{"token":"...","role":"MASTER"}}
```

### 3. 重置学校后台密码

编辑：

```bash
/opt/miaomiaomiao-together/server/.env
```

设置：

```bash
BISTU_ADMIN_PASSWORD="新的学校后台密码"
```

重新运行层级导入，让脚本把新密码哈希写入 `School.passwordHash`：

```bash
cd /opt/miaomiaomiao-together/server
npm run prisma:import:upstream-hierarchy
sudo systemctl restart dish-rank-server
```

验证：

```bash
curl -sS -X POST http://127.0.0.1:3002/dish-api/admin/login \
  -H 'content-type: application/json' \
  -d '{"password":"新的学校后台密码"}'
```

期望返回包含：

```json
{"success":true,"data":{"token":"...","role":"SCHOOL","schoolId":"bistu"}}
```

### 4. 用后台 token 验证管理接口

登录成功后，把返回的 `data.token` 放到请求头：

```bash
TOKEN="替换成登录返回的token"

curl -sS 'http://127.0.0.1:3002/dish-api/dishes?schoolId=bistu&includeOffline=1' \
  -H "authorization: Bearer $TOKEN"
```

如果 token 有效，管理口径应能看到 `PENDING`、`OFFLINE`、`REJECTED` 等非公开状态菜品；无 token 时只能看到公开 `ACTIVE` 菜品。

## 服务器执行步骤

### 1. 准备系统依赖

需要 Node.js、npm、Postgres、Nginx。示例：

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql nginx
```

确保 Node 版本能运行 ESM 和当前依赖。建议使用 Node 20 LTS。

### 2. 拉取仓库

```bash
sudo mkdir -p /opt
sudo chown "$USER":"$USER" /opt
git clone https://github.com/tantan1hao/miaomiaomiao-together.git /opt/miaomiaomiao-together
cd /opt/miaomiaomiao-together
git checkout main
git pull origin main
```

### 3. 准备目录和权限

```bash
sudo useradd --system --home /opt/miaomiaomiao-together --shell /usr/sbin/nologin dishrank || true
sudo mkdir -p /var/lib/dish-rank/uploads
sudo chown -R dishrank:dishrank /var/lib/dish-rank
```

### 4. 配置数据库

按服务器实际安全策略创建数据库和用户。示例：

```bash
sudo -u postgres psql
```

```sql
CREATE USER dish_rank WITH PASSWORD 'replace-db-password';
CREATE DATABASE dish_rank OWNER dish_rank;
\q
```

然后把对应连接串写入 `server/.env` 的 `DATABASE_URL`。

### 5. 安装后端并迁移

```bash
cd /opt/miaomiaomiao-together/server
npm ci
npm run prisma:generate
npm run prisma:migrate
```

如果这是已有生产库，迁移前先备份：

```bash
pg_dump "$DATABASE_URL" > "/tmp/dish_rank_$(date +%Y%m%d_%H%M%S).sql"
```

如果 shell 没有自动加载 `.env`，可先执行：

```bash
set -a
. /opt/miaomiaomiao-together/server/.env
set +a
```

### 6. 导入上游层级数据

```bash
cd /opt/miaomiaomiao-together/server
npm run prisma:import:upstream-hierarchy
```

期望输出包含：

```text
上游层级数据导入完成 school=bistu canteens=2 floors=7 shops=42 dishes=0
```

该脚本只 upsert：

- `School legacyId=bistu`
- 一食堂、二食堂
- 7 个楼层
- 42 个店铺，保存在 `Canteen.floors` JSON

该脚本不会创建：

- `Dish`
- `Rating`
- `Category`
- 上传图片
- 历史用户数据

### 7. 写入首批上线菜品数据

如果是正式上线，不要让公开榜单空着。层级导入成功后执行：

```bash
cd /opt/miaomiaomiao-together/server
npm run prisma:seed:launch-data
```

期望输出类似：

```text
首批上线菜品写入完成 school=bistu dishes=10 seededRatings=200
```

该脚本会 upsert：

- 盖饭、麻辣、粉面、热菜、小吃、饮品分类
- 10 个首批 `ACTIVE` 菜品
- 20 个种子读者账号及对应评分，用于生成非空动态榜单
- 1 条当前公告

脚本会根据 `Rating` 表重新计算每道菜的 `avgScore` 和 `ratingCount`，后续真实用户评分会继续通过接口动态更新榜单。

## systemd 接入

仓库模板：

```bash
/opt/miaomiaomiao-together/server/deploy/dish-rank-server.service.example
```

安装示例：

```bash
sudo cp /opt/miaomiaomiao-together/server/deploy/dish-rank-server.service.example /etc/systemd/system/dish-rank-server.service
sudo chown -R dishrank:dishrank /opt/miaomiaomiao-together/server
sudo systemctl daemon-reload
sudo systemctl enable dish-rank-server
sudo systemctl restart dish-rank-server
sudo systemctl status dish-rank-server --no-pager
```

看日志：

```bash
journalctl -u dish-rank-server -f
```

## Web 与 Nginx

构建 Web：

```bash
cd /opt/miaomiaomiao-together/web
npm ci
npm run build
```

仓库模板：

```bash
/opt/miaomiaomiao-together/server/deploy/nginx-dish.conf.example
```

把模板复制到 Nginx sites 配置后，替换 `server_name example.com`：

```bash
sudo cp /opt/miaomiaomiao-together/server/deploy/nginx-dish.conf.example /etc/nginx/sites-available/dish
sudo ln -sf /etc/nginx/sites-available/dish /etc/nginx/sites-enabled/dish
sudo nginx -t
sudo systemctl reload nginx
```

目标路径：

- `/dish/` -> Web 静态页面
- `/dish-api/` -> `http://127.0.0.1:3002/dish-api/`
- `/dish-uploads/` -> `/var/lib/dish-rank/uploads/`

## 验收命令

服务器本机验证：

```bash
curl http://127.0.0.1:3002/dish-api/health
curl http://127.0.0.1:3002/dish-api/schools
curl 'http://127.0.0.1:3002/dish-api/rankings?schoolId=bistu&limit=3'
curl -X POST http://127.0.0.1:3002/dish-api/miniprogram/call \
  -H 'content-type: application/json' \
  -d '{"action":"getCanteenData","schoolId":"bistu"}'
```

公网验证，把 `YOUR_DOMAIN` 换成实际域名：

```bash
curl https://YOUR_DOMAIN/dish-api/health
curl https://YOUR_DOMAIN/dish-api/schools
curl -I https://YOUR_DOMAIN/dish/
```

`getCanteenData` 返回的数据里应有：

- 一食堂：3 层
- 二食堂：4 层
- 总店铺数：42

正式上线口径下，`/dish-api/dishes` 和 `/dish-api/rankings` 不应该为空；为空说明还没有执行 `npm run prisma:seed:launch-data`，或后台没有上架任何菜品。

管理类写接口需要后台 token。旧兼容接口 `/dish-api/miniprogram/call` 的公开读动作仍可用，但学校管理、食堂结构修改、公告更新、建议列表、全校统计等动作必须带 `Authorization: Bearer <admin-token>`，否则应返回 401/403。

`/dish-api/dishes?includeOffline=1` 只有在请求头带有效后台 token 时才会返回 `PENDING`、`OFFLINE`、`REJECTED` 菜品；无 token 时会退回公开口径，只返回 `ACTIVE` 菜品。

## 常见问题

### 导入脚本提示缺少 BISTU_ADMIN_PASSWORD

编辑 `/opt/miaomiaomiao-together/server/.env`，设置真实的 `BISTU_ADMIN_PASSWORD`，不要使用占位值。

### Prisma 连接不上数据库

先确认：

```bash
cd /opt/miaomiaomiao-together/server
set -a
. ./.env
set +a
npx prisma db pull --print
```

如果这里失败，优先修 `DATABASE_URL`、Postgres 用户权限、防火墙或本机 socket/host 配置。

### systemd 启动失败

看日志：

```bash
journalctl -u dish-rank-server -n 100 --no-pager
```

重点检查：

- `/opt/miaomiaomiao-together/server/.env` 是否存在
- `DATABASE_URL` 是否可连接
- `/var/lib/dish-rank/uploads` 是否有权限
- `node` 和 `npm` 是否在 systemd 环境 PATH 中

### 小程序仍请求不到接口

确认小程序端 API Base 指向生产域名，并且微信小程序后台已配置合法 request/uploadFile 域名。后端路径应走：

```text
https://YOUR_DOMAIN/dish-api/
```

## 交付结果

服务器 agent 完成后请回传：

- 当前 git commit hash：`git rev-parse --short HEAD`
- `systemctl status dish-rank-server --no-pager` 摘要
- `curl /dish-api/health` 输出
- `getCanteenData` 的食堂、楼层、店铺数量
- `/dish-api/rankings?schoolId=bistu&limit=3` 的前三名摘要
- Nginx `nginx -t` 结果
