<script setup>
import { computed, onBeforeUnmount, ref, watchEffect } from "vue";

const props = defineProps({
  prefs: { type: Object, required: true },
  messages: { type: Array, required: true },
});

const phase = ref("idle"); // idle | running | done
const secondsLeft = ref(180);
const stepIdx = ref(0);
let timer = null;

const steps = [
  { t: "把肩放松一点", q: "此刻最紧的地方在哪？" },
  { t: "把脚踩稳", q: "脚底接触到什么？温度/质地是什么？" },
  { t: "慢慢呼吸", q: "你能听见周围最远的声音是什么？" },
  { t: "握住现实", q: "你能看见 3 个具体的物体吗？" },
  { t: "回到自己", q: "如果只做一件小事，是什么？" },
];

function lastUserText() {
  const arr = Array.isArray(props.messages) ? props.messages : [];
  const users = arr.filter((m) => m?.role === "user" && typeof m?.content === "string").slice(-10);
  return users.map((m) => m.content).join("\n").slice(0, 1200);
}

function inferTopic(text) {
  const t = String(text || "").toLowerCase();
  const has = (kws) => kws.some((k) => t.includes(k));
  if (has(["作业", "论文", "考试", "绩点", "挂科", "ddl", "复习", "导师", "实验", "上课", "学习", "考研", "研究生"])) return "study";
  if (has(["工作", "上班", "老板", "同事", "加班", "绩效", "面试", "offer", "实习", "离职", "工资"])) return "work";
  if (has(["失眠", "睡不着", "睡眠", "做梦", "凌晨", "熬夜", "头疼", "胃", "心跳", "胸闷", "焦虑", "紧张", "恐慌", "呼吸"])) return "body";
  if (has(["家人", "父母", "妈妈", "爸爸", "家庭", "吵架", "冷战", "亲戚"])) return "family";
  if (has(["对象", "男朋友", "女朋友", "分手", "暧昧", "喜欢", "恋爱", "相处", "聊天", "拉黑"])) return "relationship";
  if (has(["钱", "欠", "房租", "花呗", "信用卡", "贷款", "存款", "消费", "经济"])) return "money";
  if (has(["难受", "委屈", "内疚", "羞耻", "崩溃", "麻木", "烦", "累", "没劲", "想哭"])) return "mood";
  return "general";
}

const quickBank = {
  general: [
    { q: "如果把此刻的压力写成一个标题，会叫什么？", hint: "用 7 个字以内概括。" },
    { q: "你现在最需要的不是建议，而是什么？", hint: "比如：被听见/被理解/被陪着/被肯定。" },
    { q: "把问题切到最小：下一步只做 2 分钟，做什么？", hint: "越小越好：喝水/洗脸/站起来。" },
  ],
  mood: [
    { q: "这股情绪在保护你什么？", hint: "它可能是在提醒你某个界限被碰到了。" },
    { q: "如果情绪能说一句话，它会怎么说？", hint: "用第一人称：我想要… / 我害怕…" },
    { q: "你想被怎么对待？用一个动词。", hint: "比如：抱住/确认/陪着/放过。" },
  ],
  body: [
    { q: "你能给身体一个 0-10 的紧绷分吗？", hint: "写数字就行，不需要解释。" },
    { q: "哪里最需要松一松？肩/下颌/胃/手？", hint: "选一个部位就好。" },
    { q: "你愿意做一个 10 秒的小动作吗？", hint: "把舌尖放下、呼气变慢一点。" },
  ],
  study: [
    { q: "这件学习任务最卡的一步是哪一步？", hint: "选：开始/理解/写/改/交。" },
    { q: "把它拆成 25 分钟，你先做哪 10 分钟？", hint: "只写一个具体动作：列提纲/找参考/写第一段。" },
    { q: "如果只降低一点点标准，你会怎么改？", hint: "把‘完美’改成‘能交’。" },
  ],
  work: [
    { q: "今天最消耗你的点是什么？", hint: "人/事/节奏/不确定性？" },
    { q: "你能为自己划一条小界限吗？", hint: "比如：今晚 11 点后不回消息。" },
    { q: "把任务写成一句最小指令。", hint: "例如：打开文档→写三条要点。" },
  ],
  relationship: [
    { q: "你最在意的是对方的哪个动作/没做的动作？", hint: "用一个具体行为描述。" },
    { q: "如果你只说一句需求，会说什么？", hint: "例如：我需要你今天回我一句就好。" },
    { q: "你希望这段关系变成什么样？", hint: "三个词：稳定/尊重/轻松…" },
  ],
  family: [
    { q: "你最难受的是被误解，还是被控制？", hint: "二选一，也可以选‘都’。" },
    { q: "你想守住的底线是什么？", hint: "一句话写清楚边界。" },
    { q: "如果今天只缓和 5%，你会怎么做？", hint: "比如：先离开现场 10 分钟。" },
  ],
  money: [
    { q: "最压你的，是金额，还是不确定性？", hint: "选一个核心压力源。" },
    { q: "把‘钱的问题’拆成一个今天能完成的动作。", hint: "例如：列账单、看还款日、发一条消息。" },
    { q: "如果只做一次止损，你会做什么？", hint: "停一个订阅/删一个购物车/设一个上限。" },
  ],
};

