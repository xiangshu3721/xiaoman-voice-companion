import { readFileSync } from "node:fs";
import { join } from "node:path";

type Episode = Record<string, unknown> & { turns?: unknown[]; qualityScore?: number; sourceType?: string; currentState?: string; sourceReference?: string };
const root = join(process.cwd(), "data", "conflicts");
const expanded = JSON.parse(readFileSync(join(root, "episodes-v11.json"), "utf8")) as Episode[];
const base = JSON.parse(readFileSync(join(root, "episodes.json"), "utf8")) as Episode[];
const errors: string[] = [];
const states = new Set(["CONFLICT", "DEESCALATE", "SOOTHE", "REFLECT", "REPAIR", "CLOSE"]);
const required = ["scene", "relationshipBackground", "personAArchetype", "personBArchetype", "currentState", "previousState", "turns", "userIntent", "aiStrategy", "emotionBefore", "emotionAfter", "stateTransition", "transitionReason", "surfaceConflict", "underlyingNeed", "interactionPattern"];
const colloquial = /(行|哦|然后呢|你又来了|算了|随便|不是|我没这么说|你什么意思|我现在不想说|你先让我缓会儿)/;

if (expanded.length < 400) errors.push(`expanded episodes=${expanded.length}, expected at least 400`);
const turnCount = expanded.reduce((sum, episode) => sum + (episode.turns?.length || 0), 0);
if (turnCount < 2500) errors.push(`expanded turns=${turnCount}, expected at least 2500`);
if (base.length + expanded.length < 500) errors.push(`library episodes=${base.length + expanded.length}, expected at least 500`);
if (base.reduce((sum, episode) => sum + (episode.turns?.length || 0), 0) + turnCount < 2500) errors.push("library turns below 2500");

const stateCoverage = new Set<string>();
const modeCoverage = new Set<string>();
let colloquialTurns = 0;
for (const episode of expanded) {
  if (episode.sourceType !== "synthetic_seed") errors.push(`${String(episode.id)}: sourceType is not synthetic_seed`);
  if (typeof episode.qualityScore !== "number" || episode.qualityScore < 0.75) errors.push(`${String(episode.id)}: qualityScore below 0.75`);
  if (!states.has(episode.currentState || "")) errors.push(`${String(episode.id)}: invalid currentState`);
  stateCoverage.add(episode.currentState || "");
  const reference = episode.sourceReference || "";
  const mode = reference.split("/")[3];
  if (mode) modeCoverage.add(mode);
  for (const field of required) if (!(field in episode)) errors.push(`${String(episode.id)}: missing ${field}`);
  if (!Array.isArray(episode.turns) || episode.turns.length < 6) errors.push(`${String(episode.id)}: too few turns`);
  for (const turn of episode.turns || []) {
    const text = typeof turn === "object" && turn !== null && "text" in turn ? String((turn as { text: unknown }).text) : "";
    if (colloquial.test(text)) colloquialTurns += 1;
  }
}
for (const state of states) if (!stateCoverage.has(state)) errors.push(`missing state coverage: ${state}`);
for (const mode of ["normal", "stay", "rollback", "soothe_fail", "reflect_fail", "repair_fail", "explosion"]) if (!modeCoverage.has(mode)) errors.push(`missing case coverage: ${mode}`);
if (colloquialTurns < Math.floor(turnCount * 0.3)) errors.push(`colloquial turns=${colloquialTurns}, expected at least 30%`);

console.log(JSON.stringify({ baseEpisodes: base.length, expandedEpisodes: expanded.length, totalEpisodes: base.length + expanded.length, expandedTurns: turnCount, states: [...stateCoverage], cases: [...modeCoverage], colloquialTurns, errors }, null, 2));
if (errors.length) process.exit(1);
