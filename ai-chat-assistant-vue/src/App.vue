<script setup>
import { computed, nextTick, onMounted, ref } from "vue";

const messages = ref([
  { role: "assistant", content: "你好！我可以帮你写代码、解释概念、做方案。你想聊什么？" },
]);
const input = ref("");
const loading = ref(false);
const errorText = ref("");
const listEl = ref(null);

const canSend = computed(() => input.value.trim().length > 0 && !loading.value);

async function scrollToBottom() {
  await nextTick();
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: "smooth" });
}

async function send() {
  const text = input.value.trim();
  if (!text || loading.value) return;
  errorText.value = "";
  messages.value.push({ role: "user", content: text });
  input.value = "";
  loading.value = true;
  await scrollToBottom();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }
    const data = await res.json();
    messages.value.push({ role: "assistant", content: data.reply ?? "（空响应）" });
  } catch (e) {
    errorText.value = `请求失败：${e?.message ?? e}`;
    messages.value.push({
      role: "assistant",
      content: "我刚刚请求后端失败了。请稍后再试，或检查服务器环境变量是否已配置。",
    });
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
}

function clearChat() {
  messages.value = [{ role: "assistant", content: "已清空。你想从哪里开始？" }];
  errorText.value = "";
}

onMounted(scrollToBottom);
</script>

<template>
  <div class="wrap">
    <header class="top">
      <div class="brand">
        <div class="badge">AI</div>
        <div class="title">
          <div class="name">对话助手</div>
          <div class="sub">Vue + CloudRun（同域名 API）</div>
        </div>
      </div>
      <button class="ghost" @click="clearChat">清空</button>
    </header>

    <main class="panel">
      <div ref="listEl" class="list">
        <div v-for="(m, idx) in messages" :key="idx" class="row" :data-role="m.role">
          <div class="bubble">
            <div class="role">{{ m.role === "user" ? "你" : "助手" }}</div>
            <div class="content">{{ m.content }}</div>
          </div>
        </div>
      </div>

      <div class="composer">
        <div v-if="errorText" class="error">{{ errorText }}</div>
        <div class="bar">
          <textarea
            v-model="input"
            class="input"
            rows="2"
            placeholder="输入你的问题…（Shift+Enter 换行，Enter 发送）"
            @keydown.enter.exact.prevent="send"
            @keydown.enter.shift.exact.stop
          />
          <button class="send" :disabled="!canSend" @click="send">
            {{ loading ? "发送中…" : "发送" }}
          </button>
        </div>
        <div class="hint">
          后端模型由服务器环境变量控制：<code>OPENAI_API_KEY</code> / <code>OPENAI_BASE_URL</code> /
          <code>OPENAI_MODEL</code>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 980px;
  margin: 0 auto;
  padding: 28px 18px 40px;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.badge {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 176, 0, 0.22), rgba(43, 212, 167, 0.18));
  border: 1px solid rgba(255, 255, 255, 0.14);
  letter-spacing: 0.08em;
  font-weight: 700;
}

.name {
  font-size: 22px;
  line-height: 1.1;
  font-weight: 700;
}
.sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12.5px;
}

.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
}
.ghost:hover {
  border-color: rgba(255, 255, 255, 0.32);
}

.panel {
  background: rgba(16, 24, 35, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
}

.list {
  height: min(66vh, 640px);
  overflow: auto;
  padding: 18px 18px 6px;
}

.row {
  display: flex;
  margin-bottom: 12px;
}
.row[data-role="user"] {
  justify-content: flex-end;
}
.row[data-role="assistant"] {
  justify-content: flex-start;
}

.bubble {
  max-width: 78%;
  border-radius: 16px;
  padding: 12px 12px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 14, 20, 0.55);
}
.row[data-role="user"] .bubble {
  background: linear-gradient(135deg, rgba(255, 176, 0, 0.18), rgba(255, 176, 0, 0.06));
}
.row[data-role="assistant"] .bubble {
  background: linear-gradient(135deg, rgba(43, 212, 167, 0.14), rgba(16, 24, 35, 0.6));
}

.role {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.content {
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 14.5px;
}

.composer {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding: 12px 14px 14px;
}

.error {
  color: var(--danger);
  font-size: 12.5px;
  margin-bottom: 8px;
}

.bar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;
}

.input {
  width: 100%;
  resize: none;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(7, 10, 15, 0.55);
  color: var(--text);
  padding: 12px 12px;
  outline: none;
  font-family: "Noto Serif SC", "Source Han Serif SC", "STSong", serif;
  font-size: 14px;
}
.input:focus {
  border-color: rgba(255, 176, 0, 0.55);
  box-shadow: 0 0 0 3px rgba(255, 176, 0, 0.16);
}

.send {
  border: 0;
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  color: #0b0f14;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-weight: 700;
}
.send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hint {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(159, 176, 195, 0.9);
}
code {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>

