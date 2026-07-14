# 趣味赛事模块 — 方案一实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增3个趣味赛制引擎（ELO让分赛、盲盒双打赛、擂台挑战赛），扩展现有赛事框架。

**Architecture:** 遵循现有策略模式 + 注册表架构。每个赛制实现 `TournamentEngine` 接口，在 `engine-init.ts` 注册。UI 层复用现有创建/设置/详情/比分页面，按 `format` 分发差异化逻辑。

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Supabase

## Global Constraints

- 不新增数据库表，所有配置存入 `tournaments.config` (JSONB)
- 不新增页面路由，复用现有 4 个赛事页面
- 不修改 ELO 算法核心（`elo.ts`），只调整结算调用时的 K 值参数
- 不修改认证/通知/聊天系统
- `tournaments.format` CHECK 约束需追加 3 个新值

---

### Task 1: 扩展类型定义

**Files:**
- Modify: `src/lib/tournament/types.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `TournamentFormat` 新增3个值；`TournamentConfig` 新增4个可选字段；`Tournament` 接口同步更新

- [ ] **Step 1: 更新 tournament types.ts 的 TournamentFormat 联合类型**

`src/lib/tournament/types.ts`:
```typescript
export type TournamentFormat =
  | 'single_match'
  | 'round_robin'
  | 'knockout'
  | 'group_knockout'
  | 'custom_score'
  | 'fun_100_individual'
  | 'fun_100_team'
  | 'fun_elo_handicap'
  | 'fun_blind_doubles'
  | 'fun_arena';
```

- [ ] **Step 2: 在 TournamentConfig 接口中新增可选字段**

`src/lib/tournament/types.ts`，在 `TournamentConfig` 接口末尾新增：
```typescript
export interface TournamentConfig {
  sets_to_win: number;
  points_per_win?: number;
  points_per_draw?: number;
  third_place_match?: boolean;
  groups?: number;
  advance_per_group?: number;
  // 新增 —— 趣味赛事配置
  target_score?: number;              // 百分制目标分（已有，显式声明）
  handicap_score?: number;            // ELO让分赛：低分者领先分数
  handicap_player_id?: string;        // ELO让分赛：获得让分的选手ID
  teams?: { name: string; player_ids: string[] }[];  // 盲盒双打赛：随机配对结果
  challenge_order?: { challenger_name: string; order: number }[];  // 擂台赛：挑战顺序
  arena_champion_name?: string;       // 擂台赛：当前擂主
  arena_streak?: number;              // 擂台赛：连胜数
  mode?: string;                      // 模式标记（如 'team_relay'）
  team1?: any;                        // 百分团体赛队伍1（已有）
  team2?: any;                        // 百分团体赛队伍2（已有）
  stages?: any[];                     // 团体赛阶段（已有）
  current_stage?: number;             // 团体赛当前阶段（已有）
}
```

- [ ] **Step 3: 更新 src/types/index.ts 的 Tournament.format 类型**

```typescript
format: 'single_match' | 'round_robin' | 'knockout' | 'group_knockout' | 'custom_score' | 'fun_100_individual' | 'fun_100_team' | 'fun_elo_handicap' | 'fun_blind_doubles' | 'fun_arena'
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误

---

### Task 2: ELO 让分赛引擎

**Files:**
- Create: `src/lib/tournament/elo-handicap.ts`

**Interfaces:**
- Consumes: `TournamentEngine`, `Player`, `GeneratedMatch`, `Standing`, `ValidationResult` from `./types`
- Produces: `eloHandicapEngine: TournamentEngine`

- [ ] **Step 1: 创建 ELO让分赛引擎文件**

`src/lib/tournament/elo-handicap.ts`:
```typescript
import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * ELO 让分赛引擎
 * 2人参赛，ELO高者让低者分数（每50分让1分，上限15分）
 * 低分者从让分数开始计分，先得21分且领先≥2分者胜
 */
export const eloHandicapEngine: TournamentEngine = {
  type: 'fun_elo_handicap',
  name: 'ELO让分赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount !== 2) errors.push('ELO让分赛需要恰好2名选手');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // 只生成1场决胜赛
    return [{
      player1_name: players[0].name,
      player2_name: players[1].name,
    }];
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();
    for (const m of matches) {
      for (const name of [m.player1_name, m.player2_name]) {
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            player_name: name, wins: 0, losses: 0, draws: 0,
            points: 0, sets_won: 0, sets_lost: 0,
          });
        }
      }
      if (m.winner_name) {
        const winner = playerMap.get(m.winner_name);
        if (winner) { winner.wins++; winner.points = 1; }
        const loserName = m.winner_name === m.player1_name ? m.player2_name : m.player1_name;
        const loser = playerMap.get(loserName);
        if (loser) loser.losses++;
      }
    }
    return Array.from(playerMap.values()).sort((a, b) => b.points - a.points);
  },
};
```

