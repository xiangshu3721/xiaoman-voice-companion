import episodes from "@/data/conflicts/episodes.json";
import expandedEpisodes from "@/data/conflicts/episodes-v11.json";
import manualEpisodes from "@/data/manual-seed/manual-episodes.json";
import scenes from "@/data/conflicts/scenes.json";
import type { ArchetypeId, BehaviorLabel, ConflictEpisode, ConflictScene, RetrievedEpisode } from "./types";

// 先尊重资料层级，再在同一层级里比较场景/状态相似度。
const sourcePriority: Record<string, number> = { human_verified: 25, manual_synthetic: 20, synthetic_seed: 8, synthetic: 0 };
const allEpisodes = [...episodes, ...expandedEpisodes, ...manualEpisodes]
  .map((episode) => episode as ConflictEpisode)
  .filter((episode) => episode.qualityScore >= 0.75);
const allScenes = scenes as ConflictScene[];

export function resolveScene(input: { scenarioId?: string; sceneContext?: string }): ConflictScene {
  const byBase = allScenes.find((scene) => scene.baseScenarioId === input.scenarioId);
  if (byBase) return byBase;
  const context = input.sceneContext || "";
  return allScenes.find((scene) => context.includes(scene.trigger) || scene.keywords.some((keyword) => context.includes(keyword))) || allScenes[0];
}

function overlap(text: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

export function retrieveSimilarEpisodes(input: { scene: ConflictScene; archetype: ArchetypeId; labels: BehaviorLabel[]; intensity: number; currentState?: string; intent?: string[]; interactionPattern?: string; limit?: number }): RetrievedEpisode[] {
  const scored = allEpisodes.map((episode) => {
    let score = 0;
    score += sourcePriority[episode.sourceType] || 0;
    if (episode.scene.category === input.scene.category) score += 6;
    if (episode.scene.sceneId === input.scene.id) score += 9;
    if (input.currentState && episode.currentState === input.currentState) score += 4;
    if (input.intent?.some((intent) => episode.userIntent?.includes(intent))) score += 2;
    if (input.interactionPattern && episode.interactionPattern?.includes(input.interactionPattern)) score += 2;
    if (episode.personA.primaryArchetype === input.archetype || episode.personA.secondaryArchetype === input.archetype) score += 4;
    score += overlap(`${episode.scene.trigger}${episode.scene.background}`, input.scene.keywords) * 1.5;
    score += input.labels.reduce((sum, label) => sum + (episode.turns.some((turn) => turn.strategies.includes(label as never)) ? 2 : 0), 0);
    score -= Math.abs((episode.trajectory[episode.trajectory.length - 1] || 3) - input.intensity) * 0.5;
    return { episode, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.min(input.limit || 3, 5));
}
