<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import CheckIn from "./components/CheckIn.vue";
import MoodTree from "./components/MoodTree.vue";
import EmotionRadar from "./components/EmotionRadar.vue";
import GroundingDrawer from "./components/GroundingDrawer.vue";
import CompanionRitual from "./components/CompanionRitual.vue";
import { loadState, saveState } from "./lib/storage.js";

const persisted = loadState();
const messages = ref(
  persisted.messages.length
    ? persisted.messages
    : [{ role: "assistant", content: "这里是你的树洞。你可以把今天最难的一件事，轻轻放下来。" }]
);
const checkins = ref(persisted.checkins);
const journal = ref(persisted.journal);
const prefs = ref(persisted.prefs);

const user = ref(null);
const loginName = ref("");
const loginPassword = ref("");
const loginMode = ref("login"); // login | register
const loginLoading = ref(false);
const loginError = ref("");

const input = ref("");
const loading = ref(false);
const errorText = ref("");
const crisisMode = ref(false);
const showGrounding = ref(false);
const activeSide = ref("tree"); // tree | journal | reflect | companion
const listEl = ref(null);
const inputEl = ref(null);
const composing = ref(false);

const canSend = computed(() => {
  const live = inputEl.value?.value ?? input.value;
  return String(live ?? "").trim().length > 0 && !loading.value;
});

async function scrollToBottom() {
  await nextTick();
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: "smooth" });
}

function persist() {
  saveState({
    messages: messages.value.slice(-80),
    checkins: checkins.value.slice(-200),
    journal: journal.value.slice(-200),
    prefs: prefs.value,
  });
}

watch([messages, checkins, journal, prefs], persist, { deep: true });

async function fetchMe() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return;
    const data = await res.json();
    if (data?.ok) {
      user.value = { username: data.username || "未命名" };
    }
  } catch {
    // ignore
  }
}

async function login() {
  const name = loginName.value.trim();
  const pw = loginPassword.value;
  if (!name || !pw || loginLoading.value) return;
  loginError.value = "";
  loginLoading.value = true;
  try {
    const endpoint = loginMode.value === "register" ? "/api/register" : "/api/login";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: pw }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = await res.json();
    user.value = { username: data.username || name };
  } catch (e) {
    loginError.value = e?.message ?? String(e);
  } finally {
    loginLoading.value = false;
  }
}

async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    // ignore
  }
  user.value = null;
  loginPassword.value = "";
  input.value = "";
  crisisMode.value = false;
}

async function send(overrideText) {
  if (composing.value) {
    try {
      inputEl.value?.blur?.();
    } catch {
      // ignore
    }
    composing.value = false;
  }
  const raw =
    typeof overrideText === "string"
      ? overrideText
      : inputEl.value?.value ?? input.value;
  const text = String(raw ?? "").trim();
  if (!text || loading.value) return;
  errorText.value = "";
  crisisMode.value = false;
  messages.value.push({ role: "user", content: text });
  if (typeof overrideText !== "string") input.value = "";
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
    if (data?.crisis) crisisMode.value = true;
    const replyText = data.reply ?? "我在呢，慢慢说就好。";
    messages.value.push({ role: "assistant", content: replyText });

    const v = Number.isFinite(Number(data.valence)) ? Number(data.valence) : 3;
    const a = Number.isFinite(Number(data.arousal)) ? Number(data.arousal) : 3;
    checkins.value.push({
      ts: Date.now(),
      valence: v,
      arousal: a,
      label: "对话后的这一刻",
    });
    activeSide.value = "tree";
  } catch (e) {
    errorText.value = `请求失败：${e?.message ?? e}`;
    messages.value.push({
      role: "assistant",
      content: "我刚刚连不上树洞的另一端。请稍后再试，或检查服务器环境变量是否已配置。",
    });
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
}

function clearChat() {
  messages.value = [{ role: "assistant", content: "已清空。我们可以从“此刻的身体感受”开始。" }];
  errorText.value = "";
  crisisMode.value = false;
}