- [ ] **Step 2: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误

---

### Task 3: 盲盒双打赛引擎

**Files:**
- Create: `src/lib/tournament/blind-doubles.ts`

**Interfaces:**
- Consumes: `TournamentEngine`, `Player`, `GeneratedMatch`, `Standing`, `ValidationResult` from `./types`；`knockoutEngine`、`groupKnockoutEngine` 用于委托对阵生成
- Produces: `blindDoublesEngine: TournamentEngine`

- [ ] **Step 1: 创建盲盒双打赛引擎文件**

`src/lib/tournament/blind-doubles.ts`:
```typescript
import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';
import { knockoutEngine } from './knockout';
import { groupKnockoutEngine } from './group-knockout';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 盲盒双打赛引擎
 * 4的倍数参赛（4~16人），随机配对组队
 * 4队→淘汰赛，≥6队→先小组后淘汰
 */
export const blindDoublesEngine: TournamentEngine = {
  type: 'fun_blind_doubles',
  name: '盲盒双打赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 4) errors.push('盲盒双打赛至少需要4名选手');
    if (playerCount > 16) errors.push('盲盒双打赛最多16名选手');
    if (playerCount % 4 !== 0) errors.push('盲盒双打赛人数必须是4的倍数');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // 随机配对成2人一队
    const shuffled = shuffle(players);
    const teamCount = shuffled.length / 2;
    const teams: { name: string; player_ids: string[] }[] = [];

    for (let i = 0; i < teamCount; i++) {
      const p1 = shuffled[i * 2];
      const p2 = shuffled[i * 2 + 1];
      teams.push({
        name: `${p1.name}/${p2.name}`,
        player_ids: [p1.id, p2.id],
      });
    }

    // 写入 teams 到 config（调用者负责持久化）
    (config as any).teams = teams;

    // 将队伍转为伪 Player 供委托引擎使用
    const teamPlayers: Player[] = teams.map((t, i) => ({
      id: `team_${i}`,
      name: t.name,
      seed: i + 1,
    }));

    // 根据队伍数委托给不同引擎
    if (teamCount === 2) {
      // 2队直接决赛
      return [{
        player1_name: teamPlayers[0].name,
        player2_name: teamPlayers[1].name,
      }];
    } else if (teamCount === 4) {
      return knockoutEngine.generateMatches(teamPlayers, config);
    } else {
      // ≥6队 → 小组+淘汰
      const groupConfig = { ...config, groups: Math.ceil(teamCount / 3), advance_per_group: 2, sets_to_win: config.sets_to_win || 3 };
      return groupKnockoutEngine.generateMatches(teamPlayers, groupConfig);
    }
  },

  calculateStandings(matches, config): Standing[] {
    if ((config as any).groups) {
      return groupKnockoutEngine.calculateStandings(matches, config);
    }
    return knockoutEngine.calculateStandings(matches, config);
  },

  canProceed(tournament): boolean {
    const teamCount = tournament.players?.length ? Math.floor(tournament.players.length / 2) : 0;
    if (teamCount <= 2) return false;
    if (teamCount === 4) return knockoutEngine.canProceed!(tournament);
    return groupKnockoutEngine.canProceed!(tournament);
  },

  getNextRound(tournament): GeneratedMatch[] {
    const teamCount = tournament.players?.length ? Math.floor(tournament.players.length / 2) : 0;
    if (teamCount <= 2) return [];
    if (teamCount === 4) return knockoutEngine.getNextRound!(tournament);
    return groupKnockoutEngine.getNextRound!(tournament);
  },
};
```

- [ ] **Step 2: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误

---

### Task 4: 擂台挑战赛引擎

**Files:**
- Create: `src/lib/tournament/arena.ts`

**Interfaces:**
- Consumes: `TournamentEngine`, `Player`, `GeneratedMatch`, `Standing`, `ValidationResult` from `./types`
- Produces: `arenaEngine: TournamentEngine`

