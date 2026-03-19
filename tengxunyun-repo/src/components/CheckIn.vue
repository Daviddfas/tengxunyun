<script setup>
import { computed, ref } from "vue";

const emit = defineEmits(["checkin"]);

const valence = ref(3); // 1..5
const arousal = ref(3); // 1..5
const label = ref("");

const moodName = computed(() => {
  const v = Number(valence.value);
  if (v <= 2) return "有点低落";
  if (v === 3) return "还可以";
  return "相对平静";
});

function submit() {
  emit("checkin", {
    ts: Date.now(),
    valence: Number(valence.value),
    arousal: Number(arousal.value),
    label: label.value.trim(),
  });
  label.value = "";
}
</script>

<template>
  <div class="box">
    <div class="title">一分钟情绪自检</div>
    <div class="sub">不需要解释原因，只做一个当下的刻度。它会变成“情绪树”的叶片。</div>

    <div class="grid">
      <div class="field">
        <div class="k">心情（低落 ↔ 平静）</div>
        <input v-model="valence" class="range" type="range" min="1" max="5" step="1" />
        <div class="v">{{ valence }} / 5 · {{ moodName }}</div>
      </div>

      <div class="field">
        <div class="k">紧绷程度（放松 ↔ 紧绷）</div>
        <input v-model="arousal" class="range" type="range" min="1" max="5" step="1" />
        <div class="v">{{ arousal }} / 5</div>
      </div>

      <div class="field">
        <div class="k">给今天一个暗号（可选）</div>
        <input v-model="label" class="text" placeholder="例如：‘周四夜风’ / ‘考试前’ / ‘想家’" />
      </div>
    </div>

    <div class="actions">
      <button class="primary" @click="submit">记录这一刻</button>
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
.grid {
  margin-top: 10px;
  display: grid;
  gap: 12px;
}
.field .k {
  font-size: 12px;
  color: var(--muted);
}
.range {
  width: 100%;
  margin-top: 6px;
}
.v {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text);
}
.text {
  width: 100%;
  margin-top: 6px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fefcf8;
  color: var(--text);
  padding: 10px 10px;
  outline: none;
  font-family: "Noto Serif SC", "Source Han Serif SC", "STSong", serif;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
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
</style>

