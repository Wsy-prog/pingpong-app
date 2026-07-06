# 乒乓球约球比赛平台

> 技术栈：React 18 + TypeScript + Vite + Tailwind CSS + Supabase
> 部署地址：https://pingpong-app-eight.vercel.app
> 文档目录：C:\001\ 或查看 /c/001/
> 开发服务器：cd ~/pingpong-app && npm run dev

## 项目结构

```
~/pingpong-app/
├── src/
│   ├── components/     # 可复用组件
│   │   ├── common/     # ProtectedRoute, PublicRoute
│   │   └── layout/     # Header, MainLayout
│   ├── pages/          # 12 个页面
│   ├── hooks/          # useAuth (AuthContext)
│   ├── lib/
│   │   ├── supabase.ts # Supabase 客户端
│   │   ├── elo.ts      # ELO 积分算法
│   │   ├── engine-init.ts
│   │   └── tournament/ # 赛事引擎（策略模式）
│   │       ├── types.ts
│   │       ├── registry.ts
│   │       ├── round-robin.ts
│   │       ├── knockout.ts
│   │       └── group-knockout.ts
│   └── types/          # TypeScript 类型
├── supabase-setup.sql  # 建表脚本
├── supabase-rpc.sql    # 存储过程
└── .env                # Supabase 密钥（勿上传）
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 (localhost:3000) |
| `npm run build` | 生产构建 |
| `npx vercel --prod` | 部署到生产环境 |

## 部署

- Vercel 项目：`pingpong-app` (ustc-wsy)
- 环境变量需要在 Vercel Dashboard 设置：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Supabase

- 项目：pingpong-app（ap-northeast-1 东京）
- 9 张表 + RLS + Auth (Magic Link) + Realtime
- SQL 脚本：`supabase-setup.sql`

## 新增赛制

1. 在 `src/lib/tournament/` 下新建文件
2. 实现 `TournamentEngine` 接口
3. 在 `engine-init.ts` 中注册
4. 前端表单自动读取注册表

## 备注

`npm run dev` 启动开发服务器后，用浏览器打开 `http://localhost:3000` 即可。
首次访问需要输入邮箱登录（Magic Link）。
