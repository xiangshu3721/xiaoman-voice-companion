export const TTS_VOICE_STORAGE_KEY = "xiaoman-tts-voice";

export const SCENARIOS = [
  {
    id: "late-home",
    title: "晚回家没有提前说",
    shortTitle: "晚回家",
    context: "今晚用户比约定时间晚回家三个小时，期间只发了一条“晚点回来”，小满一直在等。",
  },
  {
    id: "no-reply",
    title: "长时间没有回复消息",
    shortTitle: "没回消息",
    context: "今天下午用户几个小时没有回复小满的消息。小满看到消息一直显示已读，越等越不舒服。",
  },
  {
    id: "forgotten",
    title: "答应做的事情又忘了",
    shortTitle: "又忘了",
    context: "用户答应今天帮小满做一件重要的小事，但到了晚上仍然没有做，也没有主动提起。",
  },
  {
    id: "free",
    title: "自由对话",
    shortTitle: "自由对话",
    context: "这是一个没有预设事件的普通晚上。小满和用户正在相处，一切都从用户此刻说的话开始。",
  },
] as const;
