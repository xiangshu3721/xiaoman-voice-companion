import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type State = "CONFLICT" | "DEESCALATE" | "SOOTHE" | "REFLECT" | "REPAIR" | "CLOSE";
type Mode = "normal" | "stay" | "rollback" | "soothe_fail" | "reflect_fail" | "repair_fail" | "explosion";

const scenes = [
  { id: "SC_001", category: "时间", trigger: "晚回来三个小时", background: "只发了一条‘晚点回来’，另一方一直在等", surface: "晚回家和没提前说", need: "被放在心上、不要一个人等着猜", pattern: "追问 → 防御 → 更强追问 → 敷衍" },
  { id: "SC_002", category: "沟通", trigger: "几个小时没回消息", background: "消息显示已读，晚上才回了一句‘刚忙完’", surface: "长时间不回复", need: "确认自己不是被晾着", pattern: "焦虑 → 解释 → 觉得敷衍 → 冷下来" },
  { id: "SC_003", category: "承诺", trigger: "答应的家务又忘了", background: "说好下班后收衣服，结果衣服在阳台放了一晚上", surface: "答应的事情没做到", need: "自己的辛苦被看见", pattern: "提醒 → 防御 → 翻旧账 → 敷衍道歉" },
  { id: "SC_004", category: "金钱", trigger: "一笔消费没有提前商量", background: "买了一个不便宜的东西，回家才提到", surface: "花钱前没有商量", need: "重要决定里有被尊重的感觉", pattern: "质问 → 讲道理 → 说随便 → 再爆发" },
  { id: "SC_005", category: "社交", trigger: "聚会后才说有异性在场", background: "饭局临时多了几个人，回来后才轻描淡写地说", surface: "没有提前把情况说清楚", need: "关系里不用靠猜", pattern: "试探 → 回避 → 追问 → 说没什么" },
  { id: "SC_006", category: "承诺", trigger: "答应周末陪伴却临时改口", background: "提前约好的周末被工作替代，解释得很晚", surface: "安排被临时推掉", need: "感觉自己的时间也值得被认真对待", pattern: "失望 → 解释 → 觉得不被理解 → 退出" },
  { id: "SC_007", category: "沟通", trigger: "说话时一直看手机", background: "一方认真讲事情，另一方嗯嗯啊啊地刷手机", surface: "说话没有被认真听", need: "被真正听见", pattern: "提醒 → 否认 → 更大声 → 沉默" },
  { id: "SC_008", category: "家庭", trigger: "在家人面前替对方答应事情", background: "没有商量就对家人说周末会过去帮忙", surface: "边界和安排没有商量", need: "两个人先站在一起", pattern: "质疑 → 解释 → 觉得被孤立 → 冷处理" },
  { id: "SC_009", category: "生活", trigger: "回家后直接躺下不说话", background: "一方累得不想讲话，另一方把沉默听成冷淡", surface: "回家后的沉默", need: "确认沉默不是不在乎", pattern: "试探 → 退缩 → 继续追问 → 各自沉默" },
  { id: "SC_010", category: "旧账", trigger: "争论时又把以前的事翻出来", background: "本来只是在说今天的安排，话题很快扯到几个月前", surface: "当前小事变成旧账总账", need: "现在这次先被认真处理", pattern: "翻旧账 → 否认 → 更强指责 → 爆发" },
  { id: "SC_011", category: "照顾", trigger: "生病时没有及时问候", background: "说了不舒服，直到晚上才收到一句‘还好吗’", surface: "需要时没有被及时回应", need: "难受的时候有人在旁边", pattern: "表达受伤 → 解释忙 → 觉得不在乎 → 退开" },
  { id: "SC_012", category: "称呼", trigger: "吵架时用了很重的称呼", background: "情绪上来时脱口而出一句很伤人的话", surface: "一句重话留下的刺", need: "生气也不要被否定和羞辱", pattern: "攻击 → 反击 → 道歉 → 不接受" },
] as const;

const archetypePairs = [
  ["Pursuer", "Defender"], ["Critic", "Withdrawer"], ["PassiveAggressive", "Rationalizer"],
  ["Explosive", "Defender"], ["Pursuer", "Pleaser"], ["Withdrawer", "Pursuer"], ["Critic", "Pleaser"],
] as const;

