# 趣味赛事模块 — 方案一设计文档

> 日期：2026-07-14 | 状态：设计完成

---

## 1. 概述

在现有赛事框架（策略模式引擎 + 赛事生命周期）基础上，新增 3 个趣味赛制引擎。复用现有的 TournamentEngine 接口、赛事 CRUD、报名系统、比分登记和 ELO 结算，只扩展赛制层。

---

## 2. 新增三种赛制

### 2.1 🔢 ELO 让分赛 (`fun_elo_handicap`)

| 项目 | 规则 |
|------|------|
| 参赛人数 | 2 人（1v1） |
| 让分计算 | `Math.floor((高分ELO - 低分ELO) / 50)` |
| 让分上限 | 15 分 |
| 比赛目标 | 先得 21 分，且领先 ≥2 分 |
| 起始比分 | 低分者从 `让分数` 开始，高分者从 0 开始 |
| ELO 结算 | 胜 +16，负 -16（不受让分影响） |

**实现要点**:
- 创建赛事时读取双方当前 ELO，计算让分写入 config
- MatchDetailPage 比分板初始值设为让分数
- 胜利判定：score ≥ 21 且 score - opponent ≥ 2
- 让分数写入 `tournaments.config.handicap_score`

### 2.2 🎲 盲盒双打赛 (`fun_blind_doubles`)

| 项目 | 规则 |
|------|------|
| 参赛人数 | 4 的倍数，最少 4 人，最多 16 人 |
| 配对方式 | 随机抽签，每 2 人组成一队 |
| 赛制 | 4 队 → 淘汰赛；≥6 队 → 先小组循环后淘汰 |
| 比赛模式 | 双打（2v2），每场 3 局 2 胜 |
| ELO 结算 | 冠军搭档各 +20，亚军各 +10 |

**实现要点**:
- 报名满员后自动随机抽签配对
- 引擎内部委托给 `group-knockout` 或 `knockout` 引擎生成对阵
- 配对结果写入 `tournaments.config.teams: [{name, players: [id, id]}]`
- 比赛中的 `player1_name` / `player2_name` 用搭档组合名
- 双打 ELO 变动存入 `elo_history`，双方搭档各获相同 delta

### 2.3 👑 擂台挑战赛 (`fun_arena`)

| 项目 | 规则 |
|------|------|
| 参赛人数 | 3~8 人 |
| 守擂者 | 第 1 位报名者（管理员可在 Setup 页调整） |
| 挑战顺序 | 其余选手按 ELO 从低到高依次挑战 |
| 比赛模式 | 每场 3 局 2 胜 |
| 守擂规则 | 擂主胜 → 继续守擂；擂主败 → 挑战者成为新擂主 |
| 终点 | 所有挑战者挑战完毕，最终擂主为冠军 |
| 连胜加成 | 守擂方每连胜 1 场，下一挑战者 ELO 结算额外 +3 |
| ELO 结算 | 最终擂主 +25；每连胜 1 场额外 +5 |

**实现要点**:
- 引擎 `generateMatches` 按顺序生成挑战序列
- 每场必须按顺序完成：只有当前场完成后才能开始下一场
- MatchDetailPage 显示当前挑战进度（第 N/M 场挑战）
- `canProceed` 检查当前场是否完成
- `getNextRound` 返回下一场挑战（新擂主 vs 下一位挑战者）
- 挑战序列写入 `tournaments.config.challenge_order: [{challenger_id, order}]`

---

## 3. 类型扩展

```typescript
// TournamentFormat 新增
type TournamentFormat =
  | 'fun_100_individual' | 'fun_100_team'
  | 'fun_elo_handicap'    // 新增
  | 'fun_blind_doubles'   // 新增
  | 'fun_arena';          // 新增

// TournamentConfig 新增字段
interface TournamentConfig {
  // ...existing
  handicap_score?: number;       // ELO 让分赛的让分数
  teams?: {                      // 盲盒双打赛的队伍
    name: string;
    player_ids: string[];
  }[];
  challenge_order?: {            // 擂台赛的挑战顺序
    challenger_id: string;
    order: number;
  }[];
  arena_champion_id?: string;    // 当前擂主 ID
  arena_streak?: number;         // 当前连胜数
}
```

---

## 4. 涉及文件

### 新增
| 文件 | 说明 |
|------|------|
| `src/lib/tournament/elo-handicap.ts` | ELO 让分赛引擎 |
| `src/lib/tournament/blind-doubles.ts` | 盲盒双打赛引擎 |
| `src/lib/tournament/arena.ts` | 擂台挑战赛引擎 |

### 修改
| 文件 | 变更 |
|------|------|
| `src/lib/tournament/types.ts` | 新增 3 个 format 类型 + config 字段 |
| `src/lib/tournament/engine-init.ts` | 注册 3 个新引擎 |
| `src/lib/tournament/index.ts` | 导出新引擎 |
| `src/pages/TournamentCreatePage.tsx` | 趣味类别下新增 3 个赛制选项 + 规则弹窗 |
| `src/pages/TournamentSetupPage.tsx` | 盲盒配对 UI、擂台顺序调整 UI |
| `src/pages/TournamentDetailPage.tsx` | ELO 让分赛积分表、擂台进度展示、盲盒队伍展示 |
| `src/pages/MatchDetailPage.tsx` | ELO 让分赛起始比分设置、21 分制判定、擂台进度指示 |
| `src/types/index.ts` | 类型同步更新 |

---

## 5. 数据库

无需新增表。现有 `tournaments` 表的 `config` (JSONB) 字段承载所有赛制配置。

- `tournaments.format` CHECK 约束需追加 3 个新值
- 执行 SQL: `ALTER TABLE tournaments DROP CONSTRAINT ...; ALTER TABLE tournaments ADD CONSTRAINT ...;`

---

## 6. 不做什么

- ❌ 不新增数据库表
- ❌ 不新增页面路由
- ❌ 不修改 ELO 算法核心逻辑
- ❌ 不修改认证/通知/聊天系统
- ❌ 不在这一轮做赛季活动模式（留待后续）
