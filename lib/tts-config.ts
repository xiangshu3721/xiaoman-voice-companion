export type ConfiguredTTSVoice = {
  id: string;
  name: string;
  description: string;
  gender?: "female" | "male";
};

export const DOUBAO_TTS_DEFAULTS = {
  resourceId: "seed-tts-2.0",
  model: "seed-tts-2.0-standard",
  voiceId: "zh_female_vv_uranus_bigtts",
  voiceName: "vivi 2.0（官方预置·通用场景女声）",
} as const;

const DEFAULT_TTS_VOICES: ConfiguredTTSVoice[] = [
  {
    id: DOUBAO_TTS_DEFAULTS.voiceId,
    name: DOUBAO_TTS_DEFAULTS.voiceName,
    gender: "female",
    description: "优先候选：官方通用场景女声，适合先试听日常对话。",
  },
  {
    id: "zh_female_santongyongns_saturn_bigtts",
    name: "流畅女声",
    gender: "female",
    description: "已验证可用：声音顺滑清晰，适合日常对话试听。",
  },
  {
    id: "zh_female_mizai_saturn_bigtts",
    name: "咪仔",
    gender: "female",
    description: "已验证可用：更有角色感，适合对比不同表达风格。",
  },
  {
    id: "zh_female_meilinvyou_saturn_bigtts",
    name: "魅力女友",
    gender: "female",
    description: "已验证可用：情绪辨识度更强，适合关系对话试听。",
  },
  {
    id: "zh_male_dayi_saturn_bigtts",
    name: "大壹",
    gender: "male",
    description: "已验证可用：偏年轻男声/视频场景。",
  },
  {
    id: "zh_male_ruyayichen_saturn_bigtts",
    name: "儒雅逸辰",
    gender: "male",
    description: "已验证可用：更沉稳、儒雅的男性声音。",
  },
];

export function getConfiguredTTSVoices(): ConfiguredTTSVoice[] {
  const configuredId = process.env.VOLCENGINE_TTS_VOICE;
  const configuredName = process.env.VOLCENGINE_TTS_VOICE_NAME;
  const configuredDefault = DEFAULT_TTS_VOICES.find((voice) => voice.id === configuredId);
  const configuredVoice = configuredId
    ? {
        id: configuredId,
        name: configuredName || configuredDefault?.name || configuredId,
        description: configuredDefault?.description || "当前服务端选定音色；展示名以火山引擎控制台为准。",
        gender: configuredId.includes("_male_") ? "male" as const : "female" as const,
      }
    : null;
  const fallback = configuredVoice
    ? [configuredVoice, ...DEFAULT_TTS_VOICES.filter((voice) => voice.id !== configuredId)]
    : DEFAULT_TTS_VOICES;
  const raw = process.env.VOLCENGINE_TTS_VOICES_JSON;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const voices = parsed.filter((voice): voice is ConfiguredTTSVoice => {
      if (!voice || typeof voice !== "object") return false;
      const candidate = voice as Partial<ConfiguredTTSVoice>;
      return typeof candidate.id === "string" && typeof candidate.name === "string";
    }).map((voice) => ({
      id: voice.id,
      name: voice.name,
      description: voice.description || "官方预置音色候选；实际可用性以火山引擎控制台音色库为准。",
      ...(voice.gender === "male" || voice.gender === "female" ? { gender: voice.gender } : {}),
    }));
    return voices.length ? voices : fallback;
  } catch {
    return fallback;
  }
}