const funBank = [
  { q: "什么东西越洗越脏？", a: "水。" },
  { q: "什么门永远关不上？", a: "球门。" },
  { q: "什么东西越用越小？", a: "橡皮。" },
  { q: "什么车最不怕堵？", a: "风车。" },
  { q: "什么东西有头无尾？", a: "硬币。" },
  { q: "什么东西每天都要打一次？", a: "打卡。" },
];

function pickOne(list, salt = "") {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;
  let h = 0;
  const s = `${Date.now()}|${salt}|${Math.random()}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

const topic = computed(() => inferTopic(lastUserText()));
const quick = ref({ q: "", hint: "" });
const fun = ref({ q: "", a: "" });
const showHint = ref(false);
const showAnswer = ref(false);

function nextQuick() {
  showHint.value = false;
  quick.value = pickOne(quickBank[topic.value] || quickBank.general, topic.value) || { q: "", hint: "" };
}
function nextFun() {
  showAnswer.value = false;
  fun.value = pickOne(funBank, "fun") || { q: "", a: "" };
}

watchEffect(() => {
  // 当用户最近聊天变化时，刷新一次快问快答更贴近当下；进行中不打断节拍
  if (phase.value === "running") return;
  nextQuick();
  nextFun();
});

const progress = computed(() => {
  const total = 180;
  return Math.min(1, Math.max(0, (total - secondsLeft.value) / total));
});

function ensurePrefs() {
  if (!props.prefs.ritual || typeof props.prefs.ritual !== "object") {
    props.prefs.ritual = { lastAt: 0, history: [] };
  }
}

watchEffect(() => {
  ensurePrefs();
});

const topicLabel = computed(() => {
  const map = {
    general: "此刻",
    mood: "情绪",
    body: "身体",
    study: "学习",
    work: "工作",
    relationship: "关系",
    family: "家庭",
    money: "金钱",
  };
  return map[topic.value] || "此刻";
});

const comfortBank = {
  general: [
    "你能来到这里就已经很不容易了。我们先把这一步走稳。",
    "不用急着把一切讲清楚。你只要在这儿，我就会在。",
    "先把呼吸放慢一点点，剩下的我们一点点来。",
  ],
  mood: [
    "你不是太敏感，你只是很在乎。难受是有原因的。",
    "情绪不是敌人，它是在替你举手：我需要被照顾。",
    "先允许自己难受一会儿。你不需要马上变好。",
  ],
  body: [
    "如果身体在绷着，那就先照顾身体：慢一点、软一点。",
    "你已经扛了很久了。现在我们做一次更轻的呼气。",
    "先把肩和下颌松开一点点，就算只松 5%。",
  ],
  study: [
    "你不是做不到，你只是太累了。先从最小的一段开始。",
    "把“完美”先放到一边，今天先做到“能交/能推进”。",
    "你已经在努力了。哪怕只写一行，也是在向前。",
  ],
  work: [
    "你不是不够好，是事情太多了。先抓住一个最关键的点。",
    "今天先把自己从消耗里捞出来一点点，再谈效率。",
    "你可以为自己留一点边界：先照顾人，再照顾事。",
  ],
  relationship: [
    "在关系里难受很正常，你想要的只是被认真对待。",
    "你不需要用委屈换靠近。你的需求是合理的。",
    "先把自己放回第一位：你希望被怎么对待，就怎么对待自己。",
  ],
  family: [
    "你想要的可能只是被理解，而不是被指挥。很合理。",
    "先把界限守住一点点，你的感受也值得被尊重。",
    "你已经很努力在顾全了。今天先顾一顾你自己。",
  ],
  money: [
    "钱的压力会放大很多情绪。你已经在面对它了，这很勇敢。",
    "先把问题缩小成一个动作：写下来，就会更可控。",
    "别一个人扛着。你可以慢慢来，不需要一天解决全部。",
  ],
};

const comfort = ref("");
function nextComfort() {
  comfort.value = (pickOne(comfortBank[topic.value] || comfortBank.general, `comfort:${topic.value}`) || "").trim();
}

function reset() {
  stop();
  phase.value = "idle";
  secondsLeft.value = 180;
  stepIdx.value = 0;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function start() {
  ensurePrefs();
  reset();
  phase.value = "running";
  nextComfort();
  timer = setInterval(() => {
    secondsLeft.value = Math.max(0, secondsLeft.value - 1);
    const passed = 180 - secondsLeft.value;
    stepIdx.value = Math.min(steps.length - 1, Math.floor(passed / 36));
    if (secondsLeft.value <= 0) finish();
  }, 1000);
}

function finish() {
  stop();
  phase.value = "done";
  const rec = {
    ts: Date.now(),
    line: String(comfort.value || "").trim().slice(0, 80),
    step: steps[stepIdx.value]?.t || "",
  };
  props.prefs.ritual.lastAt = rec.ts;
  props.prefs.ritual.history = Array.isArray(props.prefs.ritual.history) ? props.prefs.ritual.history : [];
  props.prefs.ritual.history.unshift(rec);
  props.prefs.ritual.history = props.prefs.ritual.history.slice(0, 12);
}

onBeforeUnmount(() => stop());
</script>

<template>
  <div class="wrap">
    <div class="hero">
      <div class="kicker">陪伴小馆</div>
      <div class="title">3 分钟·把你带回此刻</div>
      <div class="desc">
        不需要解释太多。跟着节拍走一小段，再用快问快答和趣味问答把心绪稳住一点。
      </div>

      <div class="heroGrid">
        <div class="stack top">
          <div class="ring">
            <div class="ringInner" :style="{ '--p': progress }">
              <div class="ringLabel">
                <div class="s">{{ phase === "running" ? "进行中" : phase === "done" ? "完成" : "待开始" }}</div>
                <div class="n">{{ Math.floor(secondsLeft / 60) }}:{{ String(secondsLeft % 60).padStart(2, "0") }}</div>
              </div>
            </div>
          </div>

          <div class="beat">
            <div class="beatLine">
              <div class="beatFill" :style="{ width: `${progress * 100}%` }" />
            </div>
            <div class="beatMeta">
              <div class="beatT">{{ steps[stepIdx]?.t }}</div>
              <div class="beatS">每一步约 36 秒</div>
            </div>
          </div>
        </div>

        <div class="stack bottom">
          <div class="comfort">
            <div class="pTitle">给你的暖心安慰</div>
            <div class="pQ">{{ comfort }}</div>
            <div class="qaActions">
              <button class="ghost mini" @click="nextComfort">换一句</button>
            </div>
          </div>

          <div class="qaGrid">
            <div class="qa qaLeft">
              <div class="qaHead">
                <div class="qaTitle">快问快答</div>
                <div class="qaTag">识别：{{ topicLabel }}</div>
              </div>
              <div class="qaQ">{{ quick.q }}</div>
              <div class="qaActions">
                <button class="ghost mini" @click="nextQuick">换一题</button>
                <button class="ghost mini" @click="showHint = !showHint">{{ showHint ? "收起提示" : "看提示" }}</button>
              </div>
              <div v-if="showHint" class="qaHint">{{ quick.hint }}</div>
            </div>

            <div class="qa qaRight">
              <div class="qaHead">
                <div class="qaTitle">趣味问答</div>
                <div class="qaTag">脑筋急转弯</div>
              </div>
              <div class="qaQ">{{ fun.q }}</div>
              <div class="qaActions">
                <button class="ghost mini" @click="nextFun">再来一个</button>
                <button class="ghost mini" @click="showAnswer = !showAnswer">{{ showAnswer ? "收起答案" : "看答案" }}</button>
              </div>
              <div v-if="showAnswer" class="qaHint">答案：{{ fun.a }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button v-if="phase !== 'running'" class="primary" @click="start">开始 3 分钟</button>
        <button v-else class="ghost" @click="finish">提前完成</button>
        <button class="ghost" @click="reset">重置</button>
      </div>

      <div v-if="props.prefs?.ritual?.history?.length" class="history">
        <div class="hTitle">最近的几次</div>
        <div class="hList">
          <div v-for="h in props.prefs.ritual.history.slice(0, 6)" :key="h.ts" class="hItem">
            <div class="hTime">{{ new Date(h.ts).toLocaleString() }}</div>
            <div class="hLine">{{ h.line || "（未留下文字）" }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  padding: 2px;
}

.hero {
  border-radius: 18px;
  border: 1px solid var(--border);
  background: #fffdf8;
  box-shadow: 0 10px 30px rgba(44, 36, 25, 0.14);
  padding: 14px;
  position: relative;
  overflow: hidden;
}

.hero::before {
  content: "";
  position: absolute;
  inset: -40px -60px auto -60px;
  height: 220px;
  background:
    radial-gradient(closest-side at 30% 35%, rgba(201, 125, 74, 0.22), transparent 65%),
    radial-gradient(closest-side at 72% 20%, rgba(184, 111, 63, 0.18), transparent 60%),
    radial-gradient(closest-side at 55% 78%, rgba(231, 216, 200, 0.35), transparent 70%);
  transform: rotate(-6deg);
  pointer-events: none;
}

.kicker {
  position: relative;
  display: inline-block;
  font-weight: 900;
  letter-spacing: 0.18em;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.04);
}
.title {
  position: relative;
  margin-top: 10px;
  font-size: 16.5px;
  font-weight: 900;
  color: var(--text);
}
.desc {
  position: relative;
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--muted);
}

.heroGrid {
  position: relative;
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.stack {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px;
  background: #fefcf8;
}

.stack.top {
  transform: rotate(-1.1deg);
}
.stack.bottom {
  transform: rotate(0.7deg);
  margin-left: 10px;
  background: linear-gradient(135deg, rgba(201, 125, 74, 0.08), rgba(254, 252, 248, 0.98));
}

.ring {
  display: grid;
  place-items: center;
}
.ringInner {
  width: 120px;
  height: 120px;
  border-radius: 999px;
  background:
    conic-gradient(from 180deg, rgba(201, 125, 74, 0.92) calc(var(--p) * 1turn), rgba(44, 36, 25, 0.08) 0),
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.55));
  display: grid;
  place-items: center;
  border: 1px solid rgba(44, 36, 25, 0.14);
  box-shadow: 0 10px 18px rgba(44, 36, 25, 0.12);
}
.ringLabel {
  width: 86px;
  height: 86px;
  border-radius: 999px;
  background: #fffdf8;
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  text-align: center;
}
.ringLabel .s {
  font-size: 11px;
  color: var(--muted);
  font-weight: 900;
  letter-spacing: 0.08em;
}
.ringLabel .n {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
}

.beat {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}
.beatLine {
  height: 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.06);
  overflow: hidden;
}
.beatFill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
}
.beatMeta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.beatT {
  font-weight: 900;
  color: var(--text);
  font-size: 13px;
}
.beatS {
  color: var(--muted);
  font-size: 11.5px;
}

.comfort {
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.04);
  padding: 10px 10px;
}

.qaGrid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 10px;
}

.qa {
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.03);
  padding: 10px 10px;
}
.qaLeft {
  transform: rotate(-0.6deg);
}
.qaRight {
  transform: rotate(0.7deg);
  margin-top: 8px;
  background: linear-gradient(135deg, rgba(231, 216, 200, 0.3), rgba(254, 252, 248, 0.98));
}
.qaHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.qaTitle {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 900;
  letter-spacing: 0.08em;
}
.qaTag {
  font-size: 10.5px;
  color: var(--muted);
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.04);
  border-radius: 999px;
  padding: 4px 8px;
  font-weight: 900;
  letter-spacing: 0.06em;
}
.qaQ {
  margin-top: 8px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  font-weight: 900;
}
.qaActions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mini {
  padding: 8px 10px;
}
.qaHint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  border-left: 3px solid rgba(201, 125, 74, 0.5);
  padding-left: 10px;
}

@media (max-width: 520px) {
  .qaGrid {
    grid-template-columns: 1fr;
  }
  .qaRight {
    margin-top: 0;
    margin-left: 10px;
  }
}
.pTitle {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 900;
  letter-spacing: 0.06em;
}
.pQ {
  margin-top: 8px;
  color: var(--text);
  font-size: 13.5px;
  line-height: 1.5;
  font-weight: 800;
}

.actions {
  position: relative;
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
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

.history {
  position: relative;
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.hTitle {
  font-weight: 900;
  color: var(--text);
  font-size: 12.5px;
}
.hList {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}
.hItem {
  border-radius: 14px;
  background: rgba(44, 36, 25, 0.04);
  border: 1px solid var(--border);
  padding: 10px 10px;
}
.hTime {
  font-size: 11px;
  color: var(--muted);
}
.hLine {
  margin-top: 6px;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 13px;
  color: var(--text);
  font-weight: 800;
}
</style>
