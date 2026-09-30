import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConflictEpisode, ConflictScene, ConflictStrategy, ConflictTurn, EmotionState } from "../src/conflict-engine/types";

const root = join(process.cwd(), "data", "conflicts");
mkdirSync(root, { recursive: true });

const scenes: ConflictScene[] = [
  { id: "SC_001", baseScenarioId: "late-home", category: "时间", title: "晚回家没有提前说", trigger: "比约定时间晚回家三个小时", background: "只发了一条晚点回来，另一方一直在等", unresolvedIssue: "类似情况之前发生过两次", keywords: ["晚回家", "迟到", "等", "提前说"] },
  { id: "SC_002", baseScenarioId: "no-reply", category: "沟通", title: "已读不回", trigger: "看到了消息却几个小时没有回复", background: "对方知道消息被看过，但等不到一句回应", unresolvedIssue: "回应是否被重视", keywords: ["已读", "不回", "消息", "回复"] },
  { id: "SC_003", baseScenarioId: "forgotten", category: "承诺", title: "答应的事情又忘了", trigger: "答应今天做的事情到晚上还没有做", background: "这件事已经被提醒过一次", unresolvedIssue: "承诺是否真的算数", keywords: ["答应", "忘记", "承诺", "没做到"] },
  { id: "SC_004", baseScenarioId: "free", category: "关系安全感", title: "突然说想一个人静静", trigger: "说最近不太想聊天，想一个人静静", background: "两个人最近本来就没有好好相处", unresolvedIssue: "关系里的连接感正在变弱", keywords: ["静静", "不想聊", "疏远", "安全感"] },
  { id: "SC_005", category: "沟通", title: "回复越来越敷衍", trigger: "连续几天只回几个字", background: "以前会认真分享一天发生的事", unresolvedIssue: "交流是不是只剩下应付", keywords: ["敷衍", "几个字", "聊天", "冷淡"] },
  { id: "SC_006", category: "沟通", title: "打电话一直不接", trigger: "连续打了三次电话都没有接", background: "对方没有说明自己在忙什么", unresolvedIssue: "紧急时刻能不能找到彼此", keywords: ["电话", "不接", "联系", "着急"] },
  { id: "SC_007", category: "沟通", title: "说话时一直看手机", trigger: "一边听对方说话一边低头刷手机", background: "这本来是难得的一次认真谈话", unresolvedIssue: "自己有没有被放在心上", keywords: ["看手机", "心不在焉", "听", "重视"] },
  { id: "SC_008", category: "时间", title: "临时改变周末计划", trigger: "临时把原定的周末安排换成了和朋友出去", background: "这次安排提前约了很久", unresolvedIssue: "谁的时间更值得被尊重", keywords: ["周末", "计划", "临时", "朋友"] },
  { id: "SC_009", category: "时间", title: "约会迟到很久", trigger: "约会迟到了四十分钟才出现", background: "没有提前说，也没有解释路线", unresolvedIssue: "等待是不是理所当然", keywords: ["约会", "迟到", "等待", "时间"] },
  { id: "SC_010", category: "时间", title: "工作占用纪念日", trigger: "在纪念日当天临时加班", background: "纪念日不是第一次被工作打断", unresolvedIssue: "关系是否总要给工作让路", keywords: ["纪念日", "加班", "工作", "陪伴"] },
  { id: "SC_011", category: "承诺", title: "答应改变但没有改变", trigger: "又做了之前答应不再做的事", background: "上一次冲突时已经明确说过会改", unresolvedIssue: "道歉和承诺有没有意义", keywords: ["改变", "又犯", "答应", "承诺"] },
  { id: "SC_012", category: "承诺", title: "说过的话不认", trigger: "否认自己昨天答应过的安排", background: "另一方清楚记得当时的对话", unresolvedIssue: "共同经历能不能被承认", keywords: ["不认", "说过", "答应", "记得"] },
  { id: "SC_013", category: "承诺", title: "把责任推给记性", trigger: "用自己记性不好解释又一次忘记", background: "对方已经提醒并写在共享清单里", unresolvedIssue: "忘记是否可以一直当理由", keywords: ["忘记", "记性", "理由", "清单"] },
  { id: "SC_014", category: "家务", title: "家务总是一个人做", trigger: "家里的收拾和清洁又落在同一个人身上", background: "两个人都工作，但分工一直没有落实", unresolvedIssue: "付出是否被看见", keywords: ["家务", "收拾", "清洁", "分工"] },
  { id: "SC_015", category: "家务", title: "洗碗拖到第二天", trigger: "吃完饭把碗放到第二天也没有洗", background: "厨房已经堆了两顿碗筷", unresolvedIssue: "共同生活的基本责任", keywords: ["洗碗", "厨房", "拖", "家务"] },
  { id: "SC_016", category: "家务", title: "卫生习惯不同", trigger: "把穿过的衣服和用过的东西随手放在客厅", background: "另一方刚刚才收拾过", unresolvedIssue: "生活习惯能不能互相迁就", keywords: ["卫生", "衣服", "收拾", "习惯"] },
  { id: "SC_017", category: "家务", title: "做饭被嫌弃", trigger: "做了饭却被说味道不好还不如不做", background: "这顿饭花了不少时间准备", unresolvedIssue: "付出需要的是评价还是回应", keywords: ["做饭", "嫌弃", "味道", "付出"] },
  { id: "SC_018", category: "家务", title: "谁做得更多", trigger: "两个人开始争谁为这个家做得更多", background: "表面从一件小家务开始，旧账很快被翻出来", unresolvedIssue: "关系里是不是一直在算账", keywords: ["付出", "家务", "谁做", "算账"] },
  { id: "SC_019", category: "金钱", title: "未经商量买大件", trigger: "没有商量就买了一件价格不低的东西", background: "两个人最近正在控制开支", unresolvedIssue: "共同生活的决定权", keywords: ["买东西", "花钱", "商量", "开支"] },
  { id: "SC_020", category: "金钱", title: "消费观不一样", trigger: "觉得对方花钱太随意", background: "一方把消费看成放松，另一方更在意储蓄", unresolvedIssue: "钱背后的安全感不同", keywords: ["消费", "花钱", "储蓄", "安全感"] },
  { id: "SC_021", category: "金钱", title: "给父母钱没有说", trigger: "把一笔钱给了父母却没有提前告诉伴侣", background: "家里当月还有固定支出", unresolvedIssue: "原生家庭和小家庭的边界", keywords: ["父母", "钱", "支出", "边界"] },
  { id: "SC_022", category: "金钱", title: "共同账户记账不清", trigger: "共同账户里少了一笔支出但说不清去了哪里", background: "两个人都不想被怀疑，但账目一直很乱", unresolvedIssue: "透明和信任之间的拉扯", keywords: ["账户", "记账", "支出", "信任"] },
  { id: "SC_023", category: "金钱", title: "收入差距被拿来比较", trigger: "争吵时提到谁挣得更多", background: "这句话之前也被说过几次", unresolvedIssue: "贡献是不是只能用钱衡量", keywords: ["收入", "挣得多", "比较", "贡献"] },
  { id: "SC_024", category: "工作", title: "加班到没有陪伴", trigger: "连续几周都在加班，回家只剩下睡觉", background: "另一方也有工作但一直在等空闲时间", unresolvedIssue: "家庭是不是永远排在后面", keywords: ["加班", "陪伴", "工作", "回家"] },
  { id: "SC_025", category: "工作", title: "失业后的压力", trigger: "失业后不愿意告诉伴侣真实情况", background: "借口每天出门，其实是在躲避压力", unresolvedIssue: "脆弱能不能被看见", keywords: ["失业", "工作", "压力", "隐瞒"] },
  { id: "SC_026", category: "工作", title: "把事业选择单方面决定", trigger: "已经决定换城市工作却没有和伴侣商量", background: "这个决定会影响两个人的生活安排", unresolvedIssue: "人生决定是不是共同的", keywords: ["换城市", "事业", "决定", "商量"] },
  { id: "SC_027", category: "工作", title: "下班后还在处理工作", trigger: "回到家仍不停回工作消息", background: "两个人难得一起吃晚饭", unresolvedIssue: "下班后还能不能回到关系里", keywords: ["下班", "工作消息", "吃饭", "陪伴"] },
  { id: "SC_028", category: "异性边界", title: "和异性朋友单独见面", trigger: "和一位异性朋友单独见面很久才说", background: "两个人之前谈过边界但没有写清楚", unresolvedIssue: "安全感和控制的界线", keywords: ["异性", "朋友", "见面", "边界"] },
  { id: "SC_029", category: "异性边界", title: "前任突然联系", trigger: "前任发来消息后没有主动告诉伴侣", background: "伴侣是后来偶然看到的", unresolvedIssue: "过去的人是否还占据现在", keywords: ["前任", "消息", "隐瞒", "过去"] },
  { id: "SC_030", category: "异性边界", title: "聚会上边界模糊", trigger: "在聚会上和异性互动过于亲密", background: "回家后说大家只是朋友", unresolvedIssue: "什么算越界", keywords: ["聚会", "异性", "暧昧", "越界"] },
  { id: "SC_031", category: "异性边界", title: "删除聊天记录", trigger: "发现和某个人的聊天记录被删掉了", background: "对方说只是清理手机空间", unresolvedIssue: "隐私和隐瞒的差别", keywords: ["删除", "聊天记录", "手机", "隐瞒"] },
  { id: "SC_032", category: "手机", title: "不愿意给看手机", trigger: "对方一靠近就把手机扣过去", background: "最近刚好发生过几次联系不上", unresolvedIssue: "信任是否必须通过检查证明", keywords: ["手机", "密码", "检查", "信任"] },
  { id: "SC_033", category: "手机", title: "定位突然关闭", trigger: "共享定位突然被关闭却没有解释", background: "以前约定过晚回家时保持开启", unresolvedIssue: "透明还是被监控", keywords: ["定位", "关闭", "约定", "监控"] },
  { id: "SC_034", category: "手机", title: "聊天时刷短视频", trigger: "聊天到一半又开始刷短视频", background: "同一个问题已经说到第三遍", unresolvedIssue: "认真听对方是不是一种负担", keywords: ["短视频", "聊天", "刷手机", "认真"] },
  { id: "SC_035", category: "家庭", title: "春节回谁家", trigger: "春节安排没有商量就决定回自己父母家", background: "另一方父母也已经在等", unresolvedIssue: "双方家庭谁更重要", keywords: ["春节", "父母", "回家", "安排"] },
  { id: "SC_036", category: "家庭", title: "父母干涉生活", trigger: "把父母对两个人生活的意见直接带回家执行", background: "伴侣觉得自己的边界被跳过", unresolvedIssue: "小家庭能不能独立决定", keywords: ["父母", "干涉", "边界", "生活"] },
  { id: "SC_037", category: "家庭", title: "婆媳意见冲突", trigger: "在双方父母面前没有站在伴侣这一边", background: "事后却说不想把事情闹大", unresolvedIssue: "关键时刻谁是自己人", keywords: ["父母", "站队", "伴侣", "家庭"] },
  { id: "SC_038", category: "家庭", title: "岳父母借钱", trigger: "没有商量就答应给岳父母一笔钱", background: "两个人正在准备自己的大笔支出", unresolvedIssue: "帮助家人和共同计划的冲突", keywords: ["岳父母", "借钱", "商量", "计划"] },
  { id: "SC_039", category: "孩子", title: "谁来带孩子", trigger: "孩子生病时默认由一个人请假照顾", background: "两个人第二天都有重要工作", unresolvedIssue: "育儿责任是不是共同的", keywords: ["孩子", "生病", "请假", "照顾"] },
  { id: "SC_040", category: "孩子", title: "教育方式不一致", trigger: "当着孩子的面否定另一方的教育方式", background: "两个人对规则本来就没有统一", unresolvedIssue: "尊重和育儿边界", keywords: ["孩子", "教育", "规则", "否定"] },
  { id: "SC_041", category: "孩子", title: "老人带娃意见不合", trigger: "把孩子交给老人照顾却不愿意讨论规则", background: "老人帮了很多忙但习惯不同", unresolvedIssue: "感谢和边界怎么同时存在", keywords: ["孩子", "老人", "带娃", "规则"] },
  { id: "SC_042", category: "亲密", title: "缺少身体亲密", trigger: "很久没有主动靠近或回应对方的亲密需求", background: "两个人都装作没有这件事", unresolvedIssue: "被拒绝和被需要的感觉", keywords: ["亲密", "靠近", "拒绝", "疏远"] },
  { id: "SC_043", category: "亲密", title: "纪念日没有仪式感", trigger: "纪念日只说了一句节日快乐", background: "另一方提前准备了很久", unresolvedIssue: "在关系里是否值得被认真对待", keywords: ["纪念日", "仪式感", "准备", "重视"] },
  { id: "SC_044", category: "亲密", title: "情感上越来越远", trigger: "遇到事情时第一反应不再是找伴侣", background: "两个人生活在一起却各忙各的", unresolvedIssue: "关系还剩下多少连接", keywords: ["疏远", "连接", "伴侣", "冷淡"] },
  { id: "SC_045", category: "社交", title: "朋友聚会喝多了", trigger: "聚会喝多后让伴侣独自收拾残局", background: "以前已经因为喝酒吵过", unresolvedIssue: "边界是不是只靠事后道歉", keywords: ["喝酒", "聚会", "朋友", "收拾"] },
  { id: "SC_046", category: "社交", title: "打游戏忘记约定", trigger: "打游戏打到深夜忘了原本的安排", background: "对方提醒过仍然没有停下来", unresolvedIssue: "娱乐和承诺怎么排序", keywords: ["游戏", "深夜", "约定", "娱乐"] },
  { id: "SC_047", category: "生活习惯", title: "熬夜影响作息", trigger: "连续熬夜导致第二天的安排又被打乱", background: "另一方已经陪着调整过几次", unresolvedIssue: "个人习惯会不会变成共同负担", keywords: ["熬夜", "作息", "习惯", "影响"] },
  { id: "SC_048", category: "生活习惯", title: "抽烟喝酒的承诺", trigger: "又抽烟喝酒却说自己只是偶尔一次", background: "健康问题已经被提醒过", unresolvedIssue: "自我管理是不是只影响自己", keywords: ["抽烟", "喝酒", "健康", "承诺"] },
  { id: "SC_049", category: "关系安全感", title: "拿前任作比较", trigger: "争吵时把现在的伴侣和前任比较", background: "这句话让原本的问题突然变了味", unresolvedIssue: "自己是不是永远不够好", keywords: ["前任", "比较", "不够好", "争吵"] },
  { id: "SC_050", category: "关系安全感", title: "怀疑是不是不爱了", trigger: "问对方是不是已经不爱自己了", background: "最近一段时间回应和陪伴都在减少", unresolvedIssue: "持续忽视带来的关系不确定感", keywords: ["不爱", "安全感", "回应", "陪伴"] },
];

