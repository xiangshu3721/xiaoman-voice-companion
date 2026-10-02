# 小满｜AI 亲密关系冲突语音模拟器 V0.1

一个最小可运行的语音关系冲突体验：浏览器中文语音识别 → 小满角色回复 → 火山引擎/豆包语音播放，第三方语音失败时自动回退到浏览器语音。

## 启动

```bash
npm install
npm run dev
```

打开终端输出的本地地址。若 3000 已被占用，Next.js 会自动使用下一个可用端口。

## 配置 DeepSeek

复制 `.env.example` 为 `.env.local`，填写：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

Key 只在 Next.js 服务端 `/api/chat` 使用，不会进入前端源码，也没有使用 `NEXT_PUBLIC_*`。
未配置 Key 时，项目自动使用本地 mock 回复，语音识别和 TTS 仍可走完整链路。

## 国内上线架构：GitHub Pages + 腾讯云

GitHub Pages 只托管静态前端；DeepSeek 和火山引擎凭证放在腾讯云 CloudBase 的服务端函数环境变量中：

```text
用户浏览器 → GitHub Pages 前端 → 腾讯云 CloudBase API → DeepSeek / 火山引擎 TTS
```

项目已经提供：

- `npm run build:pages`：构建 GitHub Pages 静态文件到 `out/`；构建时会暂时移开 `app/api`，完成后自动恢复。
- `.github/workflows/deploy-pages.yml`：推送到 `main` 后自动构建并发布 Pages。
- `lib/api.ts`：前端通过 `NEXT_PUBLIC_API_BASE_URL` 请求腾讯云 API。
- `/api/chat`、`/api/tts`、`/api/tts/config`：服务端 API，并已加入 CORS 响应。

### 1. 腾讯云只配置服务端变量