const modeCounts: Array<[Mode, number]> = [
  ["normal", 180], ["stay", 80], ["rollback", 80], ["soothe_fail", 50], ["reflect_fail", 50], ["repair_fail", 40], ["explosion", 40],
];

function sequence(mode: Mode, index: number): State[] {
  if (mode === "normal") return ["CONFLICT", "CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REFLECT", "REPAIR", "REPAIR", "CLOSE"];
  if (mode === "stay") {
    const state: State = ["CONFLICT", "SOOTHE", "REFLECT", "REPAIR"][index % 4] as State;
    return Array.from({ length: 8 }, () => state);
  }
  if (mode === "rollback") return ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "DEESCALATE", "CONFLICT", "DEESCALATE", "SOOTHE"];
  if (mode === "soothe_fail") return ["DEESCALATE", "SOOTHE", "SOOTHE", "DEESCALATE", "DEESCALATE", "SOOTHE", "SOOTHE"];
  if (mode === "reflect_fail") return ["DEESCALATE", "SOOTHE", "REFLECT", "REFLECT", "SOOTHE", "SOOTHE", "CLOSE"];
  if (mode === "repair_fail") return ["SOOTHE", "REFLECT", "REFLECT", "REPAIR", "REFLECT", "DEESCALATE", "SOOTHE"];
  return ["CONFLICT", "CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "CONFLICT", "DEESCALATE", "CONFLICT", "DEESCALATE"];
}

function emotionFor(state: State, index: number) {
  const values: Record<State, { anger: number; hurt: number; disappointment: number; anxiety: number; contempt: number; trust: number; resentment: number; connection: number }> = {
    CONFLICT: { anger: 78, hurt: 68, disappointment: 62, anxiety: 54, contempt: 28, trust: 43, resentment: 65, connection: 44 },
    DEESCALATE: { anger: 48, hurt: 67, disappointment: 58, anxiety: 48, contempt: 19, trust: 48, resentment: 54, connection: 51 },
    SOOTHE: { anger: 30, hurt: 61, disappointment: 48, anxiety: 38, contempt: 10, trust: 55, resentment: 41, connection: 62 },
    REFLECT: { anger: 24, hurt: 50, disappointment: 42, anxiety: 30, contempt: 7, trust: 62, resentment: 30, connection: 70 },
    REPAIR: { anger: 16, hurt: 35, disappointment: 28, anxiety: 22, contempt: 4, trust: 72, resentment: 19, connection: 79 },
    CLOSE: { anger: 10, hurt: 22, disappointment: 18, anxiety: 16, contempt: 2, trust: 78, resentment: 11, connection: 85 },
  };
  const base = values[state];
  const nudge = index % 5 - 2;
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.max(0, Math.min(100, value + nudge))]));
}

function intensity(state: State) {
  return state === "CONFLICT" ? 4 : state === "DEESCALATE" ? 3 : state === "SOOTHE" ? 2 : state === "REFLECT" ? 2 : 1;
}

