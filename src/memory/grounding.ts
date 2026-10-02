import type { ChatMessage } from "@/lib/providers";

export type MemoryEvidenceType =
  | "CURRENT_SESSION_USER_MESSAGE"
  | "CURRENT_SESSION_AI_MESSAGE"
  | "STRUCTURED_AGREEMENT"
  | "VERIFIED_LONG_TERM_MEMORY";

export type MemoryEvidence = {
  id: string;
  type: MemoryEvidenceType;
  content: string;
  exactQuote?: string;
  turnId?: string;
  sessionId?: string;
  timestamp?: number;
  confidence: number;
  verified: boolean;
};

export type SessionBoundary = {
  sessionId: string;
  sessionType: "NEW" | "CONTINUED";
  continuePreviousScene: boolean;
  activeTopic: string;
  relationshipState: "NEUTRAL_BASELINE" | "CURRENT_SESSION";
  anger: number;
  aggression: number;
  hurt: number;
  withdrawal: number;
  repairMomentum: number;
  attackMomentum: number;
  conflictBudget: number;
};

export type MemoryGuardIssue =
  | "UNSUPPORTED_QUOTE"
  | "UNSUPPORTED_EVENT"
  | "UNSUPPORTED_AGREEMENT"
  | "UNSUPPORTED_EMOTION_CLAIM"
  | "UNSUPPORTED_RELATIONSHIP_HISTORY"
  | "UNSUPPORTED_USER_INTENT"
  | "UNSUPPORTED_PRIOR_CONFLICT"
  | "REFERENCE_DATA_AS_FACT";

export type MemoryGuardResult = {
  valid: boolean;
  issues: MemoryGuardIssue[];
  claimDetected: boolean;
  claim: string;
  evidenceId?: string;
  evidenceSource?: MemoryEvidenceType;
  evidenceConfidence: number;
  exactQuoteMatch: boolean;
  inferenceUsed: boolean;
  userCorrection: boolean;
  referenceDataUsedAsFact: boolean;
};