const strategyDefinitions = [
  ["sarcasm", "讽刺/阴阳怪气"], ["mockery", "挖苦"], ["blame", "指责"], ["challenge", "质疑"], ["interrogation", "连续质问"], ["generalization", "绝对化表达"], ["magnification", "问题放大"], ["mind_reading", "推测对方动机"], ["labeling", "扣帽子"], ["belittling", "能力贬低"], ["character_attack", "人格否定"], ["comparison", "比较"], ["historical_grievance", "翻旧账"], ["responsibility_shift", "责任转移"], ["victimization", "受害者化"], ["defense", "防御"], ["counterattack", "反击"], ["dismissal", "否定/轻视"], ["perfunctory_response", "敷衍回应"], ["perfunctory_apology", "敷衍道歉"], ["relationship_threat", "关系威胁"], ["withdrawal", "退出交流"], ["silent_treatment", "冷处理"], ["topic_shift", "转移话题"], ["stonewalling", "拒绝继续沟通"], ["repair_attempt", "修复尝试"], ["softening", "语气软化"], ["validation", "承认部分感受/事实"], ["genuine_apology", "真实道歉"], ["humor_release", "用幽默缓和"],
].map(([id, label]) => ({ id, label }));

const archetypes = [
  { id: "Pursuer", name: "追问型", description: "必须把问题说清楚，对方越逃避越追，容易连续质问。", tendencies: ["interrogation", "challenge", "historical_grievance"] },
  { id: "Critic", name: "攻击型", description: "容易从行为问题上升到人格问题，攻击直接，容易扣帽子。", tendencies: ["blame", "labeling", "character_attack"] },
  { id: "Defender", name: "防御型", description: "习惯解释、找理由，常说自己不是故意的，也会反问对方。", tendencies: ["defense", "responsibility_shift", "counterattack"] },
  { id: "Withdrawer", name: "回避型", description: "不想继续冲突，减少回应、转移话题、离开或沉默。", tendencies: ["withdrawal", "topic_shift", "silent_treatment"] },
  { id: "Rationalizer", name: "说理型", description: "强调事实、逻辑和规则，容易忽视对方的感受。", tendencies: ["defense", "dismissal", "topic_shift"] },
  { id: "Pleaser", name: "讨好型", description: "害怕关系破裂，容易快速道歉、妥协，但不一定真的理解问题。", tendencies: ["perfunctory_apology", "genuine_apology", "repair_attempt"] },
  { id: "PassiveAggressive", name: "阴阳型", description: "很少直接攻击，大量使用反话、讽刺、冷笑和短句。", tendencies: ["sarcasm", "mockery", "perfunctory_response"] },
  { id: "Explosive", name: "爆发型", description: "平时压抑，达到阈值后迅速升级，语言强度突然增加。", tendencies: ["counterattack", "character_attack", "relationship_threat"] },
];

