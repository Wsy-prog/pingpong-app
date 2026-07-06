# 乒乓球约球比赛平台

> 技术栈：React 18 + TypeScript + Vite + Tailwind CSS + Supabase
> 在线地址：https://pingpong-app-eight.vercel.app
> 源码位置：~/pingpong-app/
> 文档存档：C:\001\（14个文件，1780行）
> 开发命令：cd ~/pingpong-app && npm run dev

## ⚡ 快速链接

| 用途 | 链接 |
|------|------|
| 网站 | https://pingpong-app-eight.vercel.app |
| GitHub 仓库 | https://github.com/Wsy-prog/pingpong-app |
| Supabase 管理 | https://supabase.com/dashboard → 项目 pingpong-app |
| Vercel 管理 | https://vercel.com/ustc-wsy/pingpong-app |

## 🚀 工作流（自动部署已配置）

```bash
cd ~/pingpong-app && npm run dev    # 开发
git add . && git commit -m "说明" && git push   # 推送到 GitHub → Vercel 自动部署
```

## 📋 系统概要

- **认证**: 自建用户名+密码系统（RPC 函数），存储在 profiles 表
- **数据库**: 10张表（profiles, matches, sets, tournaments, tournament_players, matchmaking_posts, matchmaking_responses, messages, elo_history, notifications）
- **RLS**: 已全部关闭
- **赛事引擎**: 策略模式 + 注册表，循环赛/淘汰赛/混合赛，可扩展
- **ELO**: 开球网算法，K=32，初始分1500
- **聊天**: 全局频道 + 私聊 + 实时推送 + 未读标记（三层）
- **通知**: 系统通知表 + 实时推送 + 角标

## 📄 页面（13个）

/login → / → /matches/new → /matches/:id → /tournaments/new
→ /tournaments/:id/setup → /tournaments/:id → /matchmaking
→ /rankings → /chat → /notifications → /profile/:id → /history

## 🔑 当前做过的修改记录

- 认证从 Magic Link 改为用户名密码
- 数据库从 profiles 关联 auth.users 改为独立 profiles 表
- 添加了通知系统（notifications 表）
- 聊天私聊添加了未读标记（三层：导航栏+私聊tab+用户列表）
- 约球添加了响应/接受/放弃功能
- 个人中心添加了修改密码
- 添加了"主页"导航按钮
- 全部 RLS 已关闭

## 📝 待完善功能

- [ ] 赛事通知推送
- [ ] 约球可附加场地信息
- [ ] 赛后评价系统
- [ ] 数据统计图表
- [ ] 微信小程序打包

## 备注

- .env 文件包含 Supabase 密钥，已加入 .gitignore，不会上传
- 密钥值存储在本地 ~/pingpong-app/.env 和 Vercel 环境变量中
- 所有外键约束已删除
- Realtime 已启用：messages 表 + notifications 表
