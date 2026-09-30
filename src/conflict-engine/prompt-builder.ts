import { XIAOMAN_SYSTEM_PROMPT, type ChatMessage } from "@/lib/providers";
import type { Classification, ConflictScene, ConflictState, RetrievedEpisode, StrategySelection } from "./types";

function formatEpisode(item: RetrievedEpisode) {
  const turns = item.episode.turns.slice(0, 6).map((turn) => `${turn.speaker === "A" ? "小满" : "伴侣"}：${turn.text}`).join("\n");
  return `[${item.episode.id} / ${item.episode.ending} / 相似度${item.score.toFixed(1)}]\n${turns}`;
}

function emotionalDirection(intensity: ConflictState["conflictIntensity"], strategy: StrategySelection["primary"]) {
  if (intensity >= 5) return "情绪已经顶到临界点：可以短促、直接、带明显压迫感，但仍然像真人说话，不要喊叫或失控辱骂。";
  if (intensity === 4) return "情绪明显升级：不要客气地解释，要让用户感到小满真的被刺到了；可以用反问、重复和短句。";
  if (intensity === 3) return "情绪正在升温：表面还能控制，但话里要有刺、有不耐烦或委屈，不要写成温和客服回复。";
  if (["softening", "validation", "repair_attempt"].includes(strategy)) return "情绪正在松动：不要突然变成咨询师，保留一点嘴硬、余气或受伤感。";
  return "情绪有波动：保持自然口语，让用户听出小满在意这件事，而不是平铺直叙。";
}

export function buildConflictPrompt(input: { scene: ConflictScene; state: ConflictState; classification: Classification; strategy: StrategySelection; retrieved: RetrievedEpisode[]; history: ChatMessage[]; userMessage: string; characterGender?: "female" | "male"; characterName?: string }) {
  const characterName = input.characterName || "小满";
  const baseSystemPrompt = (input.characterGender === "male"
    ? XIAOMAN_SYSTEM_PROMPT.replaceAll("小满", characterName).replace("一名32岁的中国女性", "一名成年中国男性")
    : XIAOMAN_SYSTEM_PROMPT.replaceAll("小满", characterName));
  const internal = `
【后台冲突引擎信息，仅用于生成，不得向用户解释】
当前场景：${input.scene.category}｜${input.scene.trigger}
未解决议题：${input.scene.unresolvedIssue}
用户行为标签：${input.classification.labels.join(", ")}（置信度${input.classification.confidence}）
${characterName}当前状态：愤怒${input.state.anger}，受伤${input.state.hurt}，失望${input.state.disappointment}，焦虑${input.state.anxiety}，轻蔑${input.state.contempt}，信任${input.state.trust}，怨气${input.state.resentment}，连接感${input.state.connection}，冲突强度${input.state.conflictIntensity}/5
本轮选择：主策略 ${input.strategy.primary}；辅助策略 ${input.strategy.secondary.join(", ") || "无"}
情绪方向：${emotionalDirection(input.state.conflictIntensity, input.strategy.primary)}
生成约束：只说${characterName}现在会说的话；1-3句，10-80个中文字；不要把所有策略都堆在一句话里；回应必须接住用户原话中的具体词并符合当前强度；不要凭空创造历史；避免和上一轮相同的开头、句式和收尾。
`;
  const examples = input.retrieved.map(formatEpisode).join("\n\n");
  const recent = input.history.slice(-10).map((message) => `${message.role === "user" ? "用户" : characterName}：${message.content}`).join("\n");
  return {
    systemPrompt: `${baseSystemPrompt}\n\n${internal}\n\n【相似冲突片段，仅学习节奏和策略，不得复制】\n${examples}`,
    contextPrompt: `【最近对话】\n${recent || "暂无"}\n\n【用户本轮原话】\n${input.userMessage}`,
  };
}