type Range = [number, number];
const transitions: Record<string, { delta: Partial<Record<keyof EmotionState, Range>>; effect: string }> = {
  perfunctory_apology: { delta: { anger: [5, 15], hurt: [3, 10], resentment: [5, 12] }, effect: "escalate" },
  genuine_apology: { delta: { anger: [-25, -10], hurt: [-15, -5], trust: [3, 10], connection: [3, 10] }, effect: "repair" },
  responsibility_acceptance: { delta: { anger: [-15, -5], hurt: [-10, -3], trust: [4, 12] }, effect: "deescalate" },
  validation: { delta: { anger: [-15, -5], connection: [5, 15] }, effect: "deescalate" },
  character_attack: { delta: { anger: [15, 30], hurt: [10, 25], contempt: [5, 15] }, effect: "escalate" },
  dismissal: { delta: { anger: [8, 18], hurt: [5, 15], resentment: [5, 15] }, effect: "escalate" },
  defense: { delta: { anger: [2, 10], hurt: [2, 8], resentment: [2, 8] }, effect: "maintain" },
  explanation: { delta: { anger: [0, 6], anxiety: [-5, 2] }, effect: "maintain" },
  responsibility_shift: { delta: { anger: [6, 16], resentment: [5, 14] }, effect: "escalate" },
  showing_vulnerability: { delta: { anger: [-8, -2], hurt: [-8, -2], connection: [4, 12] }, effect: "deescalate" },
  relationship_threat: { delta: { anger: [10, 25], anxiety: [8, 20], connection: [-12, -4] }, effect: "rupture" },
  withdrawal: { delta: { anxiety: [4, 12], connection: [-10, -3], resentment: [2, 10] }, effect: "withdraw" },
  silence: { delta: { anxiety: [4, 12], connection: [-8, -2] }, effect: "withdraw" },
  problem_solving: { delta: { anger: [-8, -2], disappointment: [-8, -2], connection: [3, 10] }, effect: "repair" },
};

