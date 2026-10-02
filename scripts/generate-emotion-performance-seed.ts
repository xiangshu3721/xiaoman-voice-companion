import fs from "node:fs";
import path from "node:path";

type Emotion = "annoyed" | "restrained_anger" | "sarcastic_anger" | "explosive_anger" | "hurt_anger" | "cold_anger" | "disbelief" | "softening" | "playful";

const counts: Record<Emotion, number> = {
  annoyed: 40,
  restrained_anger: 40,
  sarcastic_anger: 50,
  explosive_anger: 35,
  hurt_anger: 50,
  cold_anger: 30,
  disbelief: 25,
  softening: 20,
  playful: 10,
};

const texts: Record<Emotion, string[]> = {
  annoyed: ["你又来了。", "有完没完啊？", "你先让我说完行不行？", "行了行了，别绕了。", "少来。", "我刚说到哪儿了？你又打断。", "不是，你能不能先听我说？", "我现在真的有点烦。"],
  restrained_anger: ["你再说一遍？", "行……你继续。", "我现在真的不想跟你吵。", "你先别逼我把话说重。", "我忍着呢，你别当我没脾气。", "不是，我已经说得够明白了。", "你听见了，只是不想接。", "行，我记住了。"],
  sarcastic_anger: ["哦，现在知道找我了？", "对对对，你最忙。", "行，你永远都有理由。", "你可真会挑时候。", "没事，你继续，当我不存在。", "对对对，又是我的问题。", "你最有道理，我哪敢说你。", "真行，每次都能给自己圆回来。", "行，你忙，你忙你的。"],
  explosive_anger: ["你到底有没有听我说话？！", "我跟你说多少遍了？！", "你能不能先别打断我？！", "不是，你到底要我怎么样？！", "我说的是这个吗？！", "你别一着急就把话全扣我头上！", "我现在说一句你听一句，行不行？！"],
  hurt_anger: ["我等你那么久，你回来就跟我说这个？", "我就想让你回我一句，有那么难吗？", "我不是气你忙，我是觉得你根本没把我放心上。", "你一句忙就完了，那我呢？", "你知道我一直等着是什么感觉吗？", "我气的根本不是这点破事。", "你每次都觉得我是在找事。", "我已经够给你面子了，你还觉得我在闹。", "我只是想让你在意一下，怎么这么难。"],
  cold_anger: ["行，随便。", "不说了。", "你忙你的。", "没什么好说的。", "我不想解释了。", "哦，那就这样吧。", "你爱怎么样怎么样。", "算了，反正说了也没用。"],
  disbelief: ["不是……你认真的？", "所以最后还是我的错？", "你现在是在怪我？", "你自己听听你说的什么？", "不是，你怎么能这么说？", "等会儿，你刚才说什么？", "我没听错吧？", "你是觉得这样很有道理吗？"],
  softening: ["……行了，我知道了。", "现在知道来哄我了？", "我还气一点。", "行吧，至少你还知道道歉。", "好了，别一直说了。", "少来这套……不过算了。", "行，这次先信你。", "我没说完全不生气了。"],
  playful: ["想让我原谅你？看你表现。", "给我买点好吃的，我考虑一下。", "先抱一下再说。", "行，罚你请我吃饭。", "陪我看会儿电影。", "这次给你个将功补过的机会。", "嘴这么甜，早干嘛去了。"],
};

