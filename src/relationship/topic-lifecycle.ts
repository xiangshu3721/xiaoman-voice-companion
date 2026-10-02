import type { ChatMessage } from "@/lib/providers";
import type { Classification, ConflictScene } from "@/src/conflict-engine/types";
import { chooseDailyLifeReentry, type DailyLifeReentryStrategy } from "./daily-life-reentry";
import type { RepairBid } from "./repair-bid-detector";
import type { RelationshipState, TopicClosureGate, TopicState, UserStateAnalysis } from "./types";

export type TopicLifecycleResult = {
  topicMemory: TopicState;
  topicClosure: TopicClosureGate;
  topicExhaustionScore: number;
  semanticRepetitionCount: number;
  stuckTopic: boolean;
  lettingGoReadiness: number;
  topicShiftProbability: number;
  dailyLifeReentryStrategy?: DailyLifeReentryStrategy;
  dailyLifeReentryText?: string;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const commitmentPattern = /(?:我\s*(?:会|要|去|得|一定|马上|今晚|明天|下班后)|我.{0,10}(?:做|完成|处理|收拾|洗|买|回|发|改|弄|收|说|扔))/;
const completionPattern = /(?:已经|刚刚|刚才|我已|我把).{0,12}(?:做完|完成|处理好|弄好了|收拾好了|洗好了|发了|改好了)/;
const renegotiationPattern = /(?:我不做|我不想做了|我改主意|算了不|不用我|别指望我|我没答应|没说过|不关我事)/;
const reopenPattern = /(?:再说这个|继续说这个|这事还没完|我还要说|重新谈|别想翻篇|不接受|我不同意|你又提|先别过去|还没解决)/;
const newEvidencePattern = /(?:我没做|还没做|没完成|没弄|你又|又一次|刚刚发生|刚才发现|结果|实际|证据|骗我|撒谎|违约|反悔)/;
const deferPattern = /(?:之后再聊|以后再聊|以后再说|改天再说|先不说了|今天不聊这个|暂时放着)/;
const closePattern = /(?:这事过去了|翻篇了|就这样吧|不说这个了|不聊这个了|说好了)/;
const seriousPattern = /(?:暴力|打我|打你|伤害|自杀|不想活|安全问题|家暴|出轨|骗了很多钱|债务|重大隐瞒)/;
const conflictPattern = /(?:为什么|凭什么|你又|每次|根本|气死|烦死|什么意思|不想说|别说了|无所谓|算了)/;
const deadlinePattern = /(?:([01]?\d|2[0-3])\s*(?:点|时)(?:\s*([0-5]?\d)\s*分?)?|([01]?\d|2[0-3]):([0-5]\d))/;
const chineseHourPattern = /(十二|十一|十|九|八|七|六|五|四|三|二|一)点/;
const chineseHours: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };

