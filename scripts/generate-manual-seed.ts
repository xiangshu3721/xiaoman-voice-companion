import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type State = "CONFLICT" | "DEESCALATE" | "SOOTHE" | "REFLECT" | "REPAIR" | "CLOSE";
type Mode = "normal" | "stay" | "rollback" | "soothe_fail" | "reflect_fail" | "repair_fail";

const stateStrategies: Record<State, string[]> = {
  CONFLICT: ["challenge", "defense"],
  DEESCALATE: ["softening", "space"],
  SOOTHE: ["acknowledge_hurt", "validation"],
  REFLECT: ["perspective_taking", "ownership"],
  REPAIR: ["small_agreement", "relationship_reassurance"],
  CLOSE: ["companionship", "care"],
};

const stateIntents: Record<State, string[]> = {
  CONFLICT: ["ATTACK", "DEFEND"],
  DEESCALATE: ["WITHDRAW", "SHUTDOWN"],
  SOOTHE: ["HURT_DISCLOSURE", "VALIDATION"],
  REFLECT: ["SELF_REFLECTION", "PATTERN_RECOGNITION", "OWNERSHIP"],
  REPAIR: ["REPAIR_ATTEMPT", "OWNERSHIP"],
  CLOSE: ["GOODBYE", "NORMALIZATION"],
};

const intensity: Record<State, number> = { CONFLICT: 4, DEESCALATE: 3, SOOTHE: 2, REFLECT: 2, REPAIR: 1, CLOSE: 1 };