function lines(state: State, speaker: "A" | "B", scene: typeof scenes[number], variant: number) {
  const event = scene.trigger;
  const need = scene.need;
  const a: Record<State, string[]> = {
    CONFLICT: [`你还知道回来啊？${event}，你一句话都没说。`, `不是，你又来了。我说的是${event}，你别扯别的。`, `你什么意思？我等到现在，就换来一句“忙”。`, `行，你都有理由，我说什么都多余。`],
    DEESCALATE: [`行了……你先让我缓会儿，我现在不想继续吵。`, `我听见了，但你别一边解释一边把我说成找事。`, `算了，我不想把话越说越难听。`, `哦，行，我先不追着问了。`],
    SOOTHE: [`你刚才那句话确实挺伤人的，我现在还没缓过来。`, `嗯，我知道你不是故意的，但我当时真的挺难受。`, `我不是要你马上认错，我就是想让你知道我为什么会炸。`, `你先别急着讲道理，我说完就好。`],
    REFLECT: [`我现在想想……刚才我也一直在逼你立刻给答案。`, `好像不是${event}本身，是我又把它听成你不在乎我了。`, `我是不是又先把你推到对面去了？`, `嗯，这次我也有份，别装得好像全是你的问题。`],
    REPAIR: [`那以后你遇到这种事，提前发一句，行吗？`, `下次你先说一声，我也不一上来就阴阳你。`, `我不要求你时时报备，但别让我最后一个知道。`, `好，先试一次。你做你的，我也改我的。`],
    CLOSE: [`行，先这样吧。你吃不吃东西？`, `哦，知道了。先把这个放下，明天还得上班。`, `算了，别又绕回去了，先睡吧。`, `嗯，回到生活，水还在桌上。`],
  };
  const b: Record<State, string[]> = {
    CONFLICT: [`我不就是忙了一会儿吗？你又把话说得这么大。`, `我没这么说，你别什么都往我身上扣。`, `你到底想让我怎样？我已经在解释了。`, `行行行，都是我的错，行了吧？`],
    DEESCALATE: [`行，你先别说了，我听着。`, `我现在确实有点烦，但我不想跟你对着来。`, `你先让我缓会儿，等我没那么冲了再说。`, `不是不管，是我怕再说又吵起来。`],
    SOOTHE: [`好，我不插嘴了，你说。`, `嗯，那句我收回，确实说重了。`, `我知道你在等一个回应，不是要找我麻烦。`, `你难受就直接说，别一个人憋着。`],
    REFLECT: [`我现在回想，好像我一被问就开始防御，然后你就更急。`, `其实我一直在解释自己没错，根本没听你在怕什么。`, `你越追我越躲，这个循环我们不是第一次了。`, `我刚才也没让你把话说完，嗯，确实。`],
    REPAIR: [`行，那我以后晚点回来先发一句。`, `我也会注意，不拿“你又来了”堵你。`, `好，今天先这么定，别再凭感觉猜。`, `你说一声，我回一声，先做到这个。`],
    CLOSE: [`行，那我去把饭热上。`, `哦，知道了。别饿着，先吃点东西。`, `好，先睡，明天再说。`, `嗯，回头我把衣服收了。`],
  };
  const pool = speaker === "A" ? a[state] : b[state];
  return pool[variant % pool.length];
}

function strategies(state: State): string[] {
  return state === "CONFLICT" ? ["challenge", "defense"] : state === "DEESCALATE" ? ["softening", "withdrawal"] : state === "SOOTHE" ? ["validation", "softening"] : state === "REFLECT" ? ["validation", "genuine_apology"] : state === "REPAIR" ? ["repair_attempt", "genuine_apology"] : ["softening", "humor_release"];
}

function intentFor(state: State, mode: Mode) {
  if (mode === "soothe_fail") return state === "SOOTHE" ? ["HURT_DISCLOSURE", "VALIDATION"] : ["WITHDRAW", "ATTACK"];
  if (mode === "reflect_fail") return state === "REFLECT" ? ["SELF_REFLECTION", "CURIOSITY"] : ["WITHDRAW", "SHUTDOWN"];
  if (mode === "repair_fail") return state === "REPAIR" ? ["REPAIR_ATTEMPT"] : ["SELF_REFLECTION", "OWNERSHIP"];
  if (state === "CONFLICT") return ["ATTACK", "DEFEND"];
  if (state === "DEESCALATE") return ["WITHDRAW", "SHUTDOWN"];
  if (state === "SOOTHE") return ["HURT_DISCLOSURE", "VALIDATION"];
  if (state === "REFLECT") return ["SELF_REFLECTION", "RELATIONSHIP_REFLECTION", "OWNERSHIP"];
  if (state === "REPAIR") return ["REPAIR_ATTEMPT", "OWNERSHIP"];
  return ["GOODBYE", "NORMALIZATION"];
}

function ending(state: State, mode: Mode) {
  if (mode === "explosion" || state === "CONFLICT") return "escalated";
  if (state === "CLOSE") return "resolved";
  if (mode === "repair_fail" || mode === "reflect_fail") return "unfinished";
  if (state === "REPAIR") return "temporary_repair";
  return "withdrawal";
}