function extractDeadline(text: string, scene: ConflictScene) {
  const eveningContext = scene.baseScenarioId === "forgotten" || /晚|晚上|夜里|今晚/.test(`${scene.trigger} ${scene.background} ${text}`);
  const numeric = text.match(deadlinePattern);
  if (numeric) {
    let hour = Number(numeric[1] || numeric[3]);
    const minute = Number(numeric[2] || numeric[4] || 0);
    if (eveningContext && hour > 0 && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const chinese = text.match(chineseHourPattern);
  if (chinese) {
    let hour = chineseHours[chinese[1]];
    if (eveningContext && hour > 0 && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }
  return undefined;
}

function hasActionCommitment(text: string) {
  return commitmentPattern.test(text) && /(?:做|完成|处理|收拾|洗|买|回|发|改|去|弄|收|说|扔)/.test(text);
}

function hasNewInformation(text: string) {
  return newEvidencePattern.test(text) || renegotiationPattern.test(text) || reopenPattern.test(text);
}

function topicIsSerious(scene: ConflictScene, text: string) {
  return seriousPattern.test(`${scene.category} ${scene.trigger} ${scene.unresolvedIssue} ${text}`);
}

export function semanticCoreForText(text: string) {
  if (/(?:九点|21:00|二十一点|做完|完成|处理|弄好|别光说|做了再说|看你做不做|先把事)/.test(text)) return "USER_MUST_COMPLETE_AGREED_TASK";
  if (/(?:对不起|抱歉|我错了|道歉)/.test(text)) return "USER_APOLOGY_NOT_ENOUGH";
  if (/(?:你每次|你又|总是|老是)/.test(text)) return "PATTERN_ACCUSATION";
  return undefined;
}

function recentSemanticRepetition(history: ChatMessage[], topicId: string) {
  const replies = history.filter((message) => message.role === "assistant").slice(-5);
  const cores = replies.map((message) => semanticCoreForText(message.content)).filter(Boolean) as string[];
  const counts = new Map<string, number>();
  cores.forEach((core) => counts.set(core, (counts.get(core) || 0) + 1));
  const [semanticCore, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] || [undefined, 0];
  return { topicId, semanticCore, count };
}

function replayTopic(history: ChatMessage[], userMessage: string, scene: ConflictScene) {
  const users = [...history.filter((message) => message.role === "user"), { role: "user" as const, content: userMessage }];
  let status: TopicState["status"] = "OPEN";
  let agreement: string | undefined;
  let actionOwner: TopicState["actionOwner"];
  let actionDeadline: string | undefined;
  let reopenReason: string | undefined;
  let lastMentionTurn = 0;
  for (const [index, message] of users.entries()) {
    const text = message.content.trim();
    lastMentionTurn = index + 1;
    if (deferPattern.test(text)) {
      status = "DEFERRED";
      reopenReason = "用户明确要求之后再谈";
      continue;
    }
    if ((status === "AGREED" || status === "RESOLVED" || status === "CLOSED") && (renegotiationPattern.test(text) || reopenPattern.test(text))) {
      status = "NEGOTIATING";
      reopenReason = renegotiationPattern.test(text) ? "用户反悔或否认协议" : "用户明确重新打开议题";
    }
    if (completionPattern.test(text) && (status === "AGREED" || status === "NEGOTIATING")) {
      status = "RESOLVED";
      continue;
    }
    if (hasActionCommitment(text) && !renegotiationPattern.test(text)) {
      status = "AGREED";
      actionOwner = /(?:我|我会|我要|我去|我一定)/.test(text) ? "USER" : "BOTH";
      actionDeadline = extractDeadline(text, scene) || actionDeadline;
      agreement = `用户承诺${actionDeadline ? `${actionDeadline} ` : ""}完成该事项`;
      reopenReason = undefined;
      continue;
    }
    if (closePattern.test(text) && (status === "NEGOTIATING" || status === "AGREED" || status === "RESOLVED")) {
      status = status === "AGREED" ? "AGREED" : "CLOSED";
      continue;
    }
    if (status === "OPEN" && conflictPattern.test(text)) status = "NEGOTIATING";
  }
  const repetition = recentSemanticRepetition(history, `topic:${scene.id}`);
  return { status, agreement, actionOwner, actionDeadline, reopenReason, lastMentionTurn, repetition };
}

export function buildTopicLifecycle(input: { history: ChatMessage[]; userMessage: string; scene: ConflictScene; relationshipState: RelationshipState; userState: UserStateAnalysis; classification: Classification; repairBid: RepairBid; repairMomentum: number; attackMomentum: number; userSoftening: number }) : TopicLifecycleResult {
  const replay = replayTopic(input.history, input.userMessage, input.scene);
  const serious = topicIsSerious(input.scene, input.userMessage);
  const newEvidence = hasNewInformation(input.userMessage);
  const agreementExists = Boolean(replay.agreement);
  const actionOwnerExists = Boolean(replay.actionOwner);
  const deadlineExists = Boolean(replay.actionDeadline);
  const answerFound = replay.status === "AGREED" || replay.status === "RESOLVED" || replay.status === "CLOSED";
  const userAcknowledgedPart = input.repairBid.types.some((type) => ["APOLOGY", "OWNERSHIP", "COMPROMISE"].includes(type));
  const shouldBlockReopen = !serious && answerFound && agreementExists && actionOwnerExists && !newEvidence && !reopenPattern.test(input.userMessage) && !renegotiationPattern.test(input.userMessage);
  const semanticRepetitionCount = replay.repetition.count;
  const topicExhaustionScore = clamp(Math.max(0, semanticRepetitionCount - 1) * 32 + (semanticRepetitionCount >= 3 ? 12 : 0));
  const stuckTopic = semanticRepetitionCount >= 3;
  const emotionalResidue = clamp((answerFound ? 30 : 45) + input.userState.hurt * 0.25 + input.userState.anger * 0.18 - input.repairMomentum * 0.25);
  const lettingGoReadiness = clamp(input.repairMomentum * 0.52 + (agreementExists ? 25 : 0) + input.userSoftening * 0.22 + (input.repairBid.types.includes("AFFECTION") ? 8 : 0) + (input.repairBid.types.includes("HUMOR") ? 6 : 0) - input.userState.aggression * 0.55 - emotionalResidue * 0.18 - (serious ? 35 : 0));
  const strongRepair = input.repairBid.detected && !input.repairBid.explicitInsult && input.repairBid.sincerityConfidence >= 0.55 && input.userState.aggression < 35;
  let topicShiftProbability = 0.15;
  if (!serious && replay.status === "AGREED" && (input.repairMomentum > 50 || strongRepair) && input.userState.aggression < 35) topicShiftProbability = 0.6;
  if (!serious && replay.status === "AGREED" && input.repairMomentum > 70 && input.userState.aggression < 25) topicShiftProbability = 0.8;
  if (!serious && (replay.status === "RESOLVED" || replay.status === "CLOSED")) topicShiftProbability = 0.92;
  if (stuckTopic) topicShiftProbability = Math.max(topicShiftProbability, 0.88);
  if (serious) topicShiftProbability = Math.min(topicShiftProbability, 0.25);
  const shouldReenterDailyLife = !serious && !newEvidence && topicShiftProbability >= 0.6 && (lettingGoReadiness >= 55 || strongRepair || replay.status === "RESOLVED" || replay.status === "CLOSED");
  const recentReplies = input.history.filter((message) => message.role === "assistant").slice(-3).map((message) => message.content);
  const reentry = shouldReenterDailyLife ? chooseDailyLifeReentry({ userText: input.userMessage, repairTypes: input.repairBid.types, turn: replay.lastMentionTurn, recentReplies }) : undefined;
  const topicMemory: TopicState = {
    topicId: `topic:${input.scene.id}`,
    topic: input.scene.unresolvedIssue || input.scene.title,
    status: serious && answerFound ? "DEFERRED" : replay.status,
    agreement: replay.agreement,
    actionOwner: replay.actionOwner,
    actionDeadline: replay.actionDeadline,
    emotionalResidue,
    repetitionCount: semanticRepetitionCount,
    lastMentionTurn: replay.lastMentionTurn,
    reopenReason: replay.reopenReason,
    topicExhaustionScore,
    semanticCore: replay.repetition.semanticCore,
    newEvidence,
    reopenAllowed: !shouldBlockReopen,
    stuckTopic,
  };
  return {
    topicMemory,
    topicClosure: {
      answerFound,
      agreementExists,
      actionOwnerExists,
      deadlineExists,
      userAcknowledgedPart,
      repairBidDetected: input.repairBid.detected,
      newEvidence,
      shouldBlockReopen,
      reason: serious ? "议题涉及严重关系或安全问题，不能用生活化转场掩盖" : shouldBlockReopen ? "协议已建立且没有新的事实，不重复追责" : replay.status === "AGREED" ? "仍在等待现实行动，但不把等待当作违约" : "协议尚未完整建立",
    },
    topicExhaustionScore,
    semanticRepetitionCount,
    stuckTopic,
    lettingGoReadiness,
    topicShiftProbability,
    dailyLifeReentryStrategy: reentry?.strategy,
    dailyLifeReentryText: reentry?.text,
  };
}
