# 家庭点菜（PWA / Vue）

这是一个 **离线优先 + 家庭互通** 的家庭点菜系统工程骨架：
- **PWA**：断网也能打开（Service Worker 缓存页面壳）
- **本地存储**：IndexedDB（离线可用）
- **家庭互通**：Supabase（免费层）Auth + Postgres + Storage
- **同步骨架**：`oplog` 增量同步（联网自动补传）

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 配置环境变量（在 Cloudflare Pages 也要填同样的）

复制 `env.example` 的内容到你自己的环境变量中：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. 启动

```bash
npm run dev
```

## 部署（免费推荐：Cloudflare Pages）
- 连接 GitHub 仓库
- Build command：`npm run build`
- Output：`dist`
- Environment Variables：填 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## PWA 图标说明
当前项目已使用 `public/pwa-192.png`、`public/pwa-512.png` 和 `public/apple-touch-icon.png` 作为主屏幕图标资源。

# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).
