export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-TTS-Stream",
    "Access-Control-Expose-Headers": "X-TTS-Provider, X-TTS-Voice, X-TTS-Emotion, X-TTS-Emotion-Scale, X-TTS-Section-Id, X-TTS-Fallback-Used, X-TTS-Streaming",
    Vary: "Origin",
  };
}