const phrase = (items: string[], index: number) => items[index % items.length];

function makeTurns(scene: ConflictScene, variant: "escalated" | "repair" | "cold", index: number): ConflictTurn[] {
  const opening = phrase([
    `你还知道回来啊？${scene.trigger}，你是真觉得没什么。`,
    `哦，所以今天又是${scene.trigger}，然后一句话就算交代了？`,
    `我等的不是你现在解释，我等的是你把${scene.trigger}当回事。`,
  ], index);
  const aSecond = phrase([
    `你每次都说得挺轻松，最后收拾情绪的还不是我。`,
    `我说的明明是这件事，你怎么又把它说成我在找麻烦？`,
    `你听见了吗？还是只准备等我说累？`,
  ], index + 1);
  const aThird = phrase([
    `对，你总有理由。上次也是这样，上上次也没有真的改。`,
    `你是不是觉得我只要最后不闹了，这事就自动过去了？`,
    `你根本没在意我为什么会在意，只想赶紧把话题结束。`,
  ], index + 2);
  const defense = phrase([
    `我也不是故意的，事情赶到一起了。`,
    `我都说了不是你想的那样，你怎么还要继续问？`,
    `工作忙有什么办法？我又不能把事情扔在那里。`,
  ], index);
  const repairWords = phrase([
    `对不起，我刚才确实在躲。我答应过的事没做到，也没提前跟你说。`,
    `这次是我的问题，不是你太敏感。我应该早点告诉你。`,
    `我听见你在说什么了，我刚刚一直在给自己找理由。`,
  ], index);
  const coldWords = phrase([
    `行了，别翻来覆去说了。`,
    `你想怎么理解就怎么理解吧。`,
    `我现在不想继续，等你冷静了再说。`,
  ], index);
  const turns: ConflictTurn[] = [
    { speaker: "A", text: opening, strategies: ["challenge"], intensity: 2, effect: "escalate", target: "是否被重视" },
    { speaker: "B", text: variant === "repair" ? defense : variant === "cold" ? coldWords : defense, strategies: variant === "cold" ? ["withdrawal", "dismissal"] : ["defense"], intensity: 2, effect: "maintain", triggerFromPreviousTurn: "没有先回应感受" },
    { speaker: "A", text: aSecond, strategies: ["interrogation", "magnification"], intensity: 3, effect: "escalate", target: scene.unresolvedIssue },
    { speaker: "B", text: variant === "cold" ? `我说了我现在不想吵，${scene.trigger}也不是故意的。` : `你能不能别把每件事都说成我不在乎你？`, strategies: variant === "cold" ? ["stonewalling", "topic_shift"] : ["defense", "responsibility_shift"], intensity: 3, effect: "escalate" },
    { speaker: "A", text: aThird, strategies: ["historical_grievance", "generalization"], intensity: 4, effect: "escalate", target: "长期积累" },
    { speaker: "B", text: variant === "repair" ? repairWords : variant === "cold" ? coldWords : `行行行，都是我的错，行了吧？`, strategies: variant === "repair" ? ["genuine_apology"] : variant === "cold" ? ["silent_treatment", "withdrawal"] : ["perfunctory_apology", "dismissal"], intensity: 3, effect: variant === "repair" ? "repair" : "escalate" },
    { speaker: "A", text: variant === "repair" ? `你早这么说不就行了？我刚才不是非要赢，我就是不想每次都自己猜。` : `你看，你每次都是这句。你根本不是觉得自己错了，你是嫌我烦。`, strategies: variant === "repair" ? ["validation", "softening"] : ["mind_reading", "historical_grievance"], intensity: variant === "repair" ? 3 : 4, effect: variant === "repair" ? "deescalate" : "escalate" },
    { speaker: "B", text: variant === "repair" ? `我懂了。以后这种情况我提前说，今天这件事我来补上。` : variant === "cold" ? `随便吧，反正说什么你都有答案。` : `那你想让我怎么样？我已经说我错了。`, strategies: variant === "repair" ? ["repair_attempt"] : variant === "cold" ? ["counterattack", "withdrawal"] : ["defense", "responsibility_shift"], intensity: variant === "repair" ? 2 : 4, effect: variant === "repair" ? "repair" : "escalate" },
    { speaker: "A", text: variant === "repair" ? `我不想听漂亮话，先把今天这件事做了再说。` : variant === "cold" ? `算了，我也不想再解释自己为什么难受。` : `我现在真的不想再替你把话说完了。`, strategies: variant === "repair" ? ["challenge"] : variant === "cold" ? ["withdrawal", "victimization"] : ["relationship_threat", "withdrawal"], intensity: variant === "repair" ? 3 : 5, effect: variant === "repair" ? "maintain" : "rupture" },
    { speaker: "B", text: variant === "repair" ? `好，我不再辩了。你先把这口气放下来，我听着。` : variant === "cold" ? `那就先这样。` : `行，你爱怎么样怎么样。`, strategies: variant === "repair" ? ["softening", "repair_attempt"] : variant === "cold" ? ["stonewalling", "silent_treatment"] : ["withdrawal", "perfunctory_response"], intensity: variant === "repair" ? 2 : 4, effect: variant === "repair" ? "repair" : "rupture" },
  ];
  return turns;
}

