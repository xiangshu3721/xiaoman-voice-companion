import type { EmotionPerformancePlan } from "./types";

const instructions: Record<EmotionPerformancePlan["primaryEmotion"], string> = {
  neutral: "像熟悉的伴侣日常说话，自然、清楚，不要播音腔。",
  annoyed: "这是情侣争执里的不耐烦：稍快、短促，像已经解释过很多遍，不要喊叫。",
  restrained_anger: "说话者在压着火，音量不一定高，但字要咬重，停顿短而硬，有压迫感。",
  sarcastic_anger: "说话者明显在讽刺伴侣，表面平静但字里带刺，关键词重读，尾音略往下压，带一点冷笑感。",
  explosive_anger: "这是争吵中突然爆发的一句，能量和语速突然上来，关键词重读，但不要整句一直尖叫。",
  hurt_anger: "生气里夹着委屈和被忽视的受伤，前半压着，后半情绪顶上来，不要演成纯愤怒。",
  cold_anger: "刚刚还在争吵但现在心冷了，声音降低、语速变慢、句子短，不想再争辩，不要大喊。",
  disbelief: "难以置信地反问，先停一下再说，像真的听不懂对方为什么这么讲。",
  impatient: "明显不耐烦，语速略快，句尾收得利落，像想把话说完。",
  contemptuous: "带一点轻蔑和熟人间的刺，但不要夸张或像反派。",
  hurt: "有受伤和失望，声音收一点，保留自然停顿，不要哭腔主播化。",
  sad: "有低落和委屈，速度稍慢、音量稍低，像说到心里但还在撑着。",
  softening: "刚刚吵过但对方递了台阶，仍有一点余气，后半句明显收住，不再攻击。",
  warm: "熟悉的伴侣重新回到日常，温和但不甜腻，不要客服腔。",
  playful: "嘴硬里有一点玩笑和亲近感，像关系缓过来了，不要短视频配音腔。",
  reflective: "像熟悉的伴侣慢慢回想刚才发生的事，清醒、真诚、略慢，不要心理咨询师腔。",
};

export function buildTTSInstruction(plan: EmotionPerformancePlan, text: string) {
  const pause = plan.delivery.pauseStyle === "none" ? "保留原有标点。" : "请完整保留……、，、？、！和短句带来的自然停顿。";
  return `这是亲密关系中的一句真实口语。${instructions[plan.primaryEmotion]}${pause}不要平静朗读，不要主播腔、客服腔或导航腔。文本：${text}`;
}
