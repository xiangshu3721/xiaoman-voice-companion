import type { SpeakerCapability } from "./types";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; speaker: SpeakerCapability }>();

export function getRuntimeSpeaker(speakerId: string) {
  const entry = cache.get(speakerId);
  if (!entry || entry.expiresAt < Date.now()) return undefined;
  return entry.speaker;
}

export function setRuntimeSpeaker(speaker: SpeakerCapability) {
  cache.set(speaker.speakerId, { expiresAt: Date.now() + TTL_MS, speaker });
  return speaker;
}