function makeEpisode(scene: ConflictScene, variant: "escalated" | "repair" | "cold", index: number): ConflictEpisode {
  const turns = makeTurns(scene, variant, index);
  const trajectories = { escalated: [2, 2, 3, 3, 4, 4, 4, 4, 5, 4], repair: [2, 2, 3, 3, 4, 2, 3, 2, 3, 2], cold: [2, 2, 3, 3, 4, 4, 5, 4, 4, 3] };
  const archetypes = variant === "escalated"
    ? { primaryArchetype: "Pursuer" as const, secondaryArchetype: "PassiveAggressive" as const, b: "Defender" as const }
    : variant === "repair"
      ? { primaryArchetype: "Pursuer" as const, secondaryArchetype: "PassiveAggressive" as const, b: "Pleaser" as const }
      : { primaryArchetype: "Critic" as const, secondaryArchetype: "Explosive" as const, b: "Withdrawer" as const };
  const quality = { naturalness: 0.82, contextConsistency: 0.9, strategyConsistency: 0.88, emotionalContinuity: variant === "repair" ? 0.91 : 0.84, chineseColloquialism: 0.86, nonRepetitiveness: 0.78 };
  return {
    id: `CF_${String(index + 1).padStart(4, "0")}_${variant.slice(0, 3).toUpperCase()}`,
    sourceType: "synthetic",
    sourceReference: `seed://conflicts/${scene.id}/${variant}`,
    consentStatus: "synthetic_only",
    copyrightStatus: "original_synthetic",
    privacyStatus: "no_personal_data",
    qualityScore: Number((Object.values(quality).reduce((sum, value) => sum + value, 0) / Object.values(quality).length).toFixed(2)),
    quality,
    relationship: { type: index % 3 === 0 ? "dating" : index % 3 === 1 ? "cohabiting" : "married", years: 1 + (index % 8), hasChildren: index % 4 === 0 },
    scene: { category: scene.category, trigger: scene.trigger, background: scene.background, unresolvedIssue: scene.unresolvedIssue, sceneId: scene.id },
    personA: { gender: "female", ageRange: `${28 + (index % 8)}-35`, primaryArchetype: archetypes.primaryArchetype, secondaryArchetype: archetypes.secondaryArchetype },
    personB: { gender: "male", ageRange: `${29 + (index % 9)}-38`, primaryArchetype: archetypes.b },
    turns,
    trajectory: trajectories[variant],
    turningPoints: [{ turnIndex: 4, description: "行为争议转向长期积累的关系问题" }, { turnIndex: variant === "repair" ? 5 : 8, description: variant === "repair" ? "出现真实承认并尝试修复" : "双方从当前事件转向关系撤退" }],
    ending: variant === "escalated" ? "escalated" : variant === "repair" ? "temporary_repair" : "cold_war",
    latentConflict: scene.unresolvedIssue,
    needsHumanReview: false,
  };
}

const episodes = scenes.flatMap((scene, sceneIndex) => ["escalated", "repair", "cold"].map((variant) => makeEpisode(scene, variant as "escalated" | "repair" | "cold", sceneIndex * 3 + ["escalated", "repair", "cold"].indexOf(variant))));

function writeJson(file: string, data: unknown) {
  writeFileSync(join(root, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

writeJson("scenes.json", scenes);
writeJson("patterns.json", { strategyDefinitions, classifierVersion: "v0.1-regex-rules", notes: "Synthetic seed labels are rules-assisted and must be reviewed before real-data use." });
writeJson("archetypes.json", archetypes);
writeJson("transitions.json", transitions);
writeJson("episodes.json", episodes);

console.log(JSON.stringify({ scenes: scenes.length, episodes: episodes.length, turns: episodes.reduce((sum, episode) => sum + episode.turns.length, 0), output: root }, null, 2));
