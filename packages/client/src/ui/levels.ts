import type { GameOptions } from "../game/setup.ts";

export interface Level {
  id: string;
  name: string;
  blurb: string;
  options: GameOptions;
}

export const LEVELS: Level[] = [
  {
    id: "practice",
    name: "Practice",
    blurb: "30×30 · 5 min · light wind, sparse fires",
    options: { size: 30, roundLengthSec: 300, windSpeed: 0.3, outbreakDensity: 4, seed: 101, mapSeed: 11 },
  },
  {
    id: "standard",
    name: "Standard",
    blurb: "44×44 · 10 min · shifting wind",
    options: { size: 44, roundLengthSec: 600, windSpeed: 0.45, outbreakDensity: 5.5, seed: 202, mapSeed: 22 },
  },
  {
    id: "inferno",
    name: "Inferno",
    blurb: "50×50 · 10 min · high wind, dense outbreaks",
    options: { size: 50, roundLengthSec: 600, windSpeed: 0.7, outbreakDensity: 9, seed: 303, mapSeed: 33 },
  },
];
