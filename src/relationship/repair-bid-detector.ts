import type { ChatMessage } from "@/lib/providers";
import { analyzeUserSemantic } from "@/src/semantic/user-semantic-analyzer";
import { apologyEvidenceForText } from "@/src/semantic/semantic-grounding";

export type RepairBidType =
  | "APOLOGY"
  | "OWNERSHIP"
  | "AFFECTION"
  | "REASSURANCE"
  | "FORGIVENESS_REQUEST"
  | "PEACE_OFFERING"
  | "HUMOR"
  | "VULNERABILITY"
  | "PHYSICAL_AFFECTION"
  | "COMPROMISE"
  | "RELATIONSHIP_CONFIRMATION";

export interface RepairBid {
  detected: boolean;
  type: RepairBidType | null;
  types: RepairBidType[];
  strength: number;
  sincerityConfidence: number;
  repeatedCount: number;
  points: number;
  explicitInsult: boolean;
  explicitApology: boolean;
  explicitOwnership: boolean;
  apologyEvidence: ReturnType<typeof apologyEvidenceForText>;
}

const patterns: Array<{ type: RepairBidType; test: RegExp; points: number }> = [
  { type: "APOLOGY", test: /(对不起|抱歉|不好意思|sorry|我错了|是我不对|刚才是我不好|刚才我说重了|刚刚有点上头|刚刚有点情绪|跟你道歉|这次算我的|行[，,]?是我的问题)/i, points: 25 },
  { type: "OWNERSHIP", test: /(我错了|确实怪我|承认我有问题|确实过分|不该那么说|态度不好|刚才是我不好|说话太冲|没考虑你的感受|知道你为什么生气|知道刚才那句话伤到你|我错在|我没做好|刚刚.*有点情绪)/, points: 30 },
  { type: "AFFECTION", test: /(我爱你|还是爱你的|我在乎你|怎么可能不在乎|别生气了嘛|宝宝别生气|老婆别生气|老公别生气)/, points: 15 },
  { type: "FORGIVENESS_REQUEST", test: /(原谅我吧|别生我气了|别气了好不好|这次原谅我|给我一次机会|别跟我计较了嘛)/, points: 20 },
  { type: "PEACE_OFFERING", test: /(好了好了|咱别吵了|不吵了好不好|和好吧|行了嘛|请你吃饭|给你买好吃的|不想再吵)/, points: 20 },
  { type: "PHYSICAL_AFFECTION", test: /(抱一下|过来抱抱|抱抱|过来)/, points: 20 },
  { type: "VULNERABILITY", test: /(其实也挺难受|刚才就是害怕|不是故意想伤你|其实挺在乎|怕你真的不理我|不想我们变成这样|我也很难受)/, points: 20 },
  { type: "RELATIONSHIP_CONFIRMATION", test: /(没想分手|没想离开你|想跟你好好的|吵归吵.*爱你|不想因为这个影响我们)/, points: 20 },
  { type: "REASSURANCE", test: /(我会改|下次我先说|我不会再|你放心|我保证|以后不会了)/, points: 20 },
  { type: "COMPROMISE", test: /(各退一步|各改一点|你说怎么做|我听你的|先按你说的|我们一起定)/, points: 20 },
  { type: "HUMOR", test: /(哈哈|嘿嘿|逗你呢|开个玩笑|给个台阶)/, points: 12 },
];

const explicitInsult = /(傻逼|废物|有病|神经|滚|去死|没用|脑子有问题)/;
const perfunctory = /(行行行.*(对不起|错了)|对不起.*(行了吧|行了没|满意了)|都是我的错.*满意了|随便.*道歉)/;

function consecutiveRepairCount(history: ChatMessage[]) {
  let count = 0;
  for (const message of [...history].reverse()) {
    if (message.role !== "user") continue;
    const hasBid = patterns.some(({ test }) => test.test(message.content));
    if (!hasBid) break;
    count += 1;
  }
  return count;
}

export function detectRepairBid(input: { text: string; history?: ChatMessage[] }): RepairBid {
  const clean = input.text.trim();
  const semantic = analyzeUserSemantic(clean);
  const matched = patterns.filter(({ type, test }) => type === "APOLOGY" ? (test.test(clean) && !semantic.negatedIntents.includes("APOLOGY")) : test.test(clean));
  const types = matched.map(({ type }) => type);
  const points = Math.min(100, matched.reduce((sum, item) => sum + item.points, 0));
  const isPerfunctory = perfunctory.test(clean);
  const insult = explicitInsult.test(clean);
  const apologyEvidence = apologyEvidenceForText(clean);
  const sincerityConfidence = isPerfunctory ? 0.22 : Math.min(0.98, 0.52 + (types.includes("OWNERSHIP") ? 0.18 : 0) + (types.includes("APOLOGY") ? 0.14 : 0) + (clean.length > 12 ? 0.08 : 0));
  const strength = isPerfunctory ? Math.min(0.28, points / 100) : Math.min(1, points / 100);
  return {
    detected: types.length > 0,
    type: types[0] || null,
    types,
    strength,
    sincerityConfidence,
    repeatedCount: (input.history ? consecutiveRepairCount(input.history) : 0) + (types.length ? 1 : 0),
    points,
    explicitInsult: insult,
    explicitApology: apologyEvidence.type === "EXPLICIT",
    explicitOwnership: types.includes("OWNERSHIP"),
    apologyEvidence,
  };
}

export function isGenuineRepairBid(bid: RepairBid) {
  return bid.detected && !bid.explicitInsult && bid.sincerityConfidence >= 0.55 && bid.strength >= 0.4;
}

export function repairBidLabel(bid: RepairBid) {
  return bid.types.join(" + ") || "NONE";
}
