# AI 对话助手（本地 Web 版）

这是一个最小可用的 AI 对话助手项目，提供：

- Streamlit Web 对话界面（支持多轮对话、历史记录）
- 支持 OpenAI 兼容接口（可配置 `base_url`，适配很多第三方中转/自建）
- 未配置 Key 时自动使用离线回退（简单规则回复），方便先把项目跑起来

## 1) 环境准备

建议使用 Python 3.10+。

```bash
cd ai-chat-assistant
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## 2) 配置（可选）

复制环境变量示例文件并填写：

```bash
copy .env.example .env
```

可配置项：

- `OPENAI_API_KEY`: 你的 API Key（必填才会走在线大模型）
- `OPENAI_BASE_URL`: OpenAI 兼容接口地址（默认 `https://api.openai.com/v1`）
- `OPENAI_MODEL`: 模型名（默认 `gpt-4o-mini`，也可换成你的提供方支持的模型）

## 3) 启动

```bash
streamlit run app.py
```

启动后浏览器会打开页面，在输入框里聊天即可。

## 4) 常见问题

### Q: 我没 Key，能用吗？

能。未配置 `OPENAI_API_KEY` 时会进入离线回退模式（用于验证 UI / 会话逻辑）。

### Q: 我想接入国产/第三方 OpenAI 兼容接口？

把 `.env` 里的 `OPENAI_BASE_URL` 改成你的提供方地址，并设置 `OPENAI_API_KEY` 与 `OPENAI_MODEL` 即可。

