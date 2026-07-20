# 乒乓球约球比赛平台

> 技术栈：React 18 + TypeScript + Vite + Tailwind CSS + Supabase
> 在线地址：https://pingpong-app-eight.vercel.app
> 源码位置：~/pingpong-app/
> 文档存档：E:\乒乓网站\001\（20+个文件，含 GUIDE.md 协作开发指南）
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
- **数据库**: 18张表（profiles, matches, sets, tournaments, tournament_players, matchmaking_posts, matchmaking_responses, messages, elo_history, notifications, chat_cleanup_config, fortune_items, user_fortunes, health_checkins, health_weekly_scores, announcements, news_flashes, flash_config）
- **RLS**: 已全部关闭
- **赛事引擎**: 策略模式 + 注册表，循环赛/淘汰赛/混合赛，可扩展
- **ELO**: 开球网算法，K=32，初始分1500
- **聊天**: 全局频道 + 私聊 + 实时推送 + 三层未读标记 + 消息撤回
- **通知**: 系统通知表 + 实时推送 + 角标
- **管理员**: guanliyuan / 541666，管理后台 6 个标签页
- **今日运势**: fortune_items 表，每日抽签，支持唯一性，时区修正
- **健康打卡**: health_checkins + health_weekly_scores，每日打卡 + 周评估，时区修正
- **健康排名**: RankingsPage 第二个 Tab，基于 health_weekly_scores
- **乒协资讯**: announcements 表，管理员发布，支持过期自动删除
- **新闻快报**: news_flashes 表，全员可发，上限可配，点赞用 JSONB
- **赛事中心**: 三菜单（创建/我的/全部），报名/取消报名，分区排序
- **自由约球**: 双视图 + 6分区 + 颜色边框 + 结束时间
- **个人主页**: 个人宣言 + 球拍配置 + 胜率统计

## 📄 页面（20个）

/login → / → /matches/new → /matches/:id → /tournaments/new
→ /tournaments → /tournaments/:id/setup → /tournaments/:id
→ /matchmaking → /rankings → /chat → /notifications
→ /profile/:id → /history → /admin → /health → /utility
→ /prediction → /prediction/:id → /coins → /rewards

## 🔑 已完成的修改记录

### 第一次迭代
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
- 添加了今日运势系统
- 添加了健康打卡系统
- 添加了健康排名（RankingsPage 第二 Tab）
- 添加了健康周报导出（本周 + 上周）
- 大厅"最近比赛"改为"乒协资讯"
- 添加了新闻快报（全员可发，上限可配，点赞支持）
- 管理后台新增 6 个标签页

### 第二次迭代（2026-07-08）
- 赛事中心全面重构（三菜单/报名取消/展开收起/排序）
- 自由约球双视图（所有约球/我的约球+6分区+颜色边框）
- 约球结束时间 + 时区修正
- 约球发布者删除帖子 + 管理员一键清理所有约球
- 聊天消息撤回（2分钟/管理员可撤）
- 新闻快报发布者可删除
- 个人主页：个人宣言/球拍配置/胜率/最近10场胜率
- 健康打卡时区修正/连续天数重写/时长评分修复
- 主页删除"创建比赛"，改为"赛事中心"
- 创建赛事返回确认弹窗 + 开始时间
- 不可取消时显示提示文字

## 📝 待完善功能

- [ ] 完善管理员功能（系统统计、公告管理等）
- [ ] 接入国内 CDN 或迁移服务器改善国内访问速度
- [ ] 健康打卡自动评估定时任务

## 备注

- .env 文件包含 Supabase 密钥，已加入 .gitignore
- 密钥值存储在本地 ~/pingpong-app/.env 和 Vercel 环境变量中
- 所有外键约束已删除
- Realtime 已启用：messages 表 + notifications 表
- RPC 函数共12个：register_user, login_user, change_password, settle_match_elo, admin_delete_user, cleanup_messages, cleanup_all_messages, cleanup_old_matchmaking, cleanup_all_matchmaking, draw_daily_fortune, calculate_weekly_health
