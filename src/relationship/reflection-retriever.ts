import examples from "@/data/reflection/reflection-examples.json";
import patterns from "@/data/reflection/interaction-patterns.json";
import type { ReflectionState } from "./types";

type ReflectionExample = { id: string; text: string; tags: string[]; depth: 1 | 2 | 3; sourceType: "synthetic" };
type ReflectionPattern = { id: string; text: string; tags: string[]; sourceType: "synthetic" };

const exampleLibrary = examples as ReflectionExample[];
const patternLibrary = patterns as ReflectionPattern[];

function score(text: string, item: { text: string; tags: string[] }) {
  const terms = text.split(/[，。！？、\s]+/).filter((term) => term.length > 1);
  return terms.reduce((total, term) => total + (item.text.includes(term) || item.tags.some((tag) => tag.includes(term) || term.includes(tag)) ? 1 : 0), 0);
}

export function retrieveReflections(input: { text: string; reflection: ReflectionState; limit?: number }) {
  const limit = input.limit || 3;
  const retrievedExamples = exampleLibrary
    .map((item) => ({ item, score: score(input.text, item) + (item.depth === input.reflection.insightDepth ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
  const retrievedPatterns = patternLibrary
    .map((item) => ({ item, score: score(input.text, item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ item }) => item);
  return { examples: retrievedExamples, patterns: retrievedPatterns };
}
