import { registerEngine, roundRobinEngine, knockoutEngine, groupKnockoutEngine } from './tournament';
import { fun100IndividualEngine, fun100TeamEngine } from './tournament/fun-engines';

export function initEngines() {
  registerEngine(roundRobinEngine);
  registerEngine(knockoutEngine);
  registerEngine(groupKnockoutEngine);
  registerEngine(fun100IndividualEngine);
  registerEngine(fun100TeamEngine);
}
