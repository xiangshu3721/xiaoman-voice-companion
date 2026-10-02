import type { RelationshipSnapshot } from "@/src/relationship/types";
import type { PerformanceEmotion, PerformanceIntensity } from "./types";

export function emotionalPunchScore(input: { text: string; relationship: RelationshipSnapshot; emotion: PerformanceEmotion; intensity: PerformanceIntensity }) {
  const { text, relationship, emotion, intensity } = input;
  let score = 25;
  if (/[？！?!]/.test(text)) score += 14;
  if (/[……，。]/.test(text)) score += 8;
  if (/(你又|有完没完|行了|少来|到底|多少遍|最忙|随便|不是|算了|我真)/.test(text)) score += 18;
  if (text.length <= 34) score += 8;
  if (relationship.currentState === "CONFLICT" && intensity >= 3) score += 10;
  if (["explosive_anger", "sarcastic_anger", "hurt_anger", "cold_anger"].includes(emotion)) score += 9;
  if (/我理解你的感受|我们应该|作为AI|建议你|双方都有责任/.test(text)) score -= 35;
  return Math.max(0, Math.min(100, score));
}
