import type { BehaviorLabel, Classification } from "./types";
import { analyzeUserSemantic } from "@/src/semantic/user-semantic-analyzer";

const rules: Array<{ label: BehaviorLabel; test: RegExp }> = [
  { label: "perfunctory_apology", test: /(行行行|行了吧|行吧|随便|都怪我|都是我的错).*(错|道歉|行了)?|对不起.*(但是|行了|满意了)/ },
  { label: "genuine_apology", test: /(对不起|抱歉|我错了).*(确实|答应|没做到|没提前|应该|我的问题|过分)|确实.*(没做到|做错了)/ },
  { label: "responsibility_acceptance", test: /(是我的问题|我应该|我没做到|没做到|没提前告诉|我承认|确实是我|我不推给你)/ },
  { label: "character_attack", test: /(傻逼|废物|无理取闹|神经|有病|矫情|作死|烦不烦|你怎么这么|没救了)/ },
  { label: "relationship_threat", test: /(分手|离婚|还在一起干嘛|别过了|不如算了|你走吧)/ },
  { label: "dismissal", test: /(别闹|别这样|无理取闹|有什么大不了|小题大做|不至于|算了吧|懒得说|你至于吗|已读不回|不回消息|不回复|消失|几个小时.*没回|等了.*小时)/ },
  { label: "defense", test: /(我又不是故意|不是我|我也没办法|有什么办法|我已经说了|我都说了|我不是说过|忙|来不及)/ },
  { label: "responsibility_shift", test: /(那你呢|你自己也|都怪你|还不是因为你|你要是|你不.*我就)/ },
  { label: "denial", test: /(我没说过|没有这回事|你记错了|我哪有|不是这样的|你别乱说)/ },
  { label: "acknowledgement", test: /(我知道你|我明白你|你说得对|我承认|我听见了|确实让你|确实过分|确实没做到)/ },
  { label: "showing_vulnerability", test: /(我其实很怕|我也很难受|我不知道怎么办|我不是不在乎|我只是觉得|我有点撑不住)/ },
  { label: "problem_solving", test: /(我现在就|我来解决|我们定个|以后提前|怎么补|我会改|我去做)/ },
  { label: "joking", test: /(哈哈|开个玩笑|逗你的|别当真|笑死)/ },
  { label: "challenge", test: /(凭什么|你到底|你能不能|你还要|你是不是非要)/ },
  { label: "pleasing", test: /(你别生气|都听你的|你说怎么办|我都可以|别离开我)/ },
  { label: "silence", test: /^(哦|嗯|行|随便|不知道|不说了|没什么)[。！!，,？?… ]*$/ },
  { label: "explanation", test: /(因为|所以|当时|其实是|主要是|不是你想的)/ },
  { label: "defense", test: /(但是|可是|只是|我觉得)/ },
];

export function classifyUserMessage(message: string): Classification {
  const semantic = analyzeUserSemantic(message);
  const labels: BehaviorLabel[] = [];
  for (const rule of rules) {
    if (rule.test.test(message) && !labels.includes(rule.label)) labels.push(rule.label);
  }
  if (semantic.negatedIntents.includes("APOLOGY")) {
    for (const label of ["genuine_apology", "perfunctory_apology", "responsibility_acceptance"] satisfies BehaviorLabel[]) {
      const index = labels.indexOf(label);
      if (index >= 0) labels.splice(index, 1);
    }
    if (!labels.includes("defense")) labels.push("defense");
  }
  if (semantic.explicitIntents.includes("APOLOGY") && !semantic.ambiguousIntents.includes("APOLOGY") && !labels.includes("genuine_apology")) labels.unshift("genuine_apology");
  if (!labels.length) labels.push("explanation");
  const priority: BehaviorLabel[] = ["genuine_apology", "perfunctory_apology", "character_attack", "relationship_threat", "problem_solving", "showing_vulnerability", "dismissal", "defense", "explanation"];
  const primary = priority.find((label) => labels.includes(label)) || labels[0];
  const confidence = labels.length > 1 ? 0.88 : labels[0] === "explanation" ? 0.58 : 0.76;
  return { labels, primary, confidence };
}
