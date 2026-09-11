// Shared fixtures for the SportScoreboardCard test files (index.core / index.slide /
// index.layout / index.blink). Importing "../src/index.js" registers the custom element.
import { vi } from "vitest";
import "../src/index.js";
import type { SportScoreboardCard } from "../src/index.js";
import type { GameAttr, HassStates, HomeAssistant } from "../src/types.js";

export type SubscribeCallback = (event: { data: { entity_id: string } }) => void;
export const getCallback = (fn: ReturnType<typeof vi.fn>): SubscribeCallback =>
  (fn.mock.calls as [[SubscribeCallback]])[0][0];

export const makeHass = (states: HassStates = {}): HomeAssistant =>
  ({ states }) as unknown as HomeAssistant;
export const makeState = (state: string, attrs: GameAttr = {}) => ({ state, attributes: attrs });

export const baseAttrs: GameAttr = {
  team_homeaway: "home",
  team_name: "Lakers",
  opponent_name: "Celtics",
  team_record: "20-10",
  opponent_record: "18-12",
  team_score: "95",
  opponent_score: "90",
  team_winner: true,
  opponent_winner: false,
  team_logo: "https://cdn.example.com/lal.png",
  opponent_logo: "https://cdn.example.com/bos.png",
  season: "regular",
};

export const nbaSection = {
  name: "NBA",
  prefix: "sensor.nba_",
  limit: 10,
  special_teams: [] as string[],
  rank_type: "win-loss" as const,
  view: "standings" as const,
};

export function makeCard(): SportScoreboardCard {
  return document.createElement("ha-teamtracker-scoreboard-card") as unknown as SportScoreboardCard;
}

export function makeHassWithConnection(states: HassStates = {}) {
  const unsub = vi.fn();
  const connection = { subscribeEvents: vi.fn().mockResolvedValue(unsub) };
  return { hass: { states, connection } as unknown as HomeAssistant, unsub, connection };
}