- [ ] **Step 1: 创建擂台挑战赛引擎文件**

`src/lib/tournament/arena.ts`:
```typescript
import type { TournamentEngine, Player, GeneratedMatch, Standing, ValidationResult } from './types';

/**
 * 擂台挑战赛引擎
 * 3~8人参赛，第1位报名者为擂主
 * 挑战者按ELO从低到高依次上场，胜者成为新擂主
 * 全部挑战完毕后的最终擂主为冠军
 */
export const arenaEngine: TournamentEngine = {
  type: 'fun_arena',
  name: '擂台挑战赛',

  validate(_config, playerCount): ValidationResult {
    const errors: string[] = [];
    if (playerCount < 3) errors.push('擂台挑战赛至少需要3名选手');
    if (playerCount > 8) errors.push('擂台挑战赛最多8名选手');
    return { valid: errors.length === 0, errors };
  },

  generateMatches(players: Player[], config): GeneratedMatch[] {
    // 第1位报名者为初始擂主
    const champion = players[0];
    // 其余选手为挑战者
    const challengers = players.slice(1);

    // 写入挑战顺序到 config（调用者负责持久化）
    (config as any).challenge_order = challengers.map((c, i) => ({
      challenger_name: c.name,
      order: i + 1,
    }));
    (config as any).arena_champion_name = champion.name;
    (config as any).arena_streak = 0;

    // 只生成第一场：擂主 vs 第1位挑战者
    if (challengers.length === 0) return [];
    return [{
      player1_name: champion.name,
      player2_name: challengers[0].name,
    }];
  },

  calculateStandings(matches, _config): Standing[] {
    const playerMap = new Map<string, Standing>();
    const completed = matches.filter(m => m.status === 'completed' || (m as any).winner_name);
    for (const m of completed) {
      for (const name of [m.player1_name, m.player2_name]) {
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            player_name: name, wins: 0, losses: 0, draws: 0,
            points: 0, sets_won: 0, sets_lost: 0,
          });
        }
      }
      if (m.winner_name) {
        const winner = playerMap.get(m.winner_name);
        if (winner) { winner.wins++; winner.points = 1; }
        const loserName = m.winner_name === m.player1_name ? m.player2_name : m.player1_name;
        const loser = playerMap.get(loserName);
        if (loser) loser.losses++;
      }
    }
    // 最终擂主（最后一场的胜者）排第一，其他按胜场排
    return Array.from(playerMap.values()).sort((a, b) => b.points - a.points || b.wins - a.wins);
  },

  canProceed(tournament): boolean {
    const { matches, config } = tournament;
    const order: { challenger_name: string; order: number }[] = (config as any).challenge_order || [];
    if (order.length === 0) return false;

    // 所有挑战者是否都已上场
    const lastMatch = matches[matches.length - 1];
    if (!lastMatch) return false;

    // 最后一场必须完成
    if (lastMatch.status !== 'completed') return false;

    // 还有未上场的挑战者？
    const currentChallengerCount = matches.length;
    return currentChallengerCount < order.length;
  },

  getNextRound(tournament): GeneratedMatch[] {
    const { matches, config } = tournament;
    if (!this.canProceed!(tournament)) return [];

    const lastMatch = matches[matches.length - 1];
    const champion = lastMatch.winner_name || lastMatch.player1_name;
    const order: { challenger_name: string; order: number }[] = (config as any).challenge_order || [];
    const nextIndex = matches.length; // 0-based，当前已完成场数 = 下一挑战者索引
    const nextChallenger = order[nextIndex];

    if (!nextChallenger) return [];

    return [{
      player1_name: champion,
      player2_name: nextChallenger.challenger_name,
    }];
  },
};
```

- [ ] **Step 2: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误

---

### Task 5: 引擎注册和导出

**Files:**
- Modify: `src/lib/tournament/index.ts`
- Modify: `src/lib/engine-init.ts`

**Interfaces:**
- Consumes: 3个新引擎的 export
- Produces: 无新接口，仅注册

- [ ] **Step 1: 在 index.ts 导出新引擎**

`src/lib/tournament/index.ts`，在现有 export 后追加：
```typescript
export { eloHandicapEngine } from './elo-handicap';
export { blindDoublesEngine } from './blind-doubles';
export { arenaEngine } from './arena';
```

- [ ] **Step 2: 在 engine-init.ts 注册新引擎**

