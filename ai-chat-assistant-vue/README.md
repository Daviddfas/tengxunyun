# AI 对话助手（Vue + CloudRun）

一个可部署到 CloudBase 云托管（CloudRun）的对话助手：

- 前端：Vue 3 + Vite
- 后端：Node.js + Express（同域名提供 `/api/chat`）
- 模型：OpenAI 兼容接口（默认按 DeepSeek 配置）

## 本地开发

```bash
cd ai-chat-assistant-vue
npm install
npm run dev
```

浏览器打开终端提示的地址。

## 环境变量（服务器端）

后端读取以下环境变量（部署到 CloudRun 时在服务配置里设置）：

- `OPENAI_API_KEY`：必填
- `OPENAI_BASE_URL`：默认 `https://api.deepseek.com/v1`
- `OPENAI_MODEL`：默认 `deepseek-chat`

## 生产构建

```bash
npm run build
npm start
```

