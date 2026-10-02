import phrases from "@/data/phrase-banks/daily-life-reentry-cn.json";
import type { RepairBidType } from "./repair-bid-detector";

export type DailyLifeReentryStrategy =
  | "FOOD_REQUEST"
  | "PHYSICAL_AFFECTION"
  | "SMALL_FAVOR"
  | "DAILY_ROUTINE"
  | "PLAYFUL_DEMAND"
  | "LIGHT_TEASING"
  | "COMPANIONSHIP"
  | "ACTIVITY_SHIFT"
  | "CARE_BEHAVIOR"
  | "HUMOROUS_BARGAIN";

type ReentryPhrase = { id: string; category: DailyLifeReentryStrategy; text: string; tags: string[]; sourceType: string };

const library = phrases as ReentryPhrase[];

function scoreStrategy(strategy: DailyLifeReentryStrategy, input: { hour: number; repairTypes: RepairBidType[]; userText: string }) {
  let score = 0;
  if (input.repairTypes.includes("AFFECTION") || input.repairTypes.includes("PHYSICAL_AFFECTION")) {
    if (strategy === "PHYSICAL_AFFECTION" || strategy === "COMPANIONSHIP") score += 6;
  }
  if (input.repairTypes.includes("FORGIVENESS_REQUEST") || input.repairTypes.includes("HUMOR")) {
    if (strategy === "PLAYFUL_DEMAND" || strategy === "HUMOROUS_BARGAIN" || strategy === "LIGHT_TEASING") score += 5;
  }
  if (input.hour >= 22 || input.hour < 6) {
    if (strategy === "DAILY_ROUTINE" || strategy === "COMPANIONSHIP" || strategy === "CARE_BEHAVIOR") score += 5;
  } else if (input.hour >= 11 && input.hour <= 14 || input.hour >= 17 && input.hour <= 21) {
    if (strategy === "FOOD_REQUEST" || strategy === "ACTIVITY_SHIFT") score += 4;
  }
  if (/吃|饿|饭|奶茶|喝/.test(input.userText) && strategy === "FOOD_REQUEST") score += 5;
  if (/抱|靠|亲|陪/.test(input.userText) && (strategy === "PHYSICAL_AFFECTION" || strategy === "COMPANIONSHIP")) score += 5;
  if (/洗澡|睡|明天|上班|早点/.test(input.userText) && strategy === "DAILY_ROUTINE") score += 5;
  if (/哈哈|笑|玩笑/.test(input.userText) && (strategy === "LIGHT_TEASING" || strategy === "HUMOROUS_BARGAIN")) score += 4;
  return score;
}

export function chooseDailyLifeReentry(input: { userText: string; repairTypes: RepairBidType[]; turn: number; recentReplies?: string[]; now?: Date }) {
  const hour = (input.now || new Date()).getHours();
  const strategies = [...new Set(library.map((item) => item.category))] as DailyLifeReentryStrategy[];
  const ranked = strategies.map((strategy) => ({ strategy, score: scoreStrategy(strategy, { hour, repairTypes: input.repairTypes, userText: input.userText }) })).sort((a, b) => b.score - a.score);
  const recent = new Set((input.recentReplies || []).map((item) => item.trim()));
  const chosenStrategy = ranked[0]?.strategy || "COMPANIONSHIP";
  const candidates = library.filter((item) => item.category === chosenStrategy && !recent.has(item.text));
  const pool = candidates.length ? candidates : library.filter((item) => item.category === chosenStrategy);
  const phrase = pool[input.turn % Math.max(1, pool.length)] || library[0];
  return { strategy: phrase.category, text: phrase.text, phraseId: phrase.id };
}

export function isDailyLifeReentryStrategy(value: string): value is DailyLifeReentryStrategy {
  return library.some((item) => item.category === value);
}
