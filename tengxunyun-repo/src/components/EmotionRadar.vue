<script setup>
import { computed } from "vue";

const props = defineProps({
  checkins: { type: Array, required: true },
});

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const lastN = computed(() => {
  const arr = Array.isArray(props.checkins) ? props.checkins : [];
  return arr.filter((c) => typeof c?.ts === "number").slice(-20);
});

const score = computed(() => {
  const items = lastN.value;
  if (!items.length) return null;

  const avg = items.reduce(
    (acc, c) => {
      acc.v += clamp(Number(c.valence ?? 3), 1, 5);
      acc.a += clamp(Number(c.arousal ?? 3), 1, 5);
      return acc;
    },
    { v: 0, a: 0 }
  );
  const v = avg.v / items.length; // 1..5
  const a = avg.a / items.length; // 1..5

  // 用 valence/arousal 推出 5 个“维度”，只做可视化，不做诊断
  const calm = clamp((v + (6 - a)) / 2, 1, 5); // 平静：高心情 + 低紧绷
  const tense = clamp(a, 1, 5); // 紧绷
  const down = clamp(6 - v, 1, 5); // 低落（反向心情）
  const energy = clamp((v + a) / 2, 1, 5); // 精力：心情+紧绷的平均
  const chaos = clamp(((6 - v) + a) / 2, 1, 5); // 混乱：低心情 + 高紧绷

  return [
    { key: "calm", label: "平静", value: calm },
    { key: "tense", label: "紧绷", value: tense },
    { key: "down", label: "低落", value: down },
    { key: "energy", label: "精力", value: energy },
    { key: "chaos", label: "混乱", value: chaos },
  ];
});

const points = computed(() => {
  if (!score.value) return "";
  const cx = 150;
  const cy = 112;
  const rMax = 78;
  const n = score.value.length;
  return score.value
    .map((s, i) => {
      const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      const t = (clamp(Number(s.value), 1, 5) - 1) / 4;
      const r = 16 + t * rMax;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});

const axes = computed(() => {
  const cx = 150;
  const cy = 112;
  const r = 96;
  const list = score.value || [
    { label: "平静" },
    { label: "紧绷" },
    { label: "低落" },
    { label: "精力" },
    { label: "混乱" },
  ];
  const n = list.length;
  return list.map((s, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    const lx = cx + Math.cos(ang) * (r + 18);
    const ly = cy + Math.sin(ang) * (r + 18);
    return { x, y, lx, ly, label: s.label };
  });
});
</script>

<template>
  <div class="box">
    <div class="title">情绪雷达</div>
    <div class="sub">基于最近几次自检的一个小轮廓（仅可视化）。</div>

    <div v-if="!score" class="empty">还没有足够的数据。先记录几次“情绪自检”吧。</div>

    <svg v-else class="svg" viewBox="0 0 300 230" role="img" aria-label="情绪雷达图">
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="46%" r="60%">
          <stop offset="0" stop-color="rgba(43,212,167,0.22)" />
          <stop offset="1" stop-color="rgba(201,125,74,0.08)" />
        </radialGradient>
      </defs>

      <!-- rings -->
      <g>
        <circle class="ring" cx="150" cy="112" r="32" />
        <circle class="ring" cx="150" cy="112" r="56" />
        <circle class="ring" cx="150" cy="112" r="80" />
        <circle class="ring" cx="150" cy="112" r="104" />
      </g>

      <!-- axes -->
      <g>
        <line
          v-for="(a, idx) in axes"
          :key="idx"
          class="axis"
          x1="150"
          y1="112"
          :x2="a.x"
          :y2="a.y"
        />
        <text
          v-for="(a, idx) in axes"
          :key="'t' + idx"
          class="lbl"
          :x="a.lx"
          :y="a.ly"
          text-anchor="middle"
        >
          {{ a.label }}
        </text>
      </g>

      <!-- shape -->
      <polygon :points="points" class="shape" fill="url(#radarFill)" />
      <polygon :points="points" class="shapeStroke" fill="transparent" />
    </svg>
  </div>
</template>

<style scoped>
.box {
  padding: 14px 14px 12px;
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
.empty {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12.5px;
}
.svg {
  width: 100%;
  height: auto;
  margin-top: 10px;
}
.ring {
  fill: transparent;
  stroke: rgba(44, 36, 25, 0.12);
  stroke-width: 1;
}
.axis {
  stroke: rgba(44, 36, 25, 0.14);
  stroke-width: 1;
}
.lbl {
  fill: rgba(44, 36, 25, 0.75);
  font-size: 11.5px;
}
.shape {
  filter: drop-shadow(0 6px 14px rgba(44, 36, 25, 0.12));
}
.shapeStroke {
  stroke: rgba(43, 212, 167, 0.8);
  stroke-width: 2;
}
</style>

