import { registerEngine, roundRobinEngine, knockoutEngine, groupKnockoutEngine } from './tournament';
import { fun100IndividualEngine, fun100TeamEngine } from './tournament/fun-engines';
import { blindDoublesEngine } from './tournament/blind-doubles';
import { eloHandicapEngine } from './tournament/elo-handicap';
import { arenaEngine } from './tournament/arena';

export function initEngines() {
  registerEngine(roundRobinEngine);
  registerEngine(knockoutEngine);
  registerEngine(groupKnockoutEngine);
  registerEngine(fun100IndividualEngine);
  registerEngine(fun100TeamEngine);
  registerEngine(blindDoublesEngine);
  registerEngine(eloHandicapEngine);
  registerEngine(arenaEngine);
}
