<script setup>
/**
 * 一分钟情绪自检 - 问卷式交互
 * 基于近7天聊天生成个性化问题，引导用户自我觉察，反馈当下情绪雷达 + 七天折线图
 */
import { computed, ref } from "vue";
import EmotionRadar from "./EmotionRadar.vue";

const emit = defineEmits(["checkin"]);

const phase = ref("idle"); // idle | loading-questions | answering | submitting | done
const questions = ref([]);
const answers = ref({});
const currentIndex = ref(0);
const errorText = ref("");
const result = ref(null); // { checkin, dimensions, summary }

const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
const hasNext = computed(() => currentIndex.value < questions.value.length - 1);
const hasPrev = computed(() => currentIndex.value > 0);
const progress = computed(() =>
  questions.value.length ? Math.round(((currentIndex.value + 1) / questions.value.length) * 100) : 0
);

async function fetchQuestions() {
  phase.value = "loading-questions";
  errorText.value = "";
  try {
    const res = await fetch("/api/emotion-check/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    questions.value = data.questions || [];
    answers.value = {};
    currentIndex.value = 0;
    phase.value = questions.value.length ? "answering" : "idle";
  } catch (e) {
    errorText.value = `获取问题失败：${e?.message ?? e}`;
    phase.value = "idle";
  }
}

function setAnswer(val) {
  const q = currentQuestion.value;
  if (q) answers.value[q.id] = val;
}

function next() {
  if (hasNext.value) currentIndex.value++;
}

function prev() {
  if (hasPrev.value) currentIndex.value--;
}

async function submit() {
  const ans = Object.entries(answers.value)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([id, value]) => ({ questionId: id, id, value: String(value).trim() }));
  if (ans.length === 0) {
    errorText.value = "请至少回答一个问题";
    return;
  }
  phase.value = "submitting";
  errorText.value = "";
  try {
    const res = await fetch("/api/emotion-check/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: ans }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    result.value = data;
    const c = data.checkin;
    if (c) {
      emit("checkin", { ts: c.ts, valence: c.valence, arousal: c.arousal, label: c.label || "问卷自检", dimensions: c.dimensions, summary: c.summary });
    }
    phase.value = "done";
  } catch (e) {
    errorText.value = `提交失败：${e?.message ?? e}`;
    phase.value = "answering";
  }
}

function restart() {
  phase.value = "idle";
  result.value = null;
  questions.value = [];
  answers.value = {};
  currentIndex.value = 0;
  errorText.value = "";
}

const checkinForRadar = computed(() => {
  const r = result.value?.checkin;
  if (!r) return [];
  return [{ ts: r.ts, valence: r.valence, arousal: r.arousal, dimensions: r.dimensions }];
});
</script>

<template>
  <div class="box">
    <div class="title">一分钟情绪自检</div>
    <div class="sub">根据你近期的倾诉，我会问几个小问题，帮你觉察当下的情绪。答案会变成“情绪树”的叶片。</div>

    <!-- 开始 -->
    <div v-if="phase === 'idle'" class="idle">
      <button class="primary" @click="fetchQuestions">开始自检</button>
    </div>

    <!-- 加载问题 -->
    <div v-else-if="phase === 'loading-questions'" class="loading">正在准备问题…</div>

    <!-- 答题 -->
    <div v-else-if="phase === 'answering' || phase === 'submitting'" class="answer">
      <div v-if="errorText" class="err">{{ errorText }}</div>
      <div class="progressBar"><div class="fill" :style="{ width: progress + '%' }" /></div>
      <div v-if="currentQuestion" class="qCard">
        <div class="qText">{{ currentQuestion.text }}</div>
        <div v-if="currentQuestion.type === 'scale'" class="scaleRow">
          <input
            :value="answers[currentQuestion.id]"
            type="range"
            min="1"
            max="5"
            step="1"
            class="range"
            @input="setAnswer(Number($event.target.value))"
          />
          <div class="scaleLabels">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
          </div>
          <div class="scaleVal">{{ answers[currentQuestion.id] ?? "—" }} / 5</div>
        </div>
        <div v-else class="textRow">
          <input
            :value="answers[currentQuestion.id]"
            type="text"
            class="textIn"
            placeholder="简短写下你的感受"
            @input="setAnswer($event.target.value)"
          />
        </div>
      </div>
      <div class="navRow">
        <button v-if="hasPrev" class="ghost" :disabled="phase === 'submitting'" @click="prev">上一题</button>
        <span class="spacer" />
        <button v-if="hasNext" class="primary" :disabled="phase === 'submitting'" @click="next">下一题</button>
        <button v-else class="primary" :disabled="phase === 'submitting'" @click="submit">
          {{ phase === "submitting" ? "分析中…" : "完成" }}
        </button>
      </div>
    </div>

    <!-- 结果 -->
    <div v-else-if="phase === 'done'" class="done">
      <p v-if="result?.summary" class="summary">{{ result.summary }}</p>
      <EmotionRadar :checkins="checkinForRadar" :override-dimensions="result?.dimensions" />
      <button class="primary" @click="restart">再来一次</button>
    </div>
  </div>
</template>

<style scoped>
.box {
  padding: 14px;
  border-radius: 16px;
  background: #fefcf8;
  border: 1px solid var(--border);
}
.title {
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text);
}
.sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.4;
}
.idle {
  margin-top: 10px;
}
.loading {
  margin-top: 14px;
  color: var(--muted);
  font-size: 13px;
}
.err {
  margin-top: 8px;
  color: var(--danger, #c44d47);
  font-size: 12.5px;
}
.answer {
  margin-top: 12px;
}
.progressBar {
  height: 4px;
  border-radius: 2px;
  background: rgba(44, 36, 25, 0.08);
  overflow: hidden;
  margin-bottom: 12px;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  transition: width 0.3s ease;
}
.qCard {
  padding: 12px 0;
}
.qText {
  font-size: 14px;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 12px;
}
.scaleRow {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.range {
  width: 100%;
}
.scaleLabels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}
.scaleVal {
  font-size: 12px;
  color: var(--text);
}
.textRow {
  margin-top: 8px;
}
.textIn {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fefcf8;
  color: var(--text);
  font-family: "Noto Serif SC", "Source Han Serif SC", serif;
  font-size: 14px;
  outline: none;
}
.textIn:focus {
  border-color: var(--accent);
}
.navRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.spacer {
  flex: 1;
}
.done {
  margin-top: 12px;
}
.summary {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(201, 125, 74, 0.08);
  border-left: 3px solid var(--accent);
}
.primary {
  border: 0;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-weight: 800;
}
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
}
.ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