const deliveries: Record<Emotion, { pace: string; loudness: string; pitch: string; sharpness: string; pauseStyle: string; ending: string; nonverbal: string }> = {
  annoyed: { pace: "slightly_fast", loudness: "normal", pitch: "normal", sharpness: "sharp", pauseStyle: "short", ending: "flat", nonverbal: "scoff" },
  restrained_anger: { pace: "normal", loudness: "slightly_low", pitch: "low", sharpness: "sharp", pauseStyle: "broken", ending: "falling", nonverbal: "breath" },
  sarcastic_anger: { pace: "normal", loudness: "slightly_low", pitch: "slightly_low", sharpness: "sharp", pauseStyle: "short", ending: "falling", nonverbal: "cold_laugh" },
  explosive_anger: { pace: "fast", loudness: "strong", pitch: "slightly_high", sharpness: "sharp", pauseStyle: "dramatic", ending: "cut_off", nonverbal: "breath" },
  hurt_anger: { pace: "slightly_slow", loudness: "raised", pitch: "slightly_low", sharpness: "normal", pauseStyle: "long_before", ending: "falling", nonverbal: "breath" },
  cold_anger: { pace: "slow", loudness: "slightly_low", pitch: "low", sharpness: "sharp", pauseStyle: "long_before", ending: "flat", nonverbal: "none" },
  disbelief: { pace: "slow", loudness: "normal", pitch: "slightly_high", sharpness: "normal", pauseStyle: "long_before", ending: "rising", nonverbal: "breath" },
  softening: { pace: "slightly_slow", loudness: "slightly_low", pitch: "normal", sharpness: "soft", pauseStyle: "broken", ending: "soft", nonverbal: "sigh" },
  playful: { pace: "normal", loudness: "normal", pitch: "slightly_high", sharpness: "soft", pauseStyle: "short", ending: "rising", nonverbal: "cold_laugh" },
};

function intensityFor(emotion: Emotion, index: number) {
  if (emotion === "explosive_anger") return 4 + (index % 2);
  if (emotion === "hurt_anger" || emotion === "sarcastic_anger" || emotion === "restrained_anger") return 3 + (index % 2);
  if (emotion === "softening" || emotion === "playful") return 1 + (index % 2);
  return 2 + (index % 2);
}

function buildInstruction(emotion: Emotion) {
  const instructions: Record<Emotion, string> = {
    annoyed: "情侣争吵中明显不耐烦，短促、稍快，像已经解释过很多遍，不要客服腔。",
    restrained_anger: "情侣正在压着火，音量不必大，但字要咬重，停顿短而硬，不能平静朗读。",
    sarcastic_anger: "情侣争吵中的冷讽和反话，关键词重读，尾音略压低，带一点冷笑感，不要夸张配音。",
    explosive_anger: "争吵中突然爆发，语速和能量突然提高，关键词重读，但不要从头到尾尖叫。",
    hurt_anger: "生气里夹着委屈和被忽视，前半压着，后半情绪顶上来，像真人说话。",
    cold_anger: "刚争吵过但心冷了，声音低、语速慢、句子短，不要大喊。",
    disbelief: "难以置信地反问，先停一下再说，像真的听不懂对方为什么这样讲。",
    softening: "对方递了台阶后仍有余气但明显软下来，前半嘴硬，后半收住，不再攻击。",
    playful: "关系缓和后的嘴硬和亲近，带一点玩笑，不要短视频配音腔。",
  };
  return instructions[emotion];
}

const rows: string[] = [];
for (const [emotion, count] of Object.entries(counts) as [Emotion, number][]) {
  for (let index = 0; index < count; index += 1) {
    const baseText = texts[emotion][index % texts[emotion].length];
    const text = index % 9 === 0 && ["sarcastic_anger", "hurt_anger", "cold_anger"].includes(emotion)
      ? "行，你忙。"
      : baseText;
    const intensity = intensityFor(emotion, index);
    const row = {
      id: `emotion-performance-${String(rows.length + 1).padStart(3, "0")}`,
      text,
      scene: emotion === "softening" || emotion === "playful" ? "争吵后的缓和" : "日常亲密关系冲突",
      relationshipState: emotion === "softening" ? "REPAIR" : emotion === "playful" ? "CLOSE" : "CONFLICT",
      emotion,
      intensity,
      delivery: deliveries[emotion],
      profanityLevel: emotion === "explosive_anger" && text.includes("他妈") ? 2 : emotion === "explosive_anger" ? 1 : 0,
      ttsInstruction: buildInstruction(emotion),
      sourceType: "synthetic_seed",
      qualityScore: 0.82,
    };
    rows.push(JSON.stringify(row));
  }
}

const outputPath = path.resolve("data/performance-seed/emotion-performance-cn.jsonl");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(`Generated ${rows.length} emotion performance seeds at ${outputPath}`);
