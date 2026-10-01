import deescalate from "@/data/soothing/deescalate.json";
import soothe from "@/data/soothing/soothe.json";
import repair from "@/data/soothing/repair.json";
import close from "@/data/soothing/close.json";
import type { SoothingEpisode, SoothingState } from "./types";

const library = [...deescalate, ...soothe, ...repair, ...close] as SoothingEpisode[];

export function retrieveSoothing(input: { state: SoothingState; text: string; limit?: number }) {
  const terms = input.text.split(/[，。！？\s]+/).filter(Boolean);
  return library.filter((item) => item.state === input.state).map((item) => ({ item, score: terms.reduce((score, term) => score + (item.text.includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score).slice(0, input.limit || 3).map(({ item }) => item);
}
