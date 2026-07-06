import { registerEngine, roundRobinEngine, knockoutEngine, groupKnockoutEngine } from './tournament';

export function initEngines() {
  registerEngine(roundRobinEngine);
  registerEngine(knockoutEngine);
  registerEngine(groupKnockoutEngine);
}
