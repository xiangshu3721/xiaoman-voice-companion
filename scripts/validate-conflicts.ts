import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConflictEpisode, ConflictScene } from "../src/conflict-engine/types";

const dataRoot = join(process.cwd(), "data", "conflicts");
const scenes = JSON.parse(readFileSync(join(dataRoot, "scenes.json"), "utf8")) as ConflictScene[];
const episodes = JSON.parse(readFileSync(join(dataRoot, "episodes.json"), "utf8")) as ConflictEpisode[];
const errors: string[] = [];
const pii = /(1[3-9]\d{9}|\b\d{15,18}\b|微信|身份证|车牌|@\w+|北京市|上海市|广州市|深圳市)/;

if (scenes.length < 50) errors.push(`scenes=${scenes.length}, expected at least 50`);
if (episodes.length < 150) errors.push(`episodes=${episodes.length}, expected at least 150`);
const turns = episodes.reduce((sum, episode) => sum + episode.turns.length, 0);
if (turns < 1500) errors.push(`turns=${turns}, expected at least 1500`);
episodes.forEach((episode) => {
  if (episode.sourceType !== "synthetic") errors.push(`${episode.id}: sourceType must be synthetic for seed data`);
  if (!episode.sourceReference || episode.consentStatus !== "synthetic_only" || episode.privacyStatus !== "no_personal_data") errors.push(`${episode.id}: missing synthetic provenance fields`);
  if (episode.qualityScore < 0.7) errors.push(`${episode.id}: qualityScore below production threshold`);
  if (episode.turns.length < 6 || episode.turns.length > 15) errors.push(`${episode.id}: turns outside 6-15 range`);
  if (pii.test(JSON.stringify(episode))) errors.push(`${episode.id}: possible PII pattern`);
});

console.log(JSON.stringify({ scenes: scenes.length, episodes: episodes.length, turns, errors }, null, 2));
if (errors.length) process.exit(1);
