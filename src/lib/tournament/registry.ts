import type { TournamentEngine, TournamentFormat } from './types';

const registry = new Map<TournamentFormat, TournamentEngine>();

export function registerEngine(engine: TournamentEngine) {
  registry.set(engine.type, engine);
}

export function getEngine(type: TournamentFormat): TournamentEngine {
  const engine = registry.get(type);
  if (!engine) throw new Error(`未知赛制: ${type}`);
  return engine;
}

export function listEngines(): { type: TournamentFormat; name: string }[] {
  return Array.from(registry.values()).map(e => ({ type: e.type, name: e.name }));
}

export function hasEngine(type: string): boolean {
  return registry.has(type as TournamentFormat);
}
