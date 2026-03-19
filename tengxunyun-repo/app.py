import os

import streamlit as st
from dotenv import load_dotenv

from assistant import chat


load_dotenv()

st.set_page_config(page_title="AI 对话助手", page_icon="💬", layout="centered")

st.title("AI 对话助手")
st.caption("支持 OpenAI 兼容接口；未配置 Key 时自动离线回退。")


if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "system", "content": "你是一个中文 AI 助手，回答要清晰、简洁、可操作。"}
    ]


with st.sidebar:
    st.subheader("配置状态")
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip()
    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()

    st.write("- **模式**:", "在线大模型" if api_key else "离线回退")
    st.write("- **BASE_URL**:", base_url)
    st.write("- **MODEL**:", model)

    if st.button("清空对话", use_container_width=True):
        st.session_state.messages = [
            {"role": "system", "content": "你是一个中文 AI 助手，回答要清晰、简洁、可操作。"}
        ]
        st.rerun()


for m in st.session_state.messages:
    if m["role"] == "system":
        continue
    with st.chat_message(m["role"]):
        st.markdown(m["content"])


prompt = st.chat_input("输入你的问题/需求…")
if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("思考中…"):
            reply = chat(st.session_state.messages)
        st.markdown(reply)

    st.session_state.messages.append({"role": "assistant", "content": reply})

