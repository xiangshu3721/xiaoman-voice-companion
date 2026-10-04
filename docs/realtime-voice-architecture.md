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

语音输入现在由统一 `ASRAdapter` 管理：桌面能力满足时保留浏览器 SpeechRecognition 主路径；移动端、WebView 或浏览器识别能力不足时，使用 `CapabilityDetector` 选择 WebAudio/MediaRecorder 录音、VAD 判停和服务端 `/api/asr` 云识别。权限状态只由 `getUserMedia` 的明确结果更新，ASR 网络/服务错误不会再被显示成麦克风权限错误。

播放和收音由适配器协调：AI 播放前暂停并释放录音会话，真实播放结束后再重新申请收音，避免移动浏览器把 TTS 路由到听筒；TTS 使用统一的 WebAudio 增益和动态压缩链路，不按 iPhone/Android 分叉。

使用 `?debugVoice=1` 可查看 Release、SHA、平台/浏览器、WebView、ASR Adapter、MIC、Capture、ASR、Playback 和内部状态。生产界面只显示“正在听你说 / Ta 正在想 / Ta 准备开口 / Ta 正在说”等统一文案。