`src/lib/engine-init.ts`:
```typescript
import { registerEngine, roundRobinEngine, knockoutEngine, groupKnockoutEngine } from './tournament';
import { fun100IndividualEngine, fun100TeamEngine } from './tournament/fun-engines';
import { eloHandicapEngine, blindDoublesEngine, arenaEngine } from './tournament';

export function initEngines() {
  registerEngine(roundRobinEngine);
  registerEngine(knockoutEngine);
  registerEngine(groupKnockoutEngine);
  registerEngine(fun100IndividualEngine);
  registerEngine(fun100TeamEngine);
  registerEngine(eloHandicapEngine);
  registerEngine(blindDoublesEngine);
  registerEngine(arenaEngine);
}
```

- [ ] **Step 3: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误

---

### Task 6: 创建赛事页面 — 趣味赛制 UI

**Files:**
- Modify: `src/pages/TournamentCreatePage.tsx`

**Interfaces:**
- Consumes: `listEngines()` 返回列表中已包含新引擎
- Produces: 3个新赛制选项 + 各自的规则弹窗

- [ ] **Step 1: 更新趣味类别的参赛人数逻辑**

`src/pages/TournamentCreatePage.tsx` 中 `createHandleSubmit` 的 `minP` 计算：
```typescript
const minP = category === 'singles' ? 2
  : category === 'doubles' ? 4
  : category === 'fun' ? (
    format === 'fun_100_individual' ? 2
    : format === 'fun_100_team' ? 10
    : format === 'fun_elo_handicap' ? 2
    : format === 'fun_blind_doubles' ? 4
    : format === 'fun_arena' ? 3
    : 2
  )
  : 6;
```

- [ ] **Step 2: 更新 config 的创建逻辑**

在 `handleSubmit` 中：
```typescript
const config: Record<string, unknown> = category === 'fun'
  ? (format === 'fun_elo_handicap'
      ? { target_score: 21, handicap_score: 0 }
      : format === 'fun_blind_doubles'
      ? { sets_to_win: setsToWin }
      : format === 'fun_arena'
      ? { sets_to_win: setsToWin }
      : { target_score: 100 })
  : { sets_to_win: setsToWin };
```

- [ ] **Step 3: 更新趣味类别的每场胜局数显示**

在趣味类别下，根据 format 显示不同文案：
```tsx
{category === 'fun' ? (
  <div className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 text-sm">
    {format === 'fun_elo_handicap' ? '21分制（领先2分胜）'
      : format === 'fun_blind_doubles' ? '三局两胜'
      : format === 'fun_arena' ? '三局两胜'
      : '百分制（先得100分胜）'}
  </div>
) : (
  // ...existing selects
)}
```

- [ ] **Step 4: 更新趣味类别切换时的默认人数**

在类别按钮的 `onClick` 中（点击"趣味"时）：
```tsx
onClick={() => { setCategory('fun'); setMaxPlayersStr('2'); setFormat('fun_elo_handicap') }}
```

- [ ] **Step 5: 赛制切换时更新人数和 disabled 状态**

在赛制按钮 `onClick` 中，趣味赛制需要根据 format 设置人数：
```tsx
onClick={() => {
  setFormat(e.type);
  if (category === 'fun') {
    if (e.type === 'fun_elo_handicap') setMaxPlayersStr('2');
    else if (e.type === 'fun_blind_doubles') setMaxPlayersStr('4');
    else if (e.type === 'fun_arena') setMaxPlayersStr('3');
  }
}}
```

参赛人数 input 的 `disabled`、`min`、`max` 也需要适配盲盒双打和擂台赛：让分赛 disabled（固定2人），盲盒不disabled（4的倍数可调），擂台赛不disabled（3-8可调）。

- [ ] **Step 6: 新增3个规则弹窗**

在现有 `showRules` 状态基础上，扩展支持 `'individual' | 'team' | 'elo_handicap' | 'blind_doubles' | 'arena'` 类型，在赛制按钮的 `?` 点击中传入对应类型。在弹窗 JSX 中新增3个规则内容块：