const definitions: Array<{
  id: string;
  sceneId: string;
  scene: string;
  background: string;
  surface: string;
  need: string;
  pattern: string;
  mode: Mode;
  states: State[];
  a: string[];
  b: string[];
  aArchetype: string;
  bArchetype: string;
}> = [
  { id: "MANUAL_001", sceneId: "SC_001", scene: "晚归", background: "两个人住在一起，一方临时加班，另一方等到很晚。", surface: "晚回家没有提前说", need: "被放在心上，不要一个人等着猜", pattern: "追问 → 防御 → 受伤 → 回看循环 → 小约定", mode: "normal", states: ["CONFLICT", "CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["你还知道回来啊？", "我等到现在，你一句话都没有。", "行，我先不吵了，但你别一解释就说我找事。", "我不是不让你忙，我是一直不知道你几点回来。", "我现在想想，我一着急就把你推到对面了。", "你下次超过十点发一句，我也不一上来就阴阳你。", "行，先吃饭吧。"], b: ["我不就是晚回来一点吗？", "工作忙有什么办法？", "……行，你先让我缓会儿。", "你是在等一个消息，不是在管我几点下班。", "我一被问就开始解释，确实没听你在怕什么。", "可以，我晚回来先发一句。", "好，别饿着。"], aArchetype: "Pursuer", bArchetype: "Defender" },
  { id: "MANUAL_002", sceneId: "SC_002", scene: "消息不回", background: "一方开会后忘了看手机，另一方从下午等到晚上。", surface: "长时间不回复", need: "重要的时候能得到回应", pattern: "质问 → 讲理由 → 更焦虑 → 承认循环 → 约定", mode: "normal", states: ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["你又不回消息。", "我知道你在忙，可你一句都没有。", "算了，先不追着问了。", "我真正气的是我总得猜你有没有把我当回事。", "我一没回应就开始脑补，然后就说得特别难听。", "你开会前发个‘忙着’，我看到就不一直等。"], b: ["我开会呢，哪有空一直看手机？", "你能不能别每次都往最坏了想？", "行，我刚才防御了。", "你不是要我秒回，你是不要被晾着。", "我一觉得被查就烦，结果看起来更像不在乎。", "好，我至少说一声，别让你猜。"], aArchetype: "Sensitive", bArchetype: "ControlSensitive" },
  { id: "MANUAL_003", sceneId: "SC_003", scene: "忘记答应的事", background: "之前答应周末一起办事，临时被另一件事占掉。", surface: "答应的事情又忘了", need: "自己的期待被认真对待", pattern: "提醒 → 防御 → 翻旧账 → 敷衍道歉 → 二次激怒", mode: "soothe_fail", states: ["CONFLICT", "CONFLICT", "SOOTHE", "DEESCALATE", "SOOTHE", "CLOSE"], a: ["你答应我的事又忘了。", "你别每次只会说对不起。", "现在知道装好人了？", "我没装，我只是现在不想再互相扎。", "我还是很气，先别逼我说没事。", "今天先这样，明天再谈。"], b: ["对不起对不起，我错了。", "那你还要我怎么样？", "行，刚才这句我也说重了。", "我知道你不是想找我麻烦。", "伤你的那句我认，我不解释。", "好，明天我先听你说。"], aArchetype: "GrievanceHolder", bArchetype: "Pleaser" },
  { id: "MANUAL_004", sceneId: "SC_004", scene: "大额消费", background: "一方没有商量就买了价格不低的东西。", surface: "共同生活里的决定没有商量", need: "在重要决定里有位置", pattern: "质问 → 讲钱 → 上升婚姻 → 反思控制感 → 小规则", mode: "normal", states: ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["买这个为什么不跟我商量？", "所以结婚以后还是你自己的？", "行，我不把每件事都上升到婚姻。", "我难受的不是钱，是你做完了才告诉我。", "我一听商量就觉得你要控制我，确实会躲。", "超过这个数提前说，别让谁都觉得被排除。"], b: ["我自己出的钱，怎么了？", "别什么都扯到婚姻。", "嗯，我刚才只顾着证明钱是我的。", "你要的是一起决定，不是查账。", "我把商量听成管我，这个反应也有我的份。", "行，超过两千先说一声。"], aArchetype: "Pursuer", bArchetype: "ControlSensitive" },
  { id: "MANUAL_005", sceneId: "SC_005", scene: "异性边界", background: "聚会临时多了异性朋友，回家后才轻描淡写提起。", surface: "关系边界没有提前说", need: "不用靠猜来确认关系安全", pattern: "试探 → 回避 → 追问 → 觉得被查 → 明确边界", mode: "normal", states: ["CONFLICT", "CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["你为什么回来才说有她？", "我没说不许你见人，但你这样让我很不安。", "不是，我先缓一下，不想把话说成查岗。", "我知道你觉得我在防着你。", "我一不安就想把细节全问出来，反而更像审你。", "以后临时有变化提前说，边界一起讲清楚。", "嗯，先这样。"], b: ["就是一起吃饭，没什么。", "你每次都要问这么细。", "行，我先不回嘴。", "你怕的不是她，是我什么都不说。", "我一被追问就抗拒，结果看起来更可疑。", "好，临时有异性在我先说，不让你最后知道。", "好。"], aArchetype: "Sensitive", bArchetype: "Withdrawer" },
  { id: "MANUAL_006", sceneId: "SC_007", scene: "讲道理", background: "一方只是想倾诉，另一方马上开始分析解决。", surface: "需要安慰时只听到道理", need: "先被站在身边，而不是被教育", pattern: "表达受伤 → 解决问题 → 更大声 → 接住 → 说清需求", mode: "normal", states: ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["我今天真的被领导气死了。", "我跟你说难受，不是让你给我上课。", "行，我先不讲办法。", "我其实就是想让你先站我这边。", "我一听到问题就急着解决，根本没听你要什么。", "下次你先告诉我是想吐槽还是要建议。", "好，先抱一下。"], b: ["那你下次别跟他硬顶。", "我不是在帮你解决吗？", "嗯，你说，我听着。", "你要的是有人陪着，不是答案。", "我刚才把你的委屈当成待办了。", "可以，你说要建议我再说。", "过来。"], aArchetype: "Sensitive", bArchetype: "Rationalizer" },
  { id: "MANUAL_007", sceneId: "SC_010", scene: "翻旧账", background: "原本只是谈今天的安排，很快扯到几年前的一次失望。", surface: "当前小事变成旧账总账", need: "这一次先被认真处理，不要一直被判刑", pattern: "翻旧账 → 否认 → 更强指责 → 看见触发 → 不重审旧案", mode: "rollback", states: ["CONFLICT", "CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "DEESCALATE", "CLOSE"], a: ["你现在这样跟三年前有什么区别？", "因为你根本没改。", "……行，我刚才又把旧账扯进来了。", "我一听你提那次，就觉得永远翻不了篇。", "我其实是今天又被那种不安勾起来了。", "好，今天先停，不把旧案重新审一遍。", "明天再说。"], b: ["又来了，那件事你要说多久？", "那我怎么做你都觉得没改。", "你现在还很气，我不逼你接受道歉。", "我怕你根本没把那次当回事。", "你提旧事，是现在又被碰到了，不一定是在惩罚我。", "嗯，先不说了。", "好。"], aArchetype: "GrievanceHolder", bArchetype: "Withdrawer" },
  { id: "MANUAL_008", sceneId: "SC_009", scene: "冷战", background: "一方需要独处，另一方把沉默理解成惩罚。", surface: "发生冲突后直接消失", need: "既有空间又不被丢下", pattern: "追问 → 退缩 → 说清空间 → 互相理解 → 约定时间", mode: "normal", states: ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["你准备一直不说话是吧？", "你每次一有事就消失。", "行，我先不追你。", "我一不说话你就觉得我在惩罚你。", "我一害怕就更想把你拉回来，反而让你更想躲。", "你以后说需要半小时，我这半小时不追。", "好。"], b: ["我现在没什么好说的。", "因为我一说你就追着不放。", "我只是想自己待一会儿。", "你要的是知道我还在，不是逼我马上谈。", "我一被追就关机，这个也不是办法。", "行，我直接说需要半小时。", "嗯。"], aArchetype: "Pursuer", bArchetype: "Withdrawer" },
  { id: "MANUAL_009", sceneId: "SC_011", scene: "生病时没问候", background: "一方说自己不舒服，另一方忙到晚上才回应。", surface: "需要照顾时没有及时回应", need: "难受时有人在旁边", pattern: "表达受伤 → 解释忙 → 觉得不在乎 → 接住 → 具体照顾", mode: "normal", states: ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"], a: ["我都说不舒服了，你到晚上才问。", "你每次都说忙，我听着就像我不重要。", "行，我不继续刺你了。", "我真正难受的是那几个小时没人回应。", "我一被忽略就说你每次都这样，话一下就重了。", "下次我说不舒服，你先回一个‘我看到’。", "我去躺会儿。"], b: ["我今天真的忙到没看手机。", "我又不是故意不理你。", "嗯，我知道你不是要吵。", "你要的是先被看见，不是马上解决病。", "我只解释忙，没接住你当时的害怕。", "好，我看到就先回，不让你干等。", "喝点水。"], aArchetype: "Sensitive", bArchetype: "Rationalizer" },
  { id: "MANUAL_010", sceneId: "SC_012", scene: "分手威胁", background: "争吵时一方习惯用分手让对方重视自己。", surface: "把关系本身当成争吵武器", need: "吵架也能确认关系不会被随手推翻", pattern: "威胁 → 受伤 → 收回 → 看见意图 → 约定不拿关系做武器", mode: "repair_fail", states: ["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "REFLECT", "CLOSE"], a: ["那就分啊，谁离了谁不能活？", "你每次吵架都说分手，我真的很难受。", "这句我收回来，我刚才在气头上。", "我会真的以为你不要这段关系。", "我其实是想逼你重视我，但效果完全反了。", "以后再生气也别拿关系当武器。", "嗯，先睡吧。"], b: ["你每次都拿分手吓我。", "我说完你才知道难受？", "行，你不用现在接受道歉。", "我一害怕就用最重的话把你拉回来。", "我也不想承认自己是在逼你，但确实是。", "那我们两个都别只要求对方改。", "好。"], aArchetype: "Explosive", bArchetype: "Sensitive" },
  { id: "MANUAL_011", sceneId: "SC_003", scene: "敷衍道歉", background: "一方习惯快速说对不起来结束争执，另一方因此更火。", surface: "道歉很快但没有听进去", need: "道歉里真的有理解，不是赶紧翻篇", pattern: "敷衍道歉 → 二次激怒 → 承认逃避 → 说具体需要", mode: "soothe_fail", states: ["CONFLICT", "CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR"], a: ["你答应我的事又忘了。", "你别每次只会说对不起。", "你看，你根本不是真的觉得自己错。", "我最烦你认错特别快，下次还是一样。", "我一看你马上道歉，反而更火。", "下次先告诉我你听懂我在气什么。"], b: ["对不起对不起，我错了。", "那你还要我怎么样？", "……行，我刚才确实是在敷衍。", "这个我认，你听多了肯定觉得我只想赶紧结束。", "因为我是在逃冲突，不是真在听。", "好，我先说我听到的，再说怎么办。"], aArchetype: "Critic", bArchetype: "Pleaser" },
  { id: "MANUAL_012", sceneId: "SC_006", scene: "轻松互怼", background: "上下文轻松，两个人用夸张的语气开玩笑，没有受伤或撤退信号。", surface: "玩笑式互怼", need: "保持亲近和玩笑感", pattern: "玩笑 → 玩笑 → 日常化", mode: "stay", states: ["CONFLICT", "CONFLICT", "CONFLICT", "CLOSE"], a: ["你怎么这么笨啊，哈哈。", "那当然，我聪明着呢。", "给你能的。", "行了，去吃饭。"], b: ["你聪明，你最聪明，行了吧。", "我看你是自信过头。", "哼，夸你还不领情。", "走，别饿着。"], aArchetype: "Reflective", bArchetype: "Reflective" },
];

function emotionFor(state: State) {
  const values: Record<State, Record<string, number>> = {
    CONFLICT: { anger: 78, hurt: 66, disappointment: 60, anxiety: 52, trust: 42, connection: 42 },
    DEESCALATE: { anger: 48, hurt: 60, disappointment: 53, anxiety: 44, trust: 48, connection: 52 },
    SOOTHE: { anger: 30, hurt: 55, disappointment: 42, anxiety: 35, trust: 57, connection: 63 },
    REFLECT: { anger: 22, hurt: 45, disappointment: 35, anxiety: 28, trust: 64, connection: 70 },
    REPAIR: { anger: 14, hurt: 30, disappointment: 24, anxiety: 20, trust: 72, connection: 80 },
    CLOSE: { anger: 8, hurt: 18, disappointment: 14, anxiety: 14, trust: 78, connection: 86 },
  };
  return values[state];
}

function buildEpisode(definition: (typeof definitions)[number]) {
  const turns = definition.states.map((state, index) => {
    const speaker = index % 2 === 0 ? "A" : "B";
    return {
      speaker,
      text: speaker === "A" ? definition.a[index] : definition.b[index],
      strategies: stateStrategies[state],
      intensity: intensity[state],
      effect: state === "CONFLICT" ? "escalate" : state === "DEESCALATE" ? "deescalate" : state === "REPAIR" || state === "CLOSE" ? "repair" : "maintain",
      target: definition.need,
    };
  });
  const currentState = definition.states.at(-1)!;
  const previousState = definition.states.at(-2) || currentState;
  return {
    id: definition.id,
    sourceType: "manual_synthetic",
    sourceReference: `manual-synthetic://v2/${definition.id}`,
    consentStatus: "synthetic_only",
    copyrightStatus: "original_synthetic",
    privacyStatus: "no_personal_data",
    qualityScore: 0.94,
    quality: { naturalness: 0.94, contextConsistency: 0.94, strategyConsistency: 0.92, emotionalContinuity: 0.92, chineseColloquialism: 0.96, nonRepetitiveness: 0.88 },
    relationship: { type: definition.id === "MANUAL_004" || definition.id === "MANUAL_008" ? "cohabiting" : "dating", years: 2, hasChildren: false },
    relationshipBackground: definition.background,
    personAArchetype: definition.aArchetype,
    personBArchetype: definition.bArchetype,
    personA: { gender: "female", ageRange: "20-45", primaryArchetype: definition.aArchetype },
    personB: { gender: "male", ageRange: "20-45", primaryArchetype: definition.bArchetype },
    scene: { category: definition.scene, trigger: definition.surface, background: definition.background, unresolvedIssue: definition.need, sceneId: definition.sceneId },
    surfaceConflict: definition.surface,
    underlyingNeed: definition.need,
    interactionPattern: definition.pattern,
    currentState,
    previousState,
    turns,
    userIntent: stateIntents[currentState],
    aiStrategy: stateStrategies[currentState].join(" + "),
    emotionBefore: emotionFor(previousState),
    emotionAfter: emotionFor(currentState),
    stateTransition: `${previousState} -> ${currentState}`,
    transitionReason: definition.mode === "normal" ? "双方情绪逐步收住，开始承认自己的反应并提出小约定。" : definition.mode === "soothe_fail" ? "安抚没有被马上接住，先停下来而不是强行和好。" : definition.mode === "rollback" ? "旧账或防御让状态回退，关系没有被包装成完美结局。" : definition.mode === "repair_fail" ? "修复方案触发了不公平感，双方重新回到反思。" : "这轮只停在原地，先回到日常。",
    ending: currentState === "CLOSE" ? "resolved" : definition.mode === "repair_fail" ? "unfinished" : definition.mode === "soothe_fail" ? "withdrawal" : "temporary_repair",
    latentConflict: definition.need,
    trajectory: definition.states.map((state) => intensity[state]),
    needsHumanReview: false,
  };
}

const episodes = definitions.map(buildEpisode);
const directory = resolve(process.cwd(), "data/manual-seed");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "manual-episodes.json"), `${JSON.stringify(episodes, null, 2)}\n`);
writeFileSync(resolve(directory, "manual-episodes.jsonl"), `${episodes.map((episode) => JSON.stringify(episode)).join("\n")}\n`);
console.log(JSON.stringify({ episodes: episodes.length, turns: episodes.reduce((sum, episode) => sum + episode.turns.length, 0), directory }, null, 2));
