import type { ASRAdapter } from "@/src/realtime/asr-adapter";
import { BrowserASRAdapter } from "@/src/realtime/browser-asr-adapter";
import { detectVoiceCapability } from "@/src/realtime/capability-detector";
import { MobileAudioCaptureAdapter } from "@/src/realtime/mobile-audio-capture-adapter";

export function createASRAdapter(): { adapter: ASRAdapter; capability: ReturnType<typeof detectVoiceCapability> } {
  const capability = detectVoiceCapability();
  if (capability.preferredASR === "cloud") return { adapter: new MobileAudioCaptureAdapter(), capability };
  if (capability.preferredASR === "browser") return { adapter: new BrowserASRAdapter(), capability };
  return { adapter: new BrowserASRAdapter(), capability };
}