function addCheckIn(c) {
  checkins.value.push(c);
  const hint =
    `我记录下了这一刻：心情 ${c.valence}/5，紧绷 ${c.arousal}/5` + (c.label ? `（${c.label}）` : "") + "。";
  messages.value.push({ role: "assistant", content: hint + "\n\n如果你愿意，说说这背后最让你难受/最想被理解的是什么？" });
  activeSide.value = "tree";
  scrollToBottom();
}

function addJournalFromInput() {
  const text = input.value.trim();
  if (!text) return;
  journal.value.unshift({ ts: Date.now(), text });
  input.value = "";
}

async function makeReflectionCard() {
  errorText.value = "";
  loading.value = true;
  try {
    const res = await fetch("/api/reflect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.value.slice(-24) }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    messages.value.push({ role: "assistant", content: data.card ?? "（空响应）" });
    activeSide.value = "reflect";
  } catch (e) {
    errorText.value = `生成回声卡失败：${e?.message ?? e}`;
  } finally {
    loading.value = false;
    scrollToBottom();
  }
}

onMounted(() => {
  scrollToBottom();
  fetchMe();
});
</script>

<template>
  <div v-if="!user" class="loginPage">
    <div class="loginCard">
      <div class="loginTitle">AI 心灵树洞</div>
      <div class="loginSub">先注册 / 登录账号，再开始聊天。</div>

      <div class="loginTabs">
        <button class="tab" :data-on="loginMode === 'login'" @click="loginMode = 'login'">登录</button>
        <button class="tab" :data-on="loginMode === 'register'" @click="loginMode = 'register'">注册</button>
      </div>

      <div class="loginFields">
        <input
          v-model="loginName"
          class="loginInput big"
          placeholder="账号（任意昵称，建议英文或拼音）"
        />
        <input
          v-model="loginPassword"
          class="loginInput big"
          type="password"
          placeholder="密码（至少 6 位）"
          @keydown.enter.prevent="login"
        />
      </div>

      <button class="loginBtn" :disabled="loginLoading" @click="login">
        {{ loginLoading ? (loginMode === 'login' ? "登录中…" : "注册中…") : (loginMode === 'login' ? "登录" : "注册并登录") }}
      </button>

      <div v-if="loginError" class="loginError">{{ loginError }}</div>
      <div class="loginHint">仅演示用，账号数据只存在服务器内存中。</div>
    </div>
  </div>

  <div v-else class="frame">
    <aside class="side">
      <div class="sideTop">
        <div class="brand">
          <div class="badge">树洞</div>
          <div class="t">
            <div class="name">AI 心灵树洞</div>
            <div class="sub">把话放下，也把自己捡起来</div>
          </div>
        </div>
        <button class="ghost" @click="showGrounding = true">安抚练习</button>
      </div>

      <nav class="nav">
        <button class="navBtn" :data-on="activeSide === 'tree'" @click="activeSide = 'tree'">情绪树</button>
        <button class="navBtn" :data-on="activeSide === 'journal'" @click="activeSide = 'journal'">树洞日记</button>
        <button class="navBtn" :data-on="activeSide === 'reflect'" @click="activeSide = 'reflect'">回声卡片</button>
        <button class="navBtn" :data-on="activeSide === 'companion'" @click="activeSide = 'companion'">陪伴小馆</button>
      </nav>

      <div class="sideBody">
        <CheckIn @checkin="addCheckIn" />
        <div v-if="activeSide === 'tree'" class="stack">
          <MoodTree :checkins="checkins" />
          <EmotionRadar :checkins="checkins" />
        </div>

        <div v-else-if="activeSide === 'journal'" class="stack">
          <div class="box">
            <div class="title">树洞日记</div>
            <div class="sub">只保存在本机浏览器。可以把“说不出口的”写下来。</div>
            <div class="jList" v-if="journal.length">
              <div class="jItem" v-for="j in journal.slice(0, 8)" :key="j.ts">
                <div class="jTime">{{ new Date(j.ts).toLocaleString() }}</div>
                <div class="jText">{{ j.text }}</div>
              </div>
            </div>
            <div v-else class="empty">还没有日记。你可以在输入框写完后点“存为日记”。</div>
          </div>
        </div>

        <div v-else-if="activeSide === 'reflect'" class="stack">
          <div class="box">
            <div class="title">树洞回声卡片</div>
            <div class="sub">把最近的对话压成一张卡：经历 / 需要 / 下一小步 / 温柔一句。</div>
            <button class="primary wide" @click="makeReflectionCard" :disabled="loading">生成一张</button>
            <div class="small">提示：生成会写入对话区，方便复制保存。</div>
          </div>
        </div>

        <div v-else class="stack">
          <CompanionRitual :prefs="prefs" :messages="messages" />
        </div>

        <div class="foot">
          <div class="disc">
            提醒：这是陪伴与自我梳理工具，不替代专业帮助。若你有自伤/自杀风险，请立刻联系 110/120 或身边可信的人。
          </div>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="top">
        <div class="topLeft">
          <div class="pill" v-if="crisisMode" data-warn="true">安全优先：建议寻求即时帮助</div>
        </div>
        <div class="topRight">
          <div v-if="user" class="me">
            <span class="meName">{{ user.username }}</span>
            <button class="ghost smallBtn" @click="logout">退出</button>
          </div>
          <button class="ghost" @click="clearChat">清空对话</button>
        </div>
      </header>

      <section class="panel">
        <div ref="listEl" class="list">
          <div v-for="(m, idx) in messages" :key="idx" class="row" :data-role="m.role">
            <div class="bubble">
              <div class="role">{{ m.role === "user" ? "你" : "树洞" }}</div>
              <div class="content">{{ m.content }}</div>
            </div>
          </div>
        </div>

        <div class="composer">
          <div v-if="errorText" class="error">{{ errorText }}</div>

          <div class="quick">
            <button class="q" @click="showGrounding = true">我想先缓一缓</button>
            <button
              class="q"
              @click="send('我现在的感受像什么？请你帮我用更准确的词说出来。')"
            >
              帮我命名情绪
            </button>
            <button class="q" @click="makeReflectionCard" :disabled="loading">生成回声卡</button>
          </div>

          <div class="bar">
            <textarea
              ref="inputEl"
              v-model="input"
              class="input"
              rows="2"
              placeholder="把想说的写下来…（Shift+Enter 换行，Enter 发送）"
              @compositionstart="composing = true"
              @compositionend="composing = false"
              @keydown.enter.exact.prevent="send()"
              @keydown.enter.shift.exact.stop
            />
            <div class="btnCol">
              <button
                class="send"
                type="button"
                :disabled="!canSend"
                @pointerup.prevent="send()"
                @touchend.prevent="send()"
                @click.prevent="send()"
              >
                {{ loading ? "对方在听…" : "倾诉" }}
              </button>
              <button class="ghost smallBtn" @click="addJournalFromInput">存为日记</button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <GroundingDrawer :open="showGrounding" @close="showGrounding = false" />
  </div>
</template>

<style scoped>
.frame {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  max-width: 1220px;
  margin: 0 auto;
  padding: 22px 18px 30px;
}

.side {
  position: sticky;
  top: 14px;
  height: calc(100vh - 28px);
  overflow: auto;
  border-radius: 18px;
  background: #fefcf8;
  border: 1px solid var(--border);
  box-shadow: 0 8px 32px var(--shadow);
}

.sideTop {
  padding: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.badge {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(201, 125, 74, 0.22), rgba(184, 111, 63, 0.18));
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 900;
  letter-spacing: 0.08em;
}
.t .name {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.02em;
  color: var(--text);
}
.t .sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12.5px;
}

