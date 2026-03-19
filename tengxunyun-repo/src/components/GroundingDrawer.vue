<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, required: true },
});
const emit = defineEmits(["close"]);

const active = ref("breath");
const seconds = ref(60);
const running = ref(false);
let timer = null;

const title = computed(() => {
  if (active.value === "breath") return "呼吸：60 秒回到当下";
  if (active.value === "54321") return "5-4-3-2-1：感官着陆";
  return "给自己一句温柔的话";
});

function start() {
  if (running.value) return;
  running.value = true;
  timer = setInterval(() => {
    seconds.value -= 1;
    if (seconds.value <= 0) stop(true);
  }, 1000);
}

function stop(reset = false) {
  running.value = false;
  if (timer) clearInterval(timer);
  timer = null;
  if (reset) seconds.value = 60;
}

watch(
  () => props.open,
  (v) => {
    if (!v) stop(true);
  }
);

function close() {
  emit("close");
}
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="close">
    <div class="panel">
      <div class="head">
        <div class="hTitle">{{ title }}</div>
        <button class="x" @click="close">关闭</button>
      </div>

      <div class="tabs">
        <button class="tab" :data-on="active === 'breath'" @click="active = 'breath'">呼吸</button>
        <button class="tab" :data-on="active === '54321'" @click="active = '54321'">5-4-3-2-1</button>
        <button class="tab" :data-on="active === 'soft'" @click="active = 'soft'">温柔一句</button>
      </div>

      <div v-if="active === 'breath'" class="body">
        <div class="big">{{ seconds }}s</div>
        <div class="p">吸气 4 秒 → 停 2 秒 → 呼气 6 秒。只要跟着节奏就好。</div>
        <div class="row">
          <button class="btn" @click="start" :disabled="running">开始</button>
          <button class="btn ghost" @click="stop()">暂停</button>
          <button class="btn ghost" @click="stop(true)">重置</button>
        </div>
      </div>

      <div v-else-if="active === '54321'" class="body">
        <ol class="list">
          <li>看见 5 个你能看到的东西。</li>
          <li>触摸 4 个你能触到的东西。</li>
          <li>听见 3 个你能听到的声音。</li>
          <li>闻到 2 个你能闻到的气味。</li>
          <li>尝到 1 个你能尝到的味道（或想象）。</li>
        </ol>
        <div class="p">做完之后，给自己一句：“我已经回来了。”</div>
      </div>

      <div v-else class="body">
        <div class="quote">
          你不需要现在就解决一切。你只需要把这一分钟好好活过去。
        </div>
        <div class="p">如果你愿意，把这句话复制给自己，或者改成更像你的版本。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(44, 36, 25, 0.4);
  display: grid;
  place-items: end center;
  padding: 18px;
  z-index: 50;
}
.panel {
  width: min(980px, 100%);
  border-radius: 18px;
  background: #fefcf8;
  border: 1px solid var(--border);
  box-shadow: 0 20px 60px var(--shadow);
  overflow: hidden;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.hTitle {
  font-weight: 900;
  letter-spacing: 0.02em;
  color: var(--text);
}
.x {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
}
.tabs {
  display: flex;
  gap: 8px;
  padding: 10px 14px 0;
}
.tab {
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.06);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
}
.tab[data-on="true"] {
  border-color: var(--accent);
  background: rgba(201, 125, 74, 0.12);
  box-shadow: 0 0 0 2px rgba(201, 125, 74, 0.2);
}
.body {
  padding: 14px;
}
.big {
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 0.02em;
  color: var(--text);
}
.p {
  margin-top: 8px;
  color: var(--muted);
  line-height: 1.5;
}
.row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.btn {
  border: 0;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-weight: 900;
}
.btn.ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--text);
}
.quote {
  border-left: 3px solid var(--accent);
  padding: 10px 12px;
  background: rgba(201, 125, 74, 0.08);
  border-radius: 12px;
  font-weight: 700;
  line-height: 1.55;
  color: var(--text);
}
</style>