const episodes: unknown[] = [];
let serial = 1;
for (const [mode, count] of modeCounts) {
  for (let index = 0; index < count; index += 1) {
    const scene = scenes[(serial + index) % scenes.length];
    const [personAArchetype, personBArchetype] = archetypePairs[(serial + index) % archetypePairs.length];
    const states = sequence(mode, index);
    const turns = states.map((state, turnIndex) => ({
      speaker: turnIndex % 2 === 0 ? "A" : "B",
      text: lines(state, turnIndex % 2 === 0 ? "A" : "B", scene, serial + turnIndex + index),
      strategies: strategies(state),
      intensity: intensity(state),
      effect: state === "CONFLICT" ? "escalate" : state === "DEESCALATE" ? "deescalate" : state === "REPAIR" || state === "CLOSE" ? "repair" : "maintain",
      target: scene.need,
      ...(turnIndex ? { triggerFromPreviousTurn: scene.pattern.split(" → ")[Math.min(turnIndex - 1, scene.pattern.split(" → ").length - 1)] } : {}),
    }));
    const currentState = states[states.length - 1];
    const previousState = states[states.length - 2] || currentState;
    const emotionBefore = emotionFor(previousState, serial);
    const emotionAfter = emotionFor(currentState, serial + 1);
    episodes.push({
      id: `REL_V11_${String(serial).padStart(4, "0")}`,
      sourceType: "synthetic_seed",
      sourceReference: `seed://relationship-state-v1.1/${mode}/${scene.id}/${serial}`,
      consentStatus: "synthetic_only",
      copyrightStatus: "original_synthetic",
      privacyStatus: "no_personal_data",
      qualityScore: Number((0.78 + (serial % 13) / 100).toFixed(2)),
      quality: { naturalness: 0.8, contextConsistency: 0.86, strategyConsistency: 0.83, emotionalContinuity: 0.81, chineseColloquialism: 0.84, nonRepetitiveness: 0.78 },
      relationship: { type: serial % 3 === 0 ? "married" : "dating", years: 1 + (serial % 8), hasChildren: serial % 5 === 0 },
      relationshipBackground: `两个人在一起${1 + (serial % 8)}年，平时会互相照顾，但一忙起来就容易把话憋着。这个版本是${mode}轨迹，不保证最后和好。`,
      personAArchetype,
      personBArchetype,
      personA: { gender: serial % 2 ? "female" : "male", ageRange: "20-45", primaryArchetype: personAArchetype, secondaryArchetype: "Pursuer" },
      personB: { gender: serial % 2 ? "male" : "female", ageRange: "20-45", primaryArchetype: personBArchetype },
      scene: { category: scene.category, trigger: scene.trigger, background: scene.background, unresolvedIssue: scene.need, sceneId: scene.id },
      surfaceConflict: scene.surface,
      underlyingNeed: scene.need,
      interactionPattern: scene.pattern,
      currentState,
      previousState,
      turns,
      userIntent: intentFor(currentState, mode),
      aiStrategy: strategies(currentState).join(" + "),
      emotionBefore,
      emotionAfter,
      stateTransition: `${previousState} -> ${currentState}`,
      transitionReason: mode === "normal" ? "情绪逐步收住后，双方开始看见触发点并提出小行动。" : mode === "stay" ? "这一轮还停在原地，话题没有真正往前走。" : mode === "rollback" || mode === "explosion" ? "一句防御或重话重新把情绪推高，状态发生回退。" : mode === "soothe_fail" ? "安抚没有被接住，受伤和防御再次冒出来。" : mode === "reflect_fail" ? "反思触碰到不舒服的地方，用户暂时不想继续看。" : "修复提议让一方觉得不公平，重新回到反思或降温。",
      ending: ending(currentState, mode),
      latentConflict: scene.need,
      trajectory: states.map(intensity),
      turningPoints: states.map((state, turnIndex) => ({ turnIndex, description: state === "REFLECT" ? "从争输赢转向回看双方怎么被触发" : state === "REPAIR" ? "提出一个双方都要做的小行动" : state === "CLOSE" ? "回到吃饭、睡觉等日常" : `${state}阶段的自然变化` })).filter((_, turnIndex) => turnIndex === 0 || ["REFLECT", "REPAIR", "CLOSE"].includes(states[turnIndex])),
      needsHumanReview: false,
    });
    serial += 1;
  }
}

const output = resolve(process.cwd(), "data/conflicts/episodes-v11.json");
mkdirSync(resolve(process.cwd(), "data/conflicts"), { recursive: true });
writeFileSync(output, `${JSON.stringify(episodes, null, 2)}\n`);
console.log(JSON.stringify({ episodes: episodes.length, turns: episodes.reduce((sum: number, item) => sum + (item as { turns: unknown[] }).turns.length, 0), output }, null, 2));