const normalize = (value: string) => value
  .replace(/[“”「」『』"'‘’]/g, "")
  .replace(/[，。！？；：、,.!?;:\s]/g, "")
  .toLowerCase();

const userCorrectionPattern = /(?:我没说过|我什么时候说过|我啥时候说过|我没这么说|你记错了|你编的吧|没有这回事|你搞错了|不是我说的|我没答应|没说过|没说想)/;
const pastClaimPattern = /(?:你(?:刚才|之前|上次|以前|曾经)?\s*(?:说过|说了|说|提过|答应过|承诺过)|你明明(?:说过|说了|答应过)|你不是说|上次你|之前你|我们(?:刚才|之前|上次)?\s*(?:说好了|约定过|吵过|争过|冷战过|闹过|经历过))/;
const priorConflictPattern = /(?:我们(?:刚才|之前|上次)?\s*(?:吵架|争吵|冷战|闹过|大吵)|上次(?:我们|你).*?(?:吵|闹)|你又来了|你每次都这样)/;
const agreementPattern = /(?:我们(?:已经)?说好了|我们约定过|你答应过|你承诺过|约好了|定好了)/;
const unsupportedEmotionPattern = /(?:你(?:最近|刚才|之前|一直|其实)?(?:不想聊天|想一个人静静|很难过|很生气|不在乎|不想理我|害怕|委屈|失望|烦我))/;
const unsupportedIntentPattern = /(?:你(?:就是|其实就是|只是|根本就是)?想(?:一个人静静|逃避|离开我|分手|冷处理)|你不想(?:跟我聊天|理我|面对))/;
const conflictEvidencePattern = /(?:吵|争|气|生气|烦|不回|不理|凭什么|你又|每次|失望|难受|委屈|算了|别说了|不想说|有病|无理取闹)/;
const agreementEvidencePattern = /(?:答应|承诺|说好了|约定|我会|我去|我要|我一定|九点|十点|完成|做完|处理好)/;

export function isUserCorrection(text: string) {
  return userCorrectionPattern.test(text);
}

export function isCasualOpening(text: string) {
  return /^(?:你好|嗨|哈喽|在吗|干嘛呢|吃饭了吗|吃了吗|睡了吗|早|早安|晚安|宝|老婆|老公|想你了|你别生气呀)[。！!，,？?…\s]*$/.test(text.trim());
}

export function createSessionBoundary(input: { history: ChatMessage[]; sessionId?: string; continuePreviousScene?: boolean }): SessionBoundary {
  const hasUserMessage = input.history.some((message) => message.role === "user" && message.content.trim());
  const continuePreviousScene = Boolean(input.continuePreviousScene && hasUserMessage);
  const isNew = !hasUserMessage && !continuePreviousScene;
  return {
    sessionId: input.sessionId || (isNew ? "session:new" : "session:current"),
    sessionType: isNew ? "NEW" : "CONTINUED",
    continuePreviousScene,
    activeTopic: isNew ? "NONE" : "CURRENT_SESSION",
    relationshipState: isNew ? "NEUTRAL_BASELINE" : "CURRENT_SESSION",
    anger: 0,
    aggression: 0,
    hurt: 0,
    withdrawal: 0,
    repairMomentum: 0,
    attackMomentum: 0,
    conflictBudget: 100,
  };
}

function hasStructuredAgreement(history: ChatMessage[], index: number) {
  const message = history[index];
  if (!message || message.role !== "user" || !agreementEvidencePattern.test(message.content)) return false;
  const next = history[index + 1];
  return Boolean(next?.role === "assistant" && /(?:好|行|知道|记着|可以|嗯|收到|明白)/.test(next.content));
}

export function collectMemoryEvidence(input: { history: ChatMessage[]; currentUserMessage?: string; sessionId?: string }): MemoryEvidence[] {
  const messages = [...input.history];
  if (input.currentUserMessage?.trim() && !(messages[messages.length - 1]?.role === "user" && messages[messages.length - 1]?.content.trim() === input.currentUserMessage.trim())) {
    messages.push({ role: "user", content: input.currentUserMessage.trim() });
  }
  let userTurn = 0;
  let aiTurn = 0;
  const evidence: MemoryEvidence[] = [];
  messages.forEach((message, index) => {
    const turnId = `turn-${index + 1}`;
    if (message.role === "user") {
      userTurn += 1;
      const structured = hasStructuredAgreement(messages, index);
      evidence.push({
        id: `${structured ? "STRUCTURED_AGREEMENT" : "CONVERSATION"}::USER::${userTurn}`,
        type: structured ? "STRUCTURED_AGREEMENT" : "CURRENT_SESSION_USER_MESSAGE",
        content: message.content,
        exactQuote: message.content,
        turnId,
        sessionId: input.sessionId,
        confidence: structured ? 0.92 : 1,
        verified: true,
      });
    } else {
      aiTurn += 1;
      evidence.push({
        id: `CONVERSATION::AI::${aiTurn}`,
        type: "CURRENT_SESSION_AI_MESSAGE",
        content: message.content,
        turnId,
        sessionId: input.sessionId,
        confidence: 1,
        verified: true,
      });
    }
  });
  return evidence;
}

function findUserEvidence(evidence: MemoryEvidence[], phrase: string) {
  const target = normalize(phrase);
  if (target.length < 2) return undefined;
  return evidence.find((item) => (item.type === "CURRENT_SESSION_USER_MESSAGE" || item.type === "STRUCTURED_AGREEMENT") && normalize(item.content).includes(target));
}

export class MemoryEvidenceResolver {
  readonly evidence: MemoryEvidence[];

  constructor(input: { history: ChatMessage[]; currentUserMessage?: string; sessionId?: string }) {
    this.evidence = collectMemoryEvidence(input);
  }

  resolve(phrase: string) {
    return findUserEvidence(this.evidence, phrase);
  }

  resolveExactQuote(quote: string) {
    return this.resolve(quote);
  }
}

function extractQuoted(text: string) {
  return [...text.matchAll(/[“「『"]([^”」』"]+)[”」』"]/g)].map((match) => match[1]).filter(Boolean);
}

function extractPastClaimTarget(text: string) {
  const match = text.match(/(?:你(?:刚才|之前|上次|以前|曾经)?\s*(?:说过|说了|说|提过|答应过|承诺过)|你明明(?:说过|说了|答应过)|你不是说|上次你|之前你)([^，。！？；;]*)/);
  return match?.[1]?.trim() || "";
}

function conversationSupportsConflict(evidence: MemoryEvidence[]) {
  return evidence.some((item) => item.type === "CURRENT_SESSION_USER_MESSAGE" && conflictEvidencePattern.test(item.content));
}

function conversationSupportsAgreement(evidence: MemoryEvidence[]) {
  return evidence.some((item) => item.type === "STRUCTURED_AGREEMENT");
}

export function validateMemoryGrounding(input: { reply: string; history: ChatMessage[]; currentUserMessage?: string; sessionId?: string; referenceTexts?: string[] }): MemoryGuardResult {
  const resolver = new MemoryEvidenceResolver(input);
  const evidence = resolver.evidence;
  const userEvidence = evidence.filter((item) => item.type === "CURRENT_SESSION_USER_MESSAGE" || item.type === "STRUCTURED_AGREEMENT");
  const quoted = extractQuoted(input.reply);
  const claimDetected = quoted.length > 0 || pastClaimPattern.test(input.reply) || priorConflictPattern.test(input.reply) || agreementPattern.test(input.reply) || unsupportedEmotionPattern.test(input.reply) || unsupportedIntentPattern.test(input.reply);
  const issues: MemoryGuardIssue[] = [];
  let evidenceMatch: MemoryEvidence | undefined;
  let exactQuoteMatch = quoted.length === 0;
  let claim = "";

  for (const quote of quoted) {
    const match = resolver.resolveExactQuote(quote);
    if (match) {
      evidenceMatch ||= match;
      exactQuoteMatch = true;
    } else {
      exactQuoteMatch = false;
      issues.push("UNSUPPORTED_QUOTE");
      claim ||= quote;
    }
  }

  if (pastClaimPattern.test(input.reply)) {
    const target = extractPastClaimTarget(input.reply);
    const match = target ? resolver.resolve(target) : undefined;
    evidenceMatch ||= match;
    if (!match) {
      issues.push(agreementPattern.test(input.reply) ? "UNSUPPORTED_AGREEMENT" : "UNSUPPORTED_RELATIONSHIP_HISTORY");
      claim ||= target || input.reply;
    }
  }

  if (priorConflictPattern.test(input.reply) && !conversationSupportsConflict(userEvidence)) {
    issues.push("UNSUPPORTED_PRIOR_CONFLICT");
    claim ||= input.reply;
  }

  if (agreementPattern.test(input.reply) && !conversationSupportsAgreement(userEvidence)) {
    issues.push("UNSUPPORTED_AGREEMENT");
    claim ||= input.reply;
  }

  if (unsupportedEmotionPattern.test(input.reply)) {
    const matched = input.reply.match(unsupportedEmotionPattern)?.[0] || "";
    if (!resolver.resolve(matched.replace(/^你(?:最近|刚才|之前|一直|其实)?/, "").trim())) {
      issues.push("UNSUPPORTED_EMOTION_CLAIM");
      claim ||= matched;
    }
  }

  if (unsupportedIntentPattern.test(input.reply)) {
    issues.push("UNSUPPORTED_USER_INTENT");
    claim ||= input.reply.match(unsupportedIntentPattern)?.[0] || input.reply;
  }

  const referenceDataUsedAsFact = Boolean(input.referenceTexts?.some((reference) => reference.length > 4 && input.reply.includes(reference) && !resolver.resolve(reference)));
  if (referenceDataUsedAsFact) issues.push("REFERENCE_DATA_AS_FACT");

  const uniqueIssues = [...new Set(issues)];
  return {
    valid: uniqueIssues.length === 0,
    issues: uniqueIssues,
    claimDetected,
    claim,
    evidenceId: evidenceMatch?.id,
    evidenceSource: evidenceMatch?.type,
    evidenceConfidence: evidenceMatch?.confidence || 0,
    exactQuoteMatch,
    inferenceUsed: /(?:可能|好像|听起来|我是不是理解错了|也许)/.test(input.reply),
    userCorrection: isUserCorrection(input.currentUserMessage || ""),
    referenceDataUsedAsFact: false,
  };
}

export function buildGroundingContext(input: { history: ChatMessage[]; currentUserMessage: string; session: SessionBoundary; referenceTexts?: string[] }) {
  const evidence = collectMemoryEvidence({ history: input.history, currentUserMessage: input.currentUserMessage, sessionId: input.session.sessionId });
  const currentFacts = evidence.filter((item) => item.type === "CURRENT_SESSION_USER_MESSAGE").map((item) => `${item.id} / ${item.exactQuote}`).join("\n") || "NONE";
  const agreements = evidence.filter((item) => item.type === "STRUCTURED_AGREEMENT").map((item) => `${item.id} / ${item.exactQuote}`).join("\n") || "NONE";
  return `【MEMORY_GROUNDING_RULE｜最高优先级】
NO EVIDENCE = NO MEMORY CLAIM。你可以模拟情绪，但不能模拟事实。用户没有说过的话，不得放进用户嘴里；模型推断、角色设定和参考片段都不是用户事实。

【CURRENT_SESSION_FACTS｜当前会话用户原话】
${currentFacts}

【STRUCTURED_AGREEMENTS｜仅限有明确证据的协议】
${agreements}

【VERIFIED_LONG_TERM_MEMORY｜本轮未接入长期记忆】
NONE

【MODEL_INFERENCES｜模型推断，不得事实化】
关系状态、情绪分数、用户意图和场景标签都只是推断，不能改写成“你说过”“你答应过”或“我们以前发生过”。

【SESSION_BOUNDARY】
sessionId=${input.session.sessionId}；sessionType=${input.session.sessionType}；continuePreviousScene=${input.session.continuePreviousScene ? "TRUE" : "FALSE"}；activeTopic=${input.session.activeTopic}；relationshipState=${input.session.relationshipState}

【REFERENCE_EPISODES｜仅供语言风格/策略参考，绝不是当前用户历史】
<FICTIONAL_REFERENCE_EXAMPLES>
${input.referenceTexts?.join("\n\n") || "NONE"}
</FICTIONAL_REFERENCE_EXAMPLES>`;
}