```tsx
{showRules === 'elo_handicap' && (
  <>
    <h2 className="text-lg font-bold mb-4">🔢 ELO让分赛 — 规则</h2>
    <div className="space-y-3 text-sm text-gray-700">
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>参赛人数</strong>：2人</li>
        <li><strong>让分规则</strong>：ELO高者让低者，每50分差让1分，最多让15分</li>
        <li><strong>起始比分</strong>：低分者从让分数开始，高分者从0开始</li>
        <li><strong>获胜条件</strong>：<span className="text-orange-600 font-bold">先得21分且领先≥2分者胜</span></li>
        <li><strong>ELO结算</strong>：胜方+16，负方-16（不受让分影响）</li>
      </ul>
    </div>
  </>
)}

{showRules === 'blind_doubles' && (
  <>
    <h2 className="text-lg font-bold mb-4">🎲 盲盒双打赛 — 规则</h2>
    <div className="space-y-3 text-sm text-gray-700">
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>参赛人数</strong>：4的倍数，最少4人，最多16人</li>
        <li><strong>配对方式</strong>：<span className="text-orange-600 font-bold">随机抽签</span>，每2人组成一队搭档</li>
        <li><strong>赛制</strong>：4队→淘汰赛；≥6队→先小组循环后淘汰</li>
        <li><strong>比赛模式</strong>：双打（2v2），每场3局2胜</li>
        <li><strong>ELO结算</strong>：冠军搭档各+20，亚军各+10</li>
      </ul>
    </div>
  </>
)}

{showRules === 'arena' && (
  <>
    <h2 className="text-lg font-bold mb-4">👑 擂台挑战赛 — 规则</h2>
    <div className="space-y-3 text-sm text-gray-700">
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>参赛人数</strong>：3~8人</li>
        <li><strong>守擂者</strong>：第1位报名者为初始擂主</li>
        <li><strong>挑战顺序</strong>：其余选手按ELO从低到高依次上场</li>
        <li><strong>守擂规则</strong>：擂主胜→继续守擂；擂主败→挑战者成为新擂主</li>
        <li><strong>比赛终点</strong>：<span className="text-orange-600 font-bold">全部挑战完毕，最终擂主为冠军</span></li>
        <li><strong>ELO结算</strong>：最终擂主+25；每连胜1场额外+5</li>
      </ul>
    </div>
  </>
)}
```

- [ ] **Step 7: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -30`
Expected: 无新增类型错误

---

### Task 7: 赛事设置页面 — 适配新赛制

**Files:**
- Modify: `src/pages/TournamentSetupPage.tsx`

**Interfaces:**
- Consumes: `getEngine()` 返回新引擎
- Produces: `generateMatches()` 处理新赛制的 bypass 逻辑

- [ ] **Step 1: 更新最低人数判断**

在 `generateMatches()` 函数中：
```typescript
const minPlayers = tournament.category === 'singles' ? 2
  : tournament.category === 'doubles' ? 4
  : tournament.category === 'fun' ? (
    tournament.format === 'fun_100_individual' ? 2
    : tournament.format === 'fun_100_team' ? 10
    : tournament.format === 'fun_elo_handicap' ? 2
    : tournament.format === 'fun_blind_doubles' ? 4
    : tournament.format === 'fun_arena' ? 3
    : 2
  )
  : 6;
```

- [ ] **Step 2: 新增趣味赛制的 bypass 处理**

在 `if (players.length === minPlayers)` 块中，`category === 'fun'` 的 else 分支新增3种赛制处理：

```typescript
} else if (tournament.category === 'fun') {
  if (tournament.format === 'fun_100_individual') {
    // ...existing...
  } else if (tournament.format === 'fun_elo_handicap') {
    p1Name = players[0].name;
    p2Name = players[1].name;
    extraConfig = { target_score: 21 };
  } else if (tournament.format === 'fun_blind_doubles') {
    // 随机配对
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const team1Name = `${shuffled[0].name}/${shuffled[1].name}`;
    const team2Name = `${shuffled[2].name}/${shuffled[3].name}`;
    p1Name = team1Name;
    p2Name = team2Name;
    extraConfig = {
      sets_to_win: 3,
      teams: [
        { name: team1Name, player_ids: [shuffled[0].id, shuffled[1].id] },
        { name: team2Name, player_ids: [shuffled[2].id, shuffled[3].id] },
      ],
    };
  } else if (tournament.format === 'fun_arena') {
    const champion = players[0];
    const challengers = players.slice(1);
    p1Name = champion.name;
    p2Name = challengers[0]?.name || '(待定)';
    extraConfig = {
      sets_to_win: 3,
      arena_champion_name: champion.name,
      arena_streak: 0,
      challenge_order: challengers.map((c, i) => ({ challenger_name: c.name, order: i + 1 })),
    };
  }
}
```

- [ ] **Step 3: 趣味赛制选手列表标题文案更新**

```typescript
const playerListTitle = isFun
  ? (tournament.format === 'fun_100_team' ? '队员列表（每队5人）'
    : tournament.format === 'fun_elo_handicap' ? '参赛选手（2人）'
    : tournament.format === 'fun_blind_doubles' ? '参赛选手（4的倍数）'
    : tournament.format === 'fun_arena' ? '参赛选手（3~8人，第1位为初始擂主）'
    : '参赛选手')
  : ...
