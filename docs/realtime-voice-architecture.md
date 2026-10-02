# Realtime Voice & Semantic Reliability V3

本版本把实时语音对话拆成四个边界：

- `RealtimeConversationState`：统一管理麦克风准备、收音、用户说话、可能结束、AI 生成、AI 播放和打断恢复。
- `TranscriptAccumulator`：ASR final segment 只进入当前用户回合，不直接触发提交；多个 segment 合并后才形成 raw user turn。
- `EndOfTurnDetector`：联合 VAD 静音时长、ASR interim/final、未完成连接词和语义完整度判断回合结束。
- `UserSemanticAnalyzer` / novelty guard：当前回合的明确意图、否定意图、证据和最新变化优先于推断与旧回复。

## 铁律

1. 完整用户语音优先于快速响应。
2. 第一句话必须先被听见，麦克风未 ready 不显示“正在听”。
3. ASR segment 不等于 conversation turn；partial 不等于事实。
4. 完整 raw text 优先于推断；否定句优先级高于正向关键词。
5. AI 语音必须可被用户打断；先停 TTS，再恢复完整 ASR。
6. 未实际播放的 AI 文本不能作为共享事实。
7. 不杜撰用户未说过的话，不重复上一轮对话动作。

## 已知边界

浏览器 SpeechRecognition 的实现受 Chrome / Safari / 微信 WebView 差异影响；服务端仍保留原有 DeepSeek、Conflict Engine、Seed-TTS 和 Browser SpeechSynthesis fallback。微信内置浏览器如果没有暴露标准 SpeechRecognition，页面会继续提供文字输入和明确的恢复提示。
