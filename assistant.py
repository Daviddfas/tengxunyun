from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Dict, Optional


Message = Dict[str, str]  # {"role": "system"|"user"|"assistant", "content": "..."}


@dataclass(frozen=True)
class ModelConfig:
    api_key: str
    base_url: str
    model: str


def load_config() -> ModelConfig:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip()
    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
    return ModelConfig(api_key=api_key, base_url=base_url, model=model)


def offline_reply(messages: List[Message]) -> str:
    last_user: Optional[str] = None
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user = (m.get("content") or "").strip()
            break

    if not last_user:
        return "你好！请告诉我你想聊什么。"

    if "你好" in last_user or "hello" in last_user.lower():
        return "你好！我已经准备好了。你可以直接提需求，比如“帮我写一段 Python 代码”或“解释一下某个概念”。"

    if "总结" in last_user:
        return "我现在处于离线回退模式，无法真正调用大模型来总结长文本。你可以先配置 `OPENAI_API_KEY`，然后我会给出更准确的总结。"

    return (
        "我现在处于离线回退模式（未检测到 `OPENAI_API_KEY`）。\n\n"
        f"你刚刚说的是：{last_user}\n\n"
        "如果你希望接入大模型，请在 `.env` 里设置 `OPENAI_API_KEY`，并（可选）设置 `OPENAI_BASE_URL`/`OPENAI_MODEL`。"
    )


def chat(messages: List[Message]) -> str:
    cfg = load_config()
    if not cfg.api_key:
        return offline_reply(messages)

    from openai import OpenAI

    client = OpenAI(api_key=cfg.api_key, base_url=cfg.base_url)

    resp = client.chat.completions.create(
        model=cfg.model,
        messages=messages,
        temperature=0.7,
    )
    return (resp.choices[0].message.content or "").strip() or "（空响应）"