```

- [ ] **Step 4: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -30`
Expected: 无新增类型错误

---

### Task 8: 比赛详情页面 — 适配趣味赛制

**Files:**
- Modify: `src/pages/MatchDetailPage.tsx`

**Interfaces:**
- Consumes: `tournamentConfig` 包含新字段
- Produces: ELO让分赛的21分制判定、起始让分显示；擂台赛的挑战进度

- [ ] **Step 1: 扩展 isFunMode 判定，新增赛制专属变量**

```typescript
const isFunMode = !!tournamentConfig?.target_score;
const isFunHandicap = tournamentConfig?.target_score === 21 && !!tournamentConfig?.handicap_score !== undefined;
const isFunArena = tournamentConfig?.arena_champion_name !== undefined;
const isTeamFun = isFunMode && tournamentConfig?.mode === 'team_relay';
const targetScore: number = tournamentConfig?.target_score || 100;

// ELO让分赛：让分信息
const handicapScore: number = tournamentConfig?.handicap_score || 0;
const handicapPlayerId: string = tournamentConfig?.handicap_player_id || '';
```

- [ ] **Step 2: 在比分展示区显示让分信息**

在比分板两方名字下方，如果有让分，显示起始优势：
```tsx
{isFunHandicap && handicapScore > 0 && (
  <div className="px-4 py-1 bg-yellow-50 border-t text-xs text-center text-yellow-700">
    ⚡ 让分：{handicapPlayerId === match?.player1_id ? match?.player1_name : match?.player2_name} 从 {handicapScore} 分开始
  </div>
)}
```

- [ ] **Step 3: 擂台赛进度显示**

在比分板下方，如果有擂台赛配置，显示挑战进度：
```tsx
{isFunArena && tournamentConfig?.challenge_order && (
  <div className="px-4 py-2 bg-purple-50 border-t text-xs text-center">
    👑 当前擂主：<strong>{tournamentConfig.arena_champion_name}</strong>
    {' '}| 连胜：{tournamentConfig.arena_streak || 0}场
    {' '}| 挑战进度：{
      (match?.tournament_id
        ? `已完成 ${(tournamentConfig.challenge_order as any[]).filter((c: any) => {
          // 从已完成的比赛推断进度
          return c.order <= (tournamentConfig.arena_streak || 0) + (tournamentConfig.arena_champion_name === match?.player1_name ? 0 : 1);
        }).length} / ${(tournamentConfig.challenge_order as any[]).length} 场`
        : `0 / ${(tournamentConfig.challenge_order as any[]).length} 场`
    )}
  </div>
)}
```

- [ ] **Step 4: 21分制判定（已在 getWinner 中通过 targetScore=21 自然支持，但需加入领先≥2的逻辑）**

修改 `getWinner()` 中百分制分支：
```typescript
if (isFunMode) {
  if (p1 >= targetScore && p1 - p2 >= 2) return 'player1';
  if (p2 >= targetScore && p2 - p1 >= 2) return 'player2';
  return null;
}
```

