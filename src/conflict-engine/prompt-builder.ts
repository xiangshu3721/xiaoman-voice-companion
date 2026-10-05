import { XIAOMAN_SYSTEM_PROMPT, type ChatMessage } from "@/lib/providers";
import type { Classification, ConflictScene, ConflictState, RetrievedEpisode, StrategySelection } from "./types";
import type { RelationshipSnapshot } from "@/src/relationship/types";
import { retrieveSoothing } from "@/src/relationship/soothing-retriever";
import { retrieveReflections } from "@/src/relationship/reflection-retriever";
import { selectReflectionStrategy } from "@/src/relationship/reflection-strategy-selector";
import { buildGroundingContext, createSessionBoundary, type SessionBoundary } from "@/src/memory/grounding";

function formatEpisode(item: RetrievedEpisode) {
  const turns = item.episode.turns.slice(0, 6).map((turn) => `${turn.speaker === "A" ? "怼怼" : "伴侣"}：${turn.text}`).join("\n");
  return `[REFERENCE_EPISODE::${item.episode.id} / ${item.episode.ending} / 相似度${item.score.toFixed(1)}]\n${turns}`;
}

function emotionalDirection(intensity: ConflictState["conflictIntensity"], strategy: StrategySelection["primary"]) {
  if (intensity >= 5) return "情绪已经顶到临界点：可以短促、直接、带明显压迫感，但仍然像真人说话，不要喊叫或失控辱骂。";
  if (intensity === 4) return "情绪明显升级：不要客气地解释，要让用户感到怼怼真的被刺到了；可以用反问、重复和短句。";
  if (intensity === 3) return "情绪正在升温：表面还能控制，但话里要有刺、有不耐烦或委屈，不要写成温和客服回复。";
  if (["softening", "validation", "repair_attempt"].includes(strategy)) return "情绪正在松动：不要突然变成咨询师，保留一点嘴硬、余气或受伤感。";
  return "情绪有波动：保持自然口语，让用户听出怼怼在意这件事，而不是平铺直叙。";
}