.nav {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.navBtn {
  flex: 1;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.06);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: 900;
  font-size: 12px;
}
.navBtn[data-on="true"] {
  border-color: var(--accent);
  background: rgba(201, 125, 74, 0.12);
  box-shadow: 0 0 0 2px rgba(201, 125, 74, 0.2);
}

.sideBody {
  padding: 14px;
}
.stack {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}
.box {
  padding: 14px;
  border-radius: 16px;
  background: #fefcf8;
  border: 1px solid var(--border);
}
.box .title {
  font-weight: 900;
  color: var(--text);
}
.box .sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.4;
}
.primary {
  border: 0;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-weight: 900;
}
.wide {
  width: 100%;
  margin-top: 10px;
}
.small {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
}
.empty {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12.5px;
}
.jList {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}
.jItem {
  border-radius: 14px;
  background: rgba(44, 36, 25, 0.05);
  border: 1px solid var(--border);
  padding: 10px 10px;
}
.jTime {
  font-size: 11.5px;
  color: var(--muted);
}
.jText {
  margin-top: 6px;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 13.5px;
  color: var(--text);
}
.foot {
  margin-top: 12px;
}
.disc {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.main {
  min-width: 0;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.topLeft {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pill {
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.06);
  padding: 8px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text);
}
.pill[data-warn="true"] {
  border-color: var(--danger);
  background: rgba(196, 77, 71, 0.1);
}

.panel {
  background: #fefcf8;
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 8px 32px var(--shadow);
}
.list {
  height: min(72vh, 720px);
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
  max-width: 76%;
  border-radius: 16px;
  padding: 12px 12px 10px;
  border: 1px solid var(--border);
  background: #fefcf8;
}
.row[data-role="user"] .bubble {
  background: linear-gradient(135deg, rgba(201, 125, 74, 0.15), rgba(255, 251, 245, 0.98));
}
.row[data-role="assistant"] .bubble {
  background: #fefcf8;
}
.role {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.content {
  white-space: pre-wrap;
  line-height: 1.58;
  font-size: 14.5px;
  color: var(--text);
}
.composer {
  border-top: 1px solid var(--border);
  padding: 12px 14px 14px;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
  margin-bottom: 8px;
}
.quick {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.q {
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.06);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
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
  border: 1px solid var(--border);
  background: #fefcf8;
  color: var(--text);
  padding: 12px 12px;
  outline: none;
  font-family: "Noto Serif SC", "Source Han Serif SC", "STSong", serif;
  font-size: 14px;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(201, 125, 74, 0.2);
}
.btnCol {
  display: grid;
  gap: 8px;
}
.send {
  border: 0;
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-weight: 900;
}
.send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
}
.smallBtn {
  padding: 10px 12px;
}

.voiceBar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin: 8px 0 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.04);
  border-radius: 999px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text);
}
.chip input {
  accent-color: var(--accent);
}

.me {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.meName {
  font-weight: 800;
  color: var(--text);
}

.loginPage {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fefcf8;
}
.loginCard {
  width: 360px;
  max-width: 92vw;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: #fffdf8;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  padding: 22px 20px 18px;
}
.loginTitle {
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
}
.loginSub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
.loginTabs {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.tab {
  flex: 1;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.04);
  padding: 8px 10px;
  font-size: 13px;
  cursor: pointer;
}
.tab[data-on="true"] {
  border-color: var(--accent);
  background: rgba(201, 125, 74, 0.12);
}
.loginFields {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}
.loginInput {
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 9px 10px;
  background: #fefcf8;
  color: var(--text);
  font-size: 13px;
}
.loginBtn {
  width: 100%;
  margin-top: 14px;
  border-radius: 14px;
  border: 0;
  padding: 10px 12px;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}
.loginBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.loginError {
  margin-top: 8px;
  font-size: 12px;
  color: var(--danger);
}
.loginHint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}

@media (max-width: 980px) {
  .frame {
    grid-template-columns: 1fr;
  }
  .side {
    position: relative;
    height: auto;
  }
  .bubble {
    max-width: 92%;
  }
}
</style>