- [ ] **Step 5: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -30`
Expected: 无新增类型错误

---

### Task 9: 赛事详情页面 — 适配新赛制

**Files:**
- Modify: `src/pages/TournamentDetailPage.tsx`

**Interfaces:**
- Consumes: `getEngine()` 返回新引擎
- Produces: 擂台赛冠军判定、盲盒双打队伍显示、"下一场"按钮（擂台赛晋级）

- [ ] **Step 1: 冠军判定逻辑新增擂台赛**

在 `champion` 计算中追加：
```typescript
if (t.format === 'fun_arena') {
  if (t.status !== 'completed') return null;
  const completedMatches = matches.filter(m => m.status === 'completed');
  if (completedMatches.length === 0) return null;
  const lastMatch = completedMatches[completedMatches.length - 1];
  return lastMatch.winner_name || null;
}
```

- [ ] **Step 2: 擂台赛专用视图**

在 detail 页面，如果 `tournament.format === 'fun_arena'`，在积分表区域显示擂台赛专用视图而非通用积分表：

```tsx
{tournament.format === 'fun_arena' && (
  <ArenaView
    matches={matches}
    config={tournament.config as any}
    players={players}
  />
)}
```

在文件底部新增 `ArenaView` 组件（或放在页面内联）：
```tsx
function ArenaView({ matches, config, players }: {
  matches: Match[];
  config: any;
  players: EnginePlayer[];
}) {
  const challengeOrder: { challenger_name: string; order: number }[] = config.challenge_order || [];
  const champion = config.arena_champion_name || players[0]?.name;
  const completedCount = matches.filter(m => m.status === 'completed').length;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <h3 className="font-medium">👑 擂台挑战赛</h3>
      <div className="bg-purple-50 rounded-lg p-3 text-center">
        <p className="text-xs text-purple-500">当前擂主</p>
        <p className="text-lg font-bold text-purple-800">{champion}</p>
        <p className="text-xs text-purple-600">
          连胜 {config.arena_streak || 0} 场 | 挑战进度 {completedCount}/{challengeOrder.length}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium">挑战顺序：</p>
        {challengeOrder.map((c, i) => {
          const match = matches[i];
          const isCompleted = match?.status === 'completed';
          return (
            <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              isCompleted ? 'bg-gray-50' : i === completedCount ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 opacity-50'
            }`}>
              <span>
                <span className="text-gray-400 mr-2">#{c.order}</span>
                {c.challenger_name}
              </span>
              {isCompleted && (
                <span className={match.winner_name === c.challenger_name ? 'text-green-600 font-medium' : 'text-red-400'}>
                  {match.winner_name === c.challenger_name ? '挑战成功🏆' : '挑战失败'}
                </span>
              )}
              {!isCompleted && i === completedCount && (
                <span className="text-yellow-600 text-xs">即将上场</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 盲盒双打队伍展示**

当 `tournament.format === 'fun_blind_doubles'` 且有 `config.teams` 时：
```tsx
{tournament.format === 'fun_blind_doubles' && config.teams && (
  <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
    <h3 className="font-medium">🎲 随机配对结果</h3>
    {(config.teams as any[]).map((team, i) => (
      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
        <span className="text-blue-400 font-medium">#{i + 1}</span>
        <span className="font-medium text-blue-700">{team.name}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: "生成下一轮" 按钮 — 擂台赛**

擂台赛需要晋级按钮（调用 `engine.getNextRound` 生成下一场挑战赛），在现有淘汰赛晋级按钮区域添加对 `fun_arena` 的判定：

```tsx
{(tournament.format === 'knockout' || tournament.format === 'group_knockout' || tournament.format === 'fun_arena')
  && engine.canProceed!({ matches: matches as any, config: tournament.config as any, players } as any) && (
  <button onClick={async () => {
    const next = engine.getNextRound!({ matches: matches as any, config: tournament.config as any, players } as any);
    if (next.length === 0) return;
    // 更新 config 中的 arena champion 为上一场胜者
    const lastMatch = matches.filter(m => m.status === 'completed').slice(-1)[0];
    if (lastMatch && tournament.format === 'fun_arena') {
      const newChampion = lastMatch.winner_name;
      const currentStreak = (tournament.config as any).arena_streak || 0;
      const newStreak = newChampion === (tournament.config as any).arena_champion_name ? currentStreak + 1 : 0;
      await supabase.from('tournaments').update({
        config: { ...tournament.config, arena_champion_name: newChampion, arena_streak: newStreak }
      }).eq('id', id);
    }
    const inserts = next.map(m => ({
      tournament_id: id,
      title: `${m.player1_name} vs ${m.player2_name}`,
      player1_name: m.player1_name,
      player2_name: m.player2_name,
      created_by: currentUser!.id,
    }));
    await supabase.from('matches').insert(inserts);
    loadTournament();
  }}
    className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700">
    生成下一场挑战赛
  </button>
)}
```

- [ ] **Step 5: 验证编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1 | head -40`
Expected: 无新增类型错误

---

### Task 10: 数据库迁移 + ELO 参数适配 + 端到端验证

**Files:**
- Create: `supabase-fun-new-formats.sql`
- Modify: `src/lib/elo.ts` (通过 settleMatchElo 参数间接适配)

**Interfaces:**
- Consumes: Supabase SQL Editor
- Produces: 更新数据库 CHECK 约束；ELO结算支持自定义参数

- [ ] **Step 1: 创建数据库迁移 SQL**

`supabase-fun-new-formats.sql`:
```sql
-- 新增3个趣味赛制到 tournaments.format CHECK 约束
-- 在 Supabase SQL Editor 中执行：
-- https://supabase.com/dashboard → 项目 pingpong-app → SQL Editor

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN (
    'single_match', 'round_robin', 'knockout', 'group_knockout', 'custom_score',
    'fun_100_individual', 'fun_100_team',
    'fun_elo_handicap', 'fun_blind_doubles', 'fun_arena'
  ));
```

- [ ] **Step 2: 在 Supabase SQL Editor 执行迁移**

提醒用户执行或通过 supabase CLI 执行。验证：
```sql
-- 测试新增format可插入
INSERT INTO tournaments (name, format, category, config, created_by)
VALUES ('test_elo', 'fun_elo_handicap', 'fun', '{}', (SELECT id FROM profiles LIMIT 1));
-- 预期成功，然后删除测试数据
DELETE FROM tournaments WHERE name = 'test_elo';
```

- [ ] **Step 3: ELO 结算适配**

在 `MatchDetailPage.tsx` 中，新增趣味赛制的 ELO 结算按钮逻辑（针对不同赛制调整结算参数）：

新增辅助函数：
```typescript
function getEloParams(format: string | undefined, config: any): { kFactor?: number } {
  if (format === 'fun_elo_handicap') return { kFactor: 16 };  // 让分赛K折半
  if (format === 'fun_blind_doubles') return { kFactor: 20 };  // 双打冠军K
  if (format === 'fun_arena') return { kFactor: 25 };          // 擂台赛K
  return {};
}
```

注意：当前 `settleMatchElo` 使用硬编码 K=32。趣味赛制需要不同 K 值，需要调整方法。保持简单——在调用 `settleMatchElo` 前修改 `calculateElo` 的 K 值通过参数传入。

由于 `elo.ts` 的 K_FACTOR 是常量，最快方案是让 `settleMatchElo` 和 `calculateElo` 接受可选 `kFactor` 参数：

`src/lib/elo.ts` 修改：
```typescript
export function calculateElo(
  ra: number, rb: number, winner: 'player1' | 'player2',
  kFactor: number = K_FACTOR
): { newRa: number; newRb: number; deltaA: number; deltaB: number } {
  const ea = expectedScore(ra, rb);
  const eb = expectedScore(rb, ra);
  const sa = winner === 'player1' ? 1 : 0;
  const sb = winner === 'player2' ? 1 : 0;
  const newRa = Math.round(ra + kFactor * (sa - ea));
  const newRb = Math.round(rb + kFactor * (sb - eb));
  return { newRa, newRb, deltaA: newRa - ra, deltaB: newRb - rb };
}

export async function settleMatchElo(
  supabase: any, matchId: string,
  player1Id: string, player2Id: string,
  winner: 'player1' | 'player2',
  kFactor: number = K_FACTOR
) {
  // ...同前，调用 calculateElo 时传入 kFactor
  const result = calculateElo(p1.elo_score, p2.elo_score, winner, kFactor);
  // ...
}
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd E:\乒乓网站\pingpong-app && npx tsc --noEmit 2>&1`
Expected: 无错误

- [ ] **Step 5: 启动开发服务器端到端测试**

Run: `cd E:\乒乓网站\pingpong-app && npm run dev`
然后浏览器访问 `http://localhost:3000`，测试流程：
1. 登录 → 赛事中心 → 创建赛事 → 选择"趣味"类别
2. 应该看到 5 个趣味赛制（百分个人/百分团体/ELO让分/盲盒双打/擂台）
3. 每个赛制的 `?` 按钮弹出对应规则
4. 创建 ELO让分赛 → 添加2个选手 → 生成赛程 → 进入详情
5. 登记比分 → 验证21分制判定
6. 创建盲盒双打赛 → 添加4个选手 → 生成赛程 → 验证随机配对
7. 创建擂台赛 → 添加3个选手 → 生成赛程 → 第1场挑战 → 晋级 → 第2场挑战