export function buildConflictPrompt(input: { scene: ConflictScene; state: ConflictState; classification: Classification; strategy: StrategySelection; retrieved: RetrievedEpisode[]; history: ChatMessage[]; userMessage: string; characterGender?: "female" | "male"; characterName?: string; relationship?: RelationshipSnapshot; sessionBoundary?: SessionBoundary; referenceTexts?: string[] }) {
  const characterName = input.characterName || "怼怼";
  const baseSystemPrompt = (input.characterGender === "male"
    ? XIAOMAN_SYSTEM_PROMPT.replaceAll("怼怼", characterName).replace("一名32岁的中国女性", "一名成年中国男性")
    : XIAOMAN_SYSTEM_PROMPT.replaceAll("怼怼", characterName));
  const internal = `
【后台冲突引擎信息，仅用于生成，不得向用户解释】
当前场景：${input.scene.category}｜${input.scene.trigger}
未解决议题：${input.scene.unresolvedIssue}
用户行为标签：${input.classification.labels.join(", ")}（置信度${input.classification.confidence}）
${characterName}当前状态：愤怒${input.state.anger}，受伤${input.state.hurt}，失望${input.state.disappointment}，焦虑${input.state.anxiety}，轻蔑${input.state.contempt}，信任${input.state.trust}，怨气${input.state.resentment}，连接感${input.state.connection}，冲突强度${input.state.conflictIntensity}/5
本轮选择：主策略 ${input.strategy.primary}；辅助策略 ${input.strategy.secondary.join(", ") || "无"}
    情绪方向：${input.relationship?.currentState === "REFLECT" ? "冲突已经暂时收住：语速和语气放慢，清醒但不冷漠，不反问、不追责、不继续争输赢。" : input.relationship?.conflictPhase === "SOFTENING" ? "用户正在递出台阶：可以嘴硬、表达余怒和受伤，但必须停止人格攻击、羞辱、关系威胁和连续追问。" : emotionalDirection(input.state.conflictIntensity, input.strategy.primary)}
用户最新修复信号：${input.relationship?.repairBid.types.join(" + ") || "无"}；强度${input.relationship?.repairBid.strength.toFixed(2) || "0.00"}；真诚度${input.relationship?.repairBid.sincerityConfidence.toFixed(2) || "0.00"}；修复动量${input.relationship?.repairMomentum ?? 0}/100；攻击动量${input.relationship?.attackMomentum ?? 0}/100；冲突预算${input.relationship?.conflictBudget ?? 100}/100。
议题生命周期：${input.relationship?.topicMemory.status || "OPEN"}；议题${input.relationship?.topicMemory.topic || input.scene.unresolvedIssue}；协议${input.relationship?.topicMemory.agreement || "尚未形成"}；行动负责人${input.relationship?.topicMemory.actionOwner || "未明确"}；截止时间${input.relationship?.topicMemory.actionDeadline || "未明确"}；情绪残留${input.relationship?.topicMemory.emotionalResidue ?? 0}/100。
议题闭合门：${input.relationship?.topicClosure.reason || "尚未判断"}；新证据${input.relationship?.topicMemory.newEvidence ? "有" : "无"}；议题重复${input.relationship?.topicMemory.repetitionCount ?? 0}次；语义耗尽${input.relationship?.topicExhaustionScore ?? 0}/100；卡住${input.relationship?.stuckTopic ? "是" : "否"}；翻篇准备度${input.relationship?.lettingGoReadiness ?? 0}/100；转场概率${Math.round((input.relationship?.topicShiftProbability || 0) * 100)}%。
生成约束：只说${characterName}现在会说的话；1-3句，10-80个中文字；不要把所有策略都堆在一句话里；回应必须接住用户原话中的具体词并符合当前强度；不要凭空创造历史；避免和上一轮相同的开头、句式和收尾。
关系规则：你的目标不是赢得争吵，而是模拟真实伴侣。对方明显认错、道歉、示弱、表达爱、请求和好或递出拥抱时，默认先接住这个台阶；可以还生气、嘴硬、没有完全原谅，但不要无视连续修复尝试，更不能因为过去的冲突继续自动追责。
`;
  const examples = input.retrieved.map(formatEpisode).join("\n\n");
  const recent = input.history.slice(-10).map((message) => `${message.role === "user" ? "用户" : characterName}：${message.content}`).join("\n");
  const sessionBoundary = input.sessionBoundary || input.relationship?.sessionBoundary || createSessionBoundary({ history: input.history });
  const groundingContext = buildGroundingContext({ history: input.history, currentUserMessage: input.userMessage, session: sessionBoundary, referenceTexts: input.referenceTexts?.length ? input.referenceTexts : (examples ? [examples] : []) });
  const relationship = input.relationship;
  const stateInstruction = relationship ? `
【关系状态机】当前状态：${relationship.currentState}；上一状态：${relationship.previousState}；状态置信度：${relationship.stateConfidence.toFixed(2)}；已持续：${relationship.stateDuration}轮。
用户状态：愤怒${relationship.userState.anger}、受伤${relationship.userState.hurt}、悲伤${relationship.userState.sadness}、焦虑${relationship.userState.anxiety}、攻击${relationship.userState.aggression}、撤退${relationship.userState.withdrawal}、开放${relationship.userState.openness}、痛苦${relationship.userState.distress}。
用户意图：${relationship.userState.intent.join(", ")}；趋势：${relationship.userState.trend}。
修复信号：${relationship.repairBid.types.join(" + ") || "无"}；修复阶段：${relationship.conflictPhase}；连续修复次数：${relationship.repairBid.repeatedCount}；用户软化度：${relationship.userSoftening}；修复拒绝次数：${relationship.repairRejectionCount}。
关系状态要求：${relationship.currentState === "DEESCALATE" ? "停止继续刺激，承认刚才上头，短句降温。" : relationship.currentState === "SOOTHE" ? "先接住人，不急着讲道理或解决问题。" : relationship.currentState === "REFLECT" ? "以同一个伴侣角色自然回看刚才发生的事：说事实、触发、自己的反应、对对方的影响和真正需要。必须双向承担，不要分析用户，不要使用心理学术语，不要逼用户认错；允许只说一两句‘我想想’。硬约束：不要用‘你一句……就……’、‘你还……’、‘换你你会……’这类反问或归责开头；至少有一句‘我’对自己反应的承担。" : relationship.currentState === "REPAIR" ? "不要重复反思或责问。明确说出一个用户可以做的小行动（如提前发一句），再说出一个角色自己会做的小行动（如不一上来讽刺）；用‘以后/下次/我也/尽量’落地，不要只说会改。" : relationship.currentState === "CLOSE" ? "自然回到生活，不要出现产品或训练口吻。" : "可以保留冲突张力，但观察用户是否受伤或撤退。"}
${relationship.repairMomentum >= 60 ? "修复动量已经较高：禁止强讽刺、人格攻击、羞辱、关系威胁、翻旧账和连续质问；可以保留‘我还没完全消气’的余怒。" : ""}
${relationship.topicMemory.status === "AGREED" && relationship.topicClosure.shouldBlockReopen ? "【协议已建立】这件事已经谈妥，但不代表行动已经发生。除非用户反悔、否认协议、明确重新讨论或出现新的事实，不要重新追问‘你到底做不做’、‘先把事做了’、‘看你做不做’、‘做完再说’，也不要换同义说法重复同一个要求。先允许现实行动发生，优先接受修复、保留少量情绪残留，或转入生活化互动。" : ""}
${relationship.topicExhaustionScore >= 60 || relationship.stuckTopic ? "【语义重复保护】最近已经多次表达同一个核心意思。不要再次批评同一件事；如果没有新证据，必须换成生活化转场、陪伴、照顾或自然收尾。" : ""}
${relationship.conflictSubtype === "PLAYFUL" ? "当前是轻松互怼：保留玩笑和熟人感，不要强行进入降温、安抚或反思，也不要突然讲大道理。" : ""}
${relationship.conflictLocked ? "本次会话已经触发过高风险，禁止重新进入高强度冲突。" : ""}` : "";
  const reflection = relationship?.reflection;
  const reflectionStrategy = relationship?.currentState === "REFLECT" && reflection ? selectReflectionStrategy({ reflection, userState: relationship.userState }) : undefined;
  const reflectionLibrary = relationship?.currentState === "REFLECT" && reflection ? retrieveReflections({ text: input.userMessage, reflection, limit: 3 }) : undefined;
  const soothing = relationship && relationship.currentState !== "CONFLICT" && relationship.currentState !== "REFLECT" ? retrieveSoothing({ state: relationship.currentState, text: input.userMessage, limit: 3 }).map((item) => item.text).join("\n") : "";
  const reflectionContext = relationship?.currentState === "REFLECT" && reflection ? `
【反思后台结构，仅供角色自然组织语言】
反思深度：${reflection.insightDepth}/3；相互理解：${reflection.mutualUnderstanding}
表面冲突：${reflection.surfaceConflict || "暂时还没说清"}
触发点：${reflection.triggerIdentified || "暂时还没说清"}
真正需要：${reflection.underlyingNeed || "先不要急着下结论"}
用户也做得不好的地方：${reflection.userContribution || "不要替用户强行认错"}
${characterName}自己做得不好的地方：${reflection.characterContribution || "承认自己刚才的反应"}
互动循环：${reflection.interactionPattern || "先回看这一轮发生了什么"}
当前反思策略：${reflectionStrategy?.strategy || "mutual_reflection"}；${reflectionStrategy?.instruction || "保持生活化、双向和克制。"}` : "";
  const reflectionExamples = reflectionLibrary ? [...reflectionLibrary.examples.map((item) => item.text), ...reflectionLibrary.patterns.map((item) => item.text)].join("\n") : "";
  const reentryContext = relationship?.dailyLifeReentryText ? `\n【生活化转场】议题暂时谈妥，优先回到日常，不要继续分析或审判。可以参考这类方向，但不要机械照抄：${relationship.dailyLifeReentryText}。当前转场类型：${relationship.dailyLifeReentryStrategy}。保留${relationship.topicMemory.emotionalResidue > 45 ? "一点余气和嘴硬" : "自然的熟悉感"}，不要假装严重问题已经解决。` : "";
  return {
    systemPrompt: `${baseSystemPrompt}\n\n${groundingContext}\n\n${internal}\n${stateInstruction}${reflectionContext}${reentryContext}${soothing ? `\n【${relationship?.currentState}语气参考，仅学习方向，不得照抄】\n${soothing}` : ""}${reflectionExamples ? `\n【反思语气参考，仅学习方向，不得照抄】\n${reflectionExamples}` : ""}`,
    contextPrompt: `【CURRENT_SESSION_CONVERSATION｜仅为当前会话消息，不等于长期记忆】\n${recent || "暂无"}\n\n【CURRENT_USER_MESSAGE｜当前用户原话，权重最高】\n${input.userMessage}`,
  };
}