在 CloudBase 环境或 Next.js 服务端函数中配置，不要放在 GitHub Pages，也不要把值发到聊天里：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
VOLCENGINE_TTS_API_KEY=你的火山引擎 API Key
VOLCENGINE_TTS_RESOURCE_ID=seed-tts-2.0
VOLCENGINE_TTS_MODEL=seed-tts-2.0-standard
VOLCENGINE_TTS_VOICE=zh_female_vv_uranus_bigtts
VOLCENGINE_TTS_VOICE_NAME=vivi 2.0（官方预置·通用场景女声）
DEFAULT_FEMALE_SPEAKER=zh_female_vv_uranus_bigtts
DEFAULT_MALE_SPEAKER=zh_male_dayi_saturn_bigtts
CORS_ORIGIN=https://你的 GitHub 用户名.github.io
```

CloudBase 需要把这个项目作为 Next.js 服务端应用部署，使它能处理 `/api/*` 路径。推荐使用 CloudBase 控制台或官方 `tcb` CLI 创建 HTTP 函数/访问服务；部署后先确认下面三个地址能返回结果：

部署 Next.js 到 CloudBase HTTP 云函数还需要根目录的 `scf_bootstrap`，项目已经准备好，监听 CloudBase 要求的 9000 端口。普通后端构建后，CloudBase 的 standalone 产物需要补齐静态文件：

```bash
npm run build
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
```

```text
https://你的腾讯云域名/你的服务路径/api/tts/config
https://你的腾讯云域名/你的服务路径/api/chat
https://你的腾讯云域名/你的服务路径/api/tts
```

这里的 API 基地址只填写到“服务路径”，不要加 `/api/chat`，例如：

```text
https://你的环境 ID.你的地域.app.tcloudbase.com/xiaoman-api
```

### 2. GitHub Pages 配置公开地址

在 GitHub 仓库的 `Settings → Secrets and variables → Actions → Variables` 新建一个普通变量：

```text
NEXT_PUBLIC_API_BASE_URL=https://你的环境 ID.你的地域.app.tcloudbase.com/xiaoman-api
```

它只是 API 公共地址，不是密钥。工作流会根据仓库类型自动设置路径：

- 用户站点仓库：`你的用户名.github.io`，不需要子路径。
- 项目站点仓库：`你的用户名/仓库名`，自动使用 `/仓库名`。

然后在 GitHub 仓库的 `Settings → Pages` 将发布来源设为 `GitHub Actions`，向 `main` 推送代码即可。工作流发布的是 `out/` 静态目录。

### 3. 跨域设置

腾讯云的 `CORS_ORIGIN` 要填写 GitHub Pages 的“源”，只写协议和域名，不带路径：

```text
CORS_ORIGIN=https://你的用户名.github.io
```

如果以后绑定自定义域名，把它替换为自定义域名并重新部署后端。API Key 始终只留在腾讯云环境变量中。

## 当前实现

- ASR：`SpeechRecognition / webkitSpeechRecognition`，中文 `zh-CN`
- TTS：`DoubaoTTSProvider` → 火山引擎 Seed-TTS 2.0；失败自动 fallback 到 `BrowserSpeechSynthesisProvider`
- Voice Lab：`/voice-lab` 提供候选音色筛选、Runtime Probe、Emotion Scale、语速/音量、Context Instruction 和 36 条实际试听矩阵；能力未验证的音色不会被标记为支持 Emotion。
- Emotion Performance：Relationship Engine → Emotion Performance Plan → Seed-TTS 2.0；内部情绪只映射到当前 speaker 已验证的 API emotion，不支持时自动改用 context / 语速 / 音量并记录 fallback。
- LLM：DeepSeek `deepseek-chat`；无 Key 时为 mock
- 场景：晚回家、没回消息、忘记答应的事、自由对话
- 记忆：当前页面会话内保留最近 10 轮，不使用数据库
- Provider：`LLMProvider`、`ASRProvider`、`TTSProvider`

## 浏览器

优先使用 Chrome Desktop 或 Chrome Android，并允许麦克风权限。Safari / iPhone 的语音识别支持可能受限，页面会给出提示。

## 验证

```bash
npm run build
npm run lint
```

GitHub Pages 和腾讯云的真实域名、账号权限、费用与 API 凭证仍需要在对应控制台完成；本地代码不会自动替用户创建云函数或推送 GitHub。

## Conflict Data Engine V0.1

新增模块位于 `src/conflict-engine/`，按以下顺序参与 `/api/chat`：

`Classifier → State Update → Strategy Selector → Episode Retriever → Prompt Builder → DeepSeek → Response Validator`

seed 数据位于 `data/conflicts/`：50 个场景、150 个 synthetic episodes、1500 条 turns；包含 8 种 archetype 和结构化 strategy / transition 数据。普通用户不会看到这些后台字段。

调试模式：

```text
http://localhost:3001/?debug=true
```

调试面板会显示用户策略、置信度、情绪状态、冲突强度、选中策略、召回 episode 和 Validator 结果。

## 上线到 Vercel

这是一个 Next.js 全栈项目，`/api/chat` 和 `/api/tts` 会作为服务端函数运行。可以在项目根目录使用 Vercel CLI 部署：

```bash
npx vercel login
npx vercel
npx vercel --prod
```

部署前，在 Vercel 项目的 Settings → Environment Variables 中，为 `Production`（建议同时勾选 `Preview`）配置以下变量：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
VOLCENGINE_TTS_API_KEY=你的火山引擎 API Key
VOLCENGINE_TTS_RESOURCE_ID=seed-tts-2.0
VOLCENGINE_TTS_MODEL=seed-tts-2.0-standard
VOLCENGINE_TTS_VOICE=zh_female_vv_uranus_bigtts
VOLCENGINE_TTS_VOICE_NAME=vivi 2.0（官方预置·通用场景女声）
```

不要把 API Key 写成 `NEXT_PUBLIC_*`，也不要提交 `.env.local`。Vercel 环境变量修改后需要重新部署才会对新版本生效。部署后访问首页，再打开 `https://你的域名/api/tts/config`，确认返回 `configured: true` 和音色列表。

当前版本不需要数据库，聊天记录只保存在用户本次页面会话中。公开分享前建议先做小范围测试；如果后续面向大量用户或商业使用，需要增加 API 限流、用量监控，并根据 Vercel 计划和 DeepSeek/火山引擎账户的实际计费规则控制成本。

数据脚本：

```bash
npm run seed:generate
npm run conflicts:validate
npm run conflicts:import -- data/raw/example.jsonl
npm run conflicts:normalize -- data/raw/example.normalized.json
npm run conflicts:annotate -- data/raw/example.normalized.json
npm run conflicts:augment
```

真人数据导入前必须经过来源授权、匿名化和人工复核；`annotate` 默认只处理 5 条，可用 `ANNOTATE_LIMIT` 调整。
