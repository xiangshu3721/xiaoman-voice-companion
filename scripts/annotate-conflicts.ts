import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = process.argv[2] || join(process.cwd(), "data", "raw", "import.json");
if (!existsSync(input)) throw new Error(`Input not found: ${input}`);
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for annotation");
const limit = Number(process.env.ANNOTATE_LIMIT || 5);
const records = JSON.parse(readFileSync(input, "utf8")) as Array<Record<string, unknown>>;
const output = process.argv[3] || join(process.cwd(), "data", "raw", "annotated.json");

async function annotate(record: Record<string, unknown>) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "deepseek-chat", temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: "分析亲密关系冲突片段，只返回JSON：scene, trigger, strategies, intensity, emotion, effect, turningPoint, latentConflict, archetype, annotationConfidence。confidence为0到1。" }, { role: "user", content: JSON.stringify(record) }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`DeepSeek annotation failed: ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const annotation = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  const confidence = Number(annotation.annotationConfidence || 0);
  return { ...record, annotation, needsHumanReview: confidence < 0.7 };
}

const result = [];
for (const record of records.slice(0, limit)) result.push(await annotate(record));
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ input, output, annotated: result.length, needsHumanReview: result.filter((item) => item.needsHumanReview).length }, null, 2));
