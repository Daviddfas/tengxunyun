<script setup>
/**
 * 七天情绪波动折线图
 * 从服务端获取近7天 checkins，展示心情/紧绷随时间变化
 */
import { computed, onMounted, ref } from "vue";

const checkins = ref([]);
const loading = ref(true);

async function fetchCheckins() {
  loading.value = true;
  try {
    const res = await fetch("/api/checkins");
    if (res.ok) {
      const data = await res.json();
      checkins.value = Array.isArray(data.checkins) ? data.checkins : [];
    }
  } catch {
    checkins.value = [];
  } finally {
    loading.value = false;
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const chartData = computed(() => {
  const list = checkins.value.filter((c) => typeof c?.ts === "number").sort((a, b) => a.ts - b.ts);
  if (list.length < 2) return null;
  const pad = 20;
  const w = 320 - pad * 2;
  const h = 120 - pad * 2;
  const minTs = list[0].ts;
  const maxTs = list[list.length - 1].ts;
  const span = Math.max(maxTs - minTs, 1);

  const toX = (ts) => pad + ((ts - minTs) / span) * w;
  const toY = (v) => pad + h - ((clamp(Number(v), 1, 5) - 1) / 4) * h; // 5->top, 1->bottom

  const valencePts = list.map((c) => `${toX(c.ts)},${toY(c.valence ?? 3)}`).join(" ");
  const arousalPts = list.map((c) => `${toX(c.ts)},${toY(c.arousal ?? 3)}`).join(" ");

  return {
    valencePts,
    arousalPts,
    minTs,
    maxTs,
  };
});

onMounted(fetchCheckins);

defineExpose({ refresh: fetchCheckins });
</script>

<template>
  <div class="box">
    <div class="title">七天情绪波动</div>
    <div class="sub">心情与紧绷程度随时间的变化（基于服务器记录）。</div>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="!chartData || checkins.length < 2" class="empty">还需要更多自检记录才能看到波动。</div>

    <svg v-else class="svg" viewBox="0 0 320 140" role="img" aria-label="七天情绪折线图">
      <!-- 网格线 -->
      <line x1="20" y1="70" x2="300" y2="70" class="grid" />
      <line x1="20" y1="20" x2="20" y2="120" class="grid" />
      <line x1="20" y1="120" x2="300" y2="120" class="grid" />
      <line x1="300" y1="20" x2="300" y2="120" class="grid" />

      <!-- 心情线 (valence) - 绿色 -->
      <polyline
        :points="chartData.valencePts"
        class="line"
        fill="none"
        stroke="rgba(43,212,167,0.9)"
        stroke-width="2"
      />

      <!-- 紧绷线 (arousal) - 暖色 -->
      <polyline
        :points="chartData.arousalPts"
        class="line"
        fill="none"
        stroke="rgba(201,125,74,0.9)"
        stroke-width="2"
      />

      <text x="10" y="75" class="lbl">心情</text>
      <text x="10" y="95" class="lbl">紧绷</text>
      <text x="160" y="135" class="axisLbl" text-anchor="middle">时间 →</text>
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
.grid {
  stroke: rgba(44, 36, 25, 0.08);
  stroke-width: 1;
}
.line {
  stroke-linecap: round;
  stroke-linejoin: round;
}
.lbl {
  fill: var(--muted);
  font-size: 10px;
}
.axisLbl {
  fill: var(--muted);
  font-size: 11px;
}
</style>
