# 乒乓球约球比赛平台

> 技术栈：React 18 + TypeScript + Vite + Tailwind CSS + Supabase
> 在线地址：https://pingpong-app-eight.vercel.app
> 源码位置：~/pingpong-app/
> 文档存档：C:\001\（17个文件，2795行）
> 开发命令：cd ~/pingpong-app && npm run dev

## ⚡ 快速链接

| 用途 | 链接 |
|------|------|
| 网站 | https://pingpong-app-eight.vercel.app |
| GitHub 仓库 | https://github.com/Wsy-prog/pingpong-app |
| Supabase 管理 | https://supabase.com/dashboard → 项目 pingpong-app |
| Vercel 管理 | https://vercel.com/ustc-wsy/pingpong-app |
| 本地开发 | http://localhost:3000 |

## 🚀 工作流（自动部署已配置）

```bash
cd ~/pingpong-app && npm run dev    # 开发
git add . && git commit -m "说明" && git push   # 推送 → 自动部署
```

## 📋 系统概要

- **认证**: 自建用户名+密码系统（RPC 函数），存储在 profiles 表
- **数据库**: 16张表（profiles, matches, sets, tournaments, tournament_players, matchmaking_posts, matchmaking_responses, messages, elo_history, notifications, chat_cleanup_config, fortune_items, user_fortunes, health_checkins, health_weekly_scores, announcements, news_flashes, flash_config）
- **RLS**: 已全部关闭
- **赛事引擎**: 策略模式 + 注册表，循环赛/淘汰赛/混合赛，可扩展
- **ELO**: 开球网算法，K=32，初始分1500
- **聊天**: 全局频道 + 私聊 + 实时推送 + 三层未读标记
- **通知**: 系统通知表 + 实时推送 + 角标
- **管理员**: guanliyuan / 541666，管理后台 6 个标签页
- **今日运势**: fortune_items 表，每日抽签，支持唯一性
- **健康打卡**: health_checkins + health_weekly_scores，每日打卡 + 周评估
- **健康排名**: RankingsPage 第二个 Tab，基于 health_weekly_scores
- **乒协资讯**: announcements 表，管理员发布，支持过期自动删除
- **新闻快报**: news_flashes 表，全员可发，上限可配，点赞用 JSONB
  
## 📄 页面（16个）

/login → / → /matches/new → /matches/:id → /tournaments/new
→ /tournaments/:id/setup → /tournaments/:id → /matchmaking
→ /rankings → /chat → /notifications → /profile/:id → /history → /admin → /health

## 🔑 已完成的修改记录

- 认证从 Magic Link 改为用户名密码
- 数据库从 profiles 关联 auth.users 改为独立 profiles 表
- 添加了通知系统（notifications 表）
- 聊天私聊添加了未读标记（三层）
- 约球添加了响应/接受/放弃/通知功能
- 个人中心添加了修改密码
- 添加了管理员角色 + 用户管理后台
- 添加了聊天自动清理 + 手动清理
- 添加了一键清理过期约球
- 全部 RLS 已关闭
- GitHub 自动部署已配置
- 添加了今日运势系统（fortune_items + user_fortunes + draw_daily_fortune RPC）
- 添加了健康打卡系统（health_checkins + health_weekly_scores + calculate_weekly_health RPC）
- 添加了健康排名（RankingsPage 第二 Tab）
- 添加了健康周报导出（本周 + 上周）
- 大厅"最近比赛"改为"乒协资讯"（announcements 表，管理员发布）
- 添加了新闻快报（news_flashes，全员可发，上限可配，点赞支持）
- 管理后台新增 6 个标签页（用户/聊天/约球/运势/资讯/快报设置）

## 📝 待完善功能

- [ ] 完善管理员功能（系统统计、公告管理等）
- [ ] 接入国内 CDN 或迁移服务器改善国内访问速度

## 备注

- .env 文件包含 Supabase 密钥，已加入 .gitignore
- 密钥值存储在本地 ~/pingpong-app/.env 和 Vercel 环境变量中
- 所有外键约束已删除
- Realtime 已启用：messages 表 + notifications 表
