# AI 心灵树洞（Vue + Express + Docker）

一个“像朋友聊天”的中文对话网站（单机部署版）：

- **前端**：Vue 3 + Vite
- **后端**：Node.js + Express（同域名提供 `/api/*`）
- **模型**：OpenAI 兼容接口（默认按 DeepSeek 配置）
- **限制**：AI 单条回复 ≤ 50 个中文字符
- **账号**：注册 / 登录 / 退出（演示版：账号与聊天记录存在服务内存中）
- **语音**：可选语音输入（浏览器 Web Speech API）+ 语音朗读（后端在线 TTS）

## 功能

- **普通朋友式回复**：口语化，不“文艺腔”
- **情绪树**：每次回复都会记录一片叶子
- **快捷按钮**：命名情绪 / 生成回声卡等
- **话题限制**：暴力/色情/恐怖等敏感话题会被拒聊
- **语音输入**：点“语音输入”把说的话转成文字（可选“说完自动发”）
- **语音输出**：勾选“朗读回复”，由后端在线 TTS 合成并播放（豆包/火山引擎）

## 本地开发

```bash
cd cloudrun
npm install
npm run dev
```

## 环境变量（后端）

后端支持以下环境变量：

- `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY`：至少提供一个
- `OPENAI_BASE_URL`：默认 `https://api.deepseek.com/v1`
- `OPENAI_MODEL`：默认 `deepseek-chat`
- `PORT`：默认 `8080`
- `DOUBAO_TTS_APPID`：火山引擎 AppID
- `DOUBAO_TTS_TOKEN`：火山引擎 Token / API Key
- `DOUBAO_TTS_CLUSTER`：可选，默认 `volcano_tts`
- `DOUBAO_TTS_VOICE_TYPE`：可选，默认 `BV001_streaming`

## Docker 部署（服务器）

在服务器（例如 OpenCloudOS 9）：

```bash
cd /opt/cloudrun
docker build -t ai-chat-assistant:latest .

docker rm -f ai-chat-assistant 2>/dev/null || true
docker run -d \
  --name ai-chat-assistant \
  --restart unless-stopped \
  -p 8080:8080 \
  -e DEEPSEEK_API_KEY="你的key" \
  -e OPENAI_BASE_URL="https://api.deepseek.com/v1" \
  -e OPENAI_MODEL="deepseek-chat" \
  ai-chat-assistant:latest
```

健康检查：

```bash
curl -s http://127.0.0.1:8080/api/health
```

## 语音功能的浏览器要求

- **语音输入**：Chrome/Edge 通常可用（需要麦克风权限）；Safari/部分浏览器可能不支持
- **语音朗读**：由后端生成音频并播放，浏览器只负责播放

