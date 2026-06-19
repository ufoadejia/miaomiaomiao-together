# Project Handoff

## Context
- Workspace: `/Users/mac/miaomiaomiao-together`
- Fork remote: `origin https://github.com/tantan1hao/miaomiaomiao-together.git`
- Upstream remote: `upstream https://github.com/ufoadejia/miaomiaomiao-together.git`
- Source project was starred via GitHub API.
- Figma design file: https://www.figma.com/design/h2J2EiIgoweLj0kuDYHgY7

## Current User Direction
- Primary terminal/user target is the WeChat mini program/mobile viewport.
- Latest user direction changed: add a native WeChat mini program reading page with a paper/newspaper feel.
- The reading page should use native mini program files, `swiper` for basic page sliding, touch events and WXSS animation for enhanced paper-turn interaction, and Canvas where useful for paper shadow/curl effects.
- The user also asked to write the `/Users/mac/.codex/skills/weixin-miniprogram-dev` skill usage requirement into `agent.md`; this has been added.
- Mobile-first layout should be the source of truth; desktop can be a responsive enlargement.

## Current Local State
- Branch: `main`
- Uncommitted/untracked work:
  - `.gitignore`
  - `server/`
  - `web/`
  - `HANDOFF.md`
  - `miniprogram/utils/api.js`
  - `miniprogram/pages/dishes/`
  - `miniprogram/pages/newspaper/`
  - `agent.md`
- Existing `miniprogram/` page calls have been migrated away from `wx.cloud.callFunction` to `api.callFunction`.
- Existing `cloudfunctions/` remains as migration reference.

## Web Status
- Web app lives in `web/`.
- Main files:
  - `web/src/App.jsx`
  - `web/src/styles.css`
  - `web/src/api.js`
  - `web/vite.config.js`
- Vite base is `/dish/`.
- Correct dev URL: `http://127.0.0.1:5173/dish/`
- Do not open `web/index.html` with `file://`; Vite/React needs the dev server.
- `web/npm install` has been run.
- `npm run build` passes in `web/`.
- Current web UI has local fallback data, so it renders even if backend is not running.
- Current web UI has a mobile-focused breakpoint at `max-width: 720px` for the narrow Codex/in-app-browser preview.

## Backend Status
- Backend scaffold lives in `server/`.
- Stack: Fastify + Prisma + Postgres.
- Main files:
  - `server/src/app.js`
  - `server/src/index.js`
  - `server/src/ranking.js`
  - `server/prisma/schema.prisma`
  - `server/prisma/seed.js`
  - `server/.env.example`
- Intended listen address: `127.0.0.1:3002`.
- Intended public routes:
  - `/dish-api/health`
  - `/dish-api/auth/web`
  - `/dish-api/auth/wechat`
  - `/dish-api/dishes`
  - `/dish-api/ratings`
  - `/dish-api/rankings`
  - `/dish-api/admin/login`
  - `/dish-uploads/*`
- Backend dependencies have been installed in `server/`.
- Prisma Client has been generated with `npm run prisma:generate`.
- Server health routes were validated by starting with `UPLOAD_DIR=/tmp/dish-rank-uploads` and requesting:
  - `http://127.0.0.1:3002/dish-api/health`
  - `http://127.0.0.1:3002/health`
- Prisma migrations have not been generated yet.
- Database migration/seed has not been run; local Postgres availability was not confirmed.

## Important Product Requirements
- Keep original mini program concepts:
  - home page
  - school/canteen/shop hierarchy
  - random recommendation
  - popularity/ranking
  - admin pages
- Remove WeChat Cloud dependency.
- Mini program should call local/server APIs through a unified `miniprogram/utils/api.js`.
- New feature focus:
  - dish upload
  - dish rating
  - ranking
  - admin on/off shelf
  - announcements
  - categories
- Same backend should support web and mini program.
- Upload storage target: `/var/lib/dish-rank/uploads`, single image limit 5 MB.
- Nginx target paths:
  - `/dish/` for web
  - `/dish-api/` for API
  - `/dish-uploads/` for images

## Suggested Next Steps
1. Finish web polish in mobile viewport first, then desktop.
2. Install and validate backend:
   ```bash
   cd /Users/mac/miaomiaomiao-together/server
   cp .env.example .env
   npm run prisma:dev
   npm run prisma:seed
   npm run dev
   ```
3. Continue mini program polish:
   - visually test `pages/newspaper/index` in WeChat DevTools with service port enabled
   - adjust the newspaper content/data source if it should load real dish/ranking entries
   - visually test `pages/dishes/index` in WeChat DevTools
   - verify upload with an image under 5 MB against a migrated database
   - verify dish rating after `wx.login` token creation
4. Add admin on/off shelf UX to the mini program, or expose it from the existing admin pages.
5. Add README deployment section and Nginx example.
6. Commit only after reviewing generated files and keeping `node_modules/` out of git.

## Verification Already Done
- `web/npm install` completed.
- `web/npm run build` passed.
- `server/npm install` completed.
- `server/npm run prisma:generate` passed.
- `server/npm test` passed.
- `git diff --check` passed.
- Mini program JS syntax checks passed with `node --check`.
- `miniprogram/` no longer contains `wx.cloud` or the old cloud env id.
- WeChat DevTools CLI was found at `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`, but CLI login/open verification is blocked because DevTools service port is disabled in Security Settings.
- In-app browser page text verified at `http://127.0.0.1:5173/dish/`.

## Notes For Next Agent
- User explicitly rejected the earlier newspaper-like direction.
- Keep UI cards shallow; no nested cards.
- For mini program thinking, optimize for thumb use, short labels, tight vertical rhythm, and first-screen clarity.
- Preserve source attribution and licensing caution from original request.
