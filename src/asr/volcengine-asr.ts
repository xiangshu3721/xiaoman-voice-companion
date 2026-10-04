const ASR_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";

type ASRResult = { text: string };

export async function transcribeWithVolcengine(audio: Uint8Array, mimeType: string): Promise<ASRResult> {
  const apiKey = process.env.VOLCENGINE_ASR_API_KEY;
  if (!apiKey) throw new Error("VOLCENGINE_ASR_API_KEY is not configured");
  if (!audio.byteLength) throw new Error("audio is empty");
  const requestId = crypto.randomUUID();
  const socket = new WebSocket(ASR_ENDPOINT, { headers: { "X-Api-Key": apiKey, "X-Api-Resource-Id": process.env.VOLCENGINE_ASR_RESOURCE_ID || "volc.seedasr.sauc.duration", "X-Api-Request-Id": requestId } } as never);
  socket.binaryType = "arraybuffer";

  return await new Promise<ASRResult>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Volcengine ASR timeout")), 20000);
    const finish = (error?: Error, result?: ASRResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error); else resolve(result || { text: "" });
    };
    socket.onopen = () => {
      const request = {
        user: { uid: requestId },
        audio: { format: formatForMime(mimeType), codec: mimeType.includes("ogg") || mimeType.includes("webm") ? "opus" : "raw", rate: 16000, bits: 16, channel: 1 },
        request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: false },
      };
      socket.send(fullRequestFrame(request));
      socket.send(audioFrame(audio, -1));
    };
    socket.onmessage = async (event) => {
      const payload = await parseServerPayload(event.data);
      const text = findText(payload);
      const errorCode = findError(payload);
      if (errorCode) finish(new Error(errorCode));
      else if (text) finish(undefined, { text });
    };
    socket.onerror = () => finish(new Error("Volcengine ASR connection failed"));
    socket.onclose = () => { if (!settled) finish(new Error("Volcengine ASR closed without a result")); };
  });
}

function formatForMime(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp3")) return "mp3";
  return "ogg";
}

function fullRequestFrame(request: unknown) {
  const payload = Buffer.from(JSON.stringify(request));
  return Buffer.concat([Buffer.from([0x11, 0x10, 0x10, 0x00]), uint32(payload.byteLength), payload]);
}

function audioFrame(audio: Uint8Array, sequence: number) {
  return Buffer.concat([Buffer.from([0x11, 0x22, 0x00, 0x00]), int32(sequence), uint32(audio.byteLength), Buffer.from(audio)]);
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function int32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

async function parseServerPayload(data: unknown): Promise<unknown> {
  const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const candidates = [bytes.toString("utf8"), bytes.subarray(4).toString("utf8"), bytes.subarray(8).toString("utf8"), bytes.subarray(12).toString("utf8")];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* try the next offset */ }
    }
  }
  return {};
}

function findText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  const result = object.result;
  if (result && typeof result === "object" && typeof (result as Record<string, unknown>).text === "string") return ((result as Record<string, unknown>).text as string).trim();
  if (typeof object.text === "string") return object.text.trim();
  if (Array.isArray(result)) return result.map((item) => findText(item)).filter(Boolean).join("");
  return "";
}

function findError(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  const code = object.code ?? object.status_code;
  if (typeof code === "number" && code !== 0) return String(object.message || object.status || `ASR error ${code}`);
  return "";
}
