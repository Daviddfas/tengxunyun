<script setup>
import { computed } from "vue";

const props = defineProps({
  checkins: { type: Array, required: true },
});

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const last7 = computed(() => {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return props.checkins
    .filter((c) => typeof c?.ts === "number" && now - c.ts <= sevenDays)
    .slice(-28);
});

const leaves = computed(() => {
  const items = last7.value;
  return items.map((c, i) => {
    const v = clamp(Number(c.valence ?? 3), 1, 5);
    const a = clamp(Number(c.arousal ?? 3), 1, 5);
    const hue = v <= 2 ? 18 : v === 3 ? 45 : 150;
    const sat = 55 + a * 6;
    const light = 38 + (v - 3) * 6;

    // deterministic scatter
    const seed = (c.ts + i * 9973) % 100000;
    const rx = (seed % 1000) / 1000;
    const ry = ((seed / 1000) % 1000) / 1000;
    const x = 70 + rx * 220;
    const y = 30 + ry * 140;
    const r = 5 + (a - 1) * 1.6;
    return { x, y, r, color: `hsl(${hue} ${sat}% ${light}%)`, label: c.label || "" };
  });
});
</script>

<template>
  <div class="box">
    <div class="title">情绪树</div>
    <div class="sub">过去 7 天的“叶片”会长在这里（含对话与自检记录）。</div>

    <svg class="svg" viewBox="0 0 360 220" role="img" aria-label="情绪树可视化">
      <defs>
        <linearGradient id="trunk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="rgba(44,36,25,0.18)" />
          <stop offset="1" stop-color="rgba(44,36,25,0.08)" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feColorMatrix
            in="b"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.35 0"
          />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- canopy haze -->
      <path
        d="M40,110 C70,30 150,10 190,30 C240,0 320,40 320,110 C320,180 260,205 200,195 C150,212 60,192 40,110 Z"
        fill="rgba(201,125,74,0.12)"
        stroke="rgba(44,36,25,0.12)"
      />

      <!-- trunk -->
      <path
        d="M170 210 C175 175 165 165 160 140 C154 110 166 86 182 70 C202 90 206 116 198 142 C192 164 186 174 190 210 Z"
        fill="url(#trunk)"
        stroke="rgba(44,36,25,0.15)"
      />

      <!-- leaves -->
      <g filter="url(#glow)">
        <circle
          v-for="(l, idx) in leaves"
          :key="idx"
          :cx="l.x"
          :cy="l.y"
          :r="l.r"
          :fill="l.color"
          fill-opacity="0.92"
          stroke="rgba(44,36,25,0.18)"
          stroke-opacity="0.9"
        >
          <title>{{ l.label || "一次自检" }}</title>
        </circle>
      </g>

      <text x="18" y="212" fill="#6b5d52" font-size="11">
        叶片颜色≈心情（暖色更低落，绿意更平静）
      </text>
    </svg>
  </div>
</template>

<style scoped>
.box {
  padding: 14px 14px 10px;
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
.svg {
  width: 100%;
  height: auto;
  margin-top: 10px;
}
</style>

