# Agent Instructions

- For all WeChat Mini Program work in this repository, first read and follow `/Users/mac/.codex/skills/weixin-miniprogram-dev/SKILL.md`.
- Keep the project native-mini-program first: update matching `.json`, `.wxml`, `.wxss`, and `.js` files together, and keep `miniprogram/app.json` routes synchronized.
- Do not commit machine-local WeChat DevTools state, secrets, AppSecret values, tokens, or generated dependency folders.
- Prefer WeChat native components and APIs over browser DOM/BOM assumptions. Use DevTools CLI verification when available.
