import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "data/reflection");
mkdirSync(root, { recursive: true });

const situations = [
  ["晚回来", "我一直等不到你的消息"], ["没回消息", "我一个人猜了很久"], ["答应的事情没做到", "我觉得自己又被放到后面了"], ["你说我无理取闹", "我一下就炸了"],
  ["你一直解释", "我越听越觉得你在找理由"], ["我开始翻旧账", "你就更不想说了"], ["我语气很冲", "你后来也不愿意接着讲"], ["你突然沉默", "我就更慌、更想追问"],
  ["我说随便", "其实我根本没有真的不在乎"], ["我敷衍说对不起", "你听起来就更委屈了"], ["你没有马上回应", "我把沉默理解成了不在乎"], ["我一直追着问", "你只能先自我保护"],
  ["你回来得很晚", "我真正等的是一句提前说明"], ["我们都在讲道理", "却没有人在听对方害怕什么"], ["我说话带了刺", "你就开始防御"], ["你说先冷静", "我听成了你不想管这段关系"],
  ["我把事情说得很绝", "你就不敢再靠近"], ["你一直道歉", "我却没有把真正介意的地方说出来"], ["我想让你认错", "结果两个人都只想证明自己有理"], ["我们又绕回同一个问题", "其实都在等对方先在乎我"],
] as const;

const voices = [
  "我现在想想，刚才我确实有点上头。",
  "好像不是这件小事本身，是我把它理解成你不在乎我了。",
  "你越解释我越追着问，后来你越不想说，我就越觉得你在躲。",
  "我刚才其实没有给你把话说完的机会，这部分我也有问题。",
  "我一着急就开始翻旧账，结果真正想让你听见的东西反而没说出来。",
  "嗯……你这么说以后，我好像能看见刚才是怎么一步步变糟的了。",
  "我嘴上说随便，心里其实是在等你主动问我到底怎么了。",
  "我们刚才都在自我保护，所以谁也没有真的接住谁。",
  "我不是要把你分析明白，我是在想我自己刚才为什么那么说。",
  "我现在才发现，我一直在逼你立刻认错，却没有先把我的需要说清楚。",
] as const;

const examples = situations.flatMap(([event, impact], situationIndex) => voices.map((voice, voiceIndex) => ({
  id: `reflection-${String(situationIndex * voices.length + voiceIndex + 1).padStart(3, "0")}`,
  text: `${voice}刚才是${event}，${impact}。`,
  tags: [event, impact, voiceIndex % 2 ? "互动模式" : "自我承担"],
  depth: (voiceIndex % 3 + 1) as 1 | 2 | 3,
  sourceType: "synthetic" as const,
})))
  .slice(0, 200);

const triggers = situations.map(([event, impact], index) => ({ id: `trigger-${String(index + 1).padStart(3, "0")}`, event, impact, sourceType: "synthetic" as const }));
const interactionPatterns = [
  "追问 → 防御 → 更强追问 → 敷衍 → 爆发",
  "表达不安 → 解释理由 → 把解释听成敷衍 → 继续争执",
  "一个人沉默 → 另一个人更焦虑 → 追问升级 → 两个人都想逃",
  "说重话 → 对方防御 → 自己更受伤 → 继续翻旧账",
  "想被在乎 → 用讽刺试探 → 对方听见指责 → 关系更远",
  "先道歉结束 → 真正需要没说 → 同一件事再次爆发",
  "只争表面事实 → 忽略被忽视的感受 → 谁也不觉得被理解",
  "一方想立刻解决 → 一方需要先缓缓 → 节奏不一致而升级",
  "解释太多 → 情绪被跳过 → 受伤的人开始攻击",
  "冷处理 → 猜测变多 → 重新见面时一次性爆发",
].map((text, index) => ({ id: `pattern-${String(index + 1).padStart(3, "0")}`, text, tags: ["互动模式", "关系循环"], sourceType: "synthetic" as const }));
const underlyingNeeds = [
  "被重视、被提前告知", "被听见，而不是只被纠正", "确定自己在关系里不是可有可无", "被理解自己的等待和不安", "拥有可以放心表达的空间",
  "对方愿意把真实安排告诉自己", "争执时仍然觉得关系是安全的", "不用通过生气才能得到回应", "在受伤时先被接住", "两个人都愿意承担自己的那一部分",
].map((text, index) => ({ id: `need-${String(index + 1).padStart(3, "0")}`, text, tags: ["底层需要", "关系期待"], sourceType: "synthetic" as const }));

writeFileSync(resolve(root, "reflection-examples.json"), `${JSON.stringify(examples, null, 2)}\n`);
writeFileSync(resolve(root, "reflection-triggers.json"), `${JSON.stringify(triggers, null, 2)}\n`);
writeFileSync(resolve(root, "interaction-patterns.json"), `${JSON.stringify(interactionPatterns, null, 2)}\n`);
writeFileSync(resolve(root, "underlying-needs.json"), `${JSON.stringify(underlyingNeeds, null, 2)}\n`);
console.log(`generated ${examples.length} reflection examples`);
