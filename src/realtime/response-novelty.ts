import type { ChatMessage } from "@/lib/providers";
import type { UserSemanticAnalysis } from "@/src/semantic/user-semantic-analyzer";

const STOP = new Set("的了呢啊呀吧嗯哦行我你这那就也都还很是有在不没什么一下怎么然后现在".split(""));
const tokens = (text: string) => [...text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "")].filter((item) => !STOP.has(item));

export function dialogueAct(text: string) {
  if (/[？?]/.test(text)) return "QUESTION";
  if (/(对不起|抱歉|我错了|是我不好)/.test(text)) return "APOLOGY";
  if (/(算了|不想说|随便|不说了)/.test(text)) return "WITHDRAWAL";
  if (/(行|好|记着|听见了)/.test(text) && text.length < 20) return "ACKNOWLEDGE_AND_REMEMBER";
  if (/(你又|每次|到底|能不能)/.test(text)) return "CHALLENGE";
  return "STATEMENT";
}

export function semanticDuplicateScore(candidate: string, recentReplies: string[]) {
  const candidateTokens = new Set(tokens(candidate));
  return recentReplies.reduce((best, reply) => {
    if (candidate.trim() === reply.trim()) return 1;
    if (dialogueAct(candidate) === "ACKNOWLEDGE_AND_REMEMBER" && dialogueAct(reply) === "ACKNOWLEDGE_AND_REMEMBER") return Math.max(best, 0.9);
    const other = new Set(tokens(reply));
    const union = new Set([...candidateTokens, ...other]).size || 1;
    const overlap = [...candidateTokens].filter((item) => other.has(item)).length;
    const actScore = dialogueAct(candidate) === dialogueAct(reply) ? 0.25 : 0;
    return Math.max(best, overlap / union + actScore);
  }, 0);
}

export function addressesLatestDelta(reply: string, userMessage: string, semantic: UserSemanticAnalysis) {
  const tokensInUser = tokens(userMessage);
  const overlap = tokensInUser.length === 0 ? 1 : tokensInUser.filter((token) => reply.includes(token)).length / Math.min(4, tokensInUser.length);
  const intentHit = semantic.explicitIntents.some((intent) => {
    if (intent === "APOLOGY" || intent === "OWNERSHIP") return /(道歉|认错|错|问题|听见|信|态度)/.test(reply);
    if (intent === "AFFECTION") return /(爱|在乎|别走|好好)/.test(reply);
    if (intent === "PEACE_OFFERING") return /(缓|不吵|先停|好)/.test(reply);
    return true;
  });
  return { addressed: overlap >= 0.25 || intentHit || userMessage.trim().length < 5, score: Math.max(overlap, intentHit ? 0.7 : 0) };
}

export function noveltyReport(reply: string, history: ChatMessage[], userMessage: string, semantic: UserSemanticAnalysis) {
  const recent = history.filter((item) => item.role === "assistant").slice(-5).map((item) => item.content);
  const duplicate = semanticDuplicateScore(reply, recent);
  const delta = addressesLatestDelta(reply, userMessage, semantic);
  return { recentReplies: recent, semanticDuplicateScore: Number(duplicate.toFixed(2)), responseNoveltyScore: Number((1 - duplicate).toFixed(2)), addressesLatestDelta: delta.addressed, latestDeltaScore: Number(delta.score.toFixed(2)), dialogueAct: dialogueAct(reply) };
}
