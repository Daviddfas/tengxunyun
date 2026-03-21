<script setup>
import { computed, onMounted, ref } from "vue";

const loading = ref(false);
const errorText = ref("");
const overview = ref(null);
const users = ref([]);
const alerts = ref([]);
const trends = ref([]);
const selectedDay = ref("");
const days = ref(7);
const risk = ref("all");

const rangeLabel = computed(() => {
  if (!overview.value?.range) return "";
  const { from, to } = overview.value.range;
  return `${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()}`;
});

function queryString() {
  const p = new URLSearchParams();
  p.set("days", String(days.value));
  p.set("risk", risk.value);
  p.set("limit", "20");
  if (selectedDay.value) p.set("day", selectedDay.value);
  return p.toString();
}

async function loadData() {
  loading.value = true;
  errorText.value = "";
  try {
    const [overviewRes, usersRes, trendsRes] = await Promise.all([
      fetch(`/api/admin/overview?days=${encodeURIComponent(days.value)}`),
      fetch(`/api/admin/users?${queryString()}`),
      fetch(`/api/admin/trends?days=${encodeURIComponent(days.value)}`),
    ]);
    const alertsRes = await fetch(`/api/admin/alerts?days=${encodeURIComponent(days.value)}`);
    if (!overviewRes.ok) throw new Error(await overviewRes.text());
    if (!usersRes.ok) throw new Error(await usersRes.text());
    if (!trendsRes.ok) throw new Error(await trendsRes.text());
    if (!alertsRes.ok) throw new Error(await alertsRes.text());
    const overviewData = await overviewRes.json();
    const usersData = await usersRes.json();
    const trendsData = await trendsRes.json();
    const alertsData = await alertsRes.json();
    overview.value = overviewData?.data || null;
    users.value = Array.isArray(usersData?.users) ? usersData.users : [];
    trends.value = Array.isArray(trendsData?.trends) ? trendsData.trends : [];
    alerts.value = Array.isArray(alertsData?.alerts) ? alertsData.alerts : [];
  } catch (e) {
    errorText.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  window.open(`/api/admin/export.csv?days=${encodeURIComponent(days.value)}`, "_blank");
}

const totalTrendPoints = computed(() => {
  if (!trends.value.length) return "";
  const maxY = Math.max(1, ...trends.value.map((d) => d.messages + d.checkins));
  return trends.value
    .map((d, idx) => {
      const x = (idx / Math.max(1, trends.value.length - 1)) * 100;
      const y = 90 - ((d.messages + d.checkins) / maxY) * 80;
      return `${x},${y}`;
    })
    .join(" ");
});

const messageTrendPoints = computed(() => {
  if (!trends.value.length) return "";
  const maxY = Math.max(1, ...trends.value.map((d) => Math.max(d.messages, d.checkins)));
  return trends.value
    .map((d, idx) => {
      const x = (idx / Math.max(1, trends.value.length - 1)) * 100;
      const y = 90 - (d.messages / maxY) * 80;
      return `${x},${y}`;
    })
    .join(" ");
});

const checkinTrendPoints = computed(() => {
  if (!trends.value.length) return "";
  const maxY = Math.max(1, ...trends.value.map((d) => Math.max(d.messages, d.checkins)));
  return trends.value
    .map((d, idx) => {
      const x = (idx / Math.max(1, trends.value.length - 1)) * 100;
      const y = 90 - (d.checkins / maxY) * 80;
      return `${x},${y}`;
    })
    .join(" ");
});

const highRiskTrendPoints = computed(() => {
  if (!trends.value.length) return "";
  const maxY = Math.max(1, ...trends.value.map((d) => d.highRiskUsers || 0));
  return trends.value
    .map((d, idx) => {
      const x = (idx / Math.max(1, trends.value.length - 1)) * 100;
      const y = 90 - ((d.highRiskUsers || 0) / maxY) * 80;
      return `${x},${y}`;
    })
    .join(" ");
});

function pickDay(day) {
  selectedDay.value = selectedDay.value === day ? "" : day;
  loadData();
}

const riskBars = computed(() => {
  const total = Math.max(1, users.value.length);
  const cnt = { high: 0, medium: 0, low: 0 };
  for (const u of users.value) cnt[u.riskLevel] = (cnt[u.riskLevel] || 0) + 1;
  return [
    { key: "high", label: "高风险", value: cnt.high, pct: Math.round((cnt.high / total) * 100) },
    { key: "medium", label: "中风险", value: cnt.medium, pct: Math.round((cnt.medium / total) * 100) },
    { key: "low", label: "低风险", value: cnt.low, pct: Math.round((cnt.low / total) * 100) },
  ];
});

onMounted(loadData);
</script>

<template>
  <div class="adminWrap">
    <div class="adminHead">
      <div>
        <div class="title">后台管理</div>
        <div class="sub">账号聊天、情绪数据和功能使用趋势分析</div>
      </div>
      <div class="actions">
        <select v-model="days" class="sel" @change="loadData">
          <option :value="7">近7天</option>
          <option :value="30">近30天</option>
          <option :value="90">近90天</option>
        </select>
        <select v-model="risk" class="sel" @change="loadData">
          <option value="all">全部风险</option>
          <option value="high">仅高风险</option>
          <option value="medium">仅中风险</option>
          <option value="low">仅低风险</option>
        </select>
        <button class="refresh" :disabled="loading" @click="loadData">{{ loading ? "更新中..." : "刷新数据" }}</button>
        <button class="refresh" @click="exportCsv">导出CSV</button>
        <button v-if="selectedDay" class="refresh" @click="pickDay(selectedDay)">清除日期筛选</button>
      </div>
    </div>
    <div v-if="rangeLabel" class="range">统计区间：{{ rangeLabel }}</div>

    <div v-if="errorText" class="error">{{ errorText }}</div>

    <div v-if="overview" class="stats">
      <div class="card">
        <div class="k">账号总数</div>
        <div class="v">{{ overview.totalUsers }}</div>
      </div>
      <div class="card">
        <div class="k">区间活跃账号</div>
        <div class="v">{{ overview.activeUsers }}</div>
      </div>
      <div class="card">
        <div class="k">消息总量</div>
        <div class="v">{{ overview.totalMessages }}</div>
      </div>
      <div class="card">
        <div class="k">自检记录</div>
        <div class="v">{{ overview.totalCheckins }}</div>
      </div>
      <div class="card">
        <div class="k">高风险命中</div>
        <div class="v danger">{{ overview.crisisHits }}</div>
      </div>
      <div class="card">
        <div class="k">敏感话题拦截</div>
        <div class="v">{{ overview.bannedTopicHits }}</div>
      </div>
      <div class="card">
        <div class="k">高风险账号</div>
        <div class="v danger">{{ overview.highRiskUsers }}</div>
      </div>
    </div>

    <div v-if="overview" class="featureBox">
      <div class="title">功能使用统计</div>
      <div class="featureGrid">
        <div class="featureItem">聊天请求：{{ overview.featureUsage.chatCalls }}</div>
        <div class="featureItem">自检问题生成：{{ overview.featureUsage.checkinQuestionCalls }}</div>
        <div class="featureItem">自检提交分析：{{ overview.featureUsage.checkinSubmitCalls }}</div>
        <div class="featureItem">回声卡生成：{{ overview.featureUsage.reflectCalls }}</div>
      </div>
    </div>

    <div class="chartGrid">
      <div class="tableBox">
        <div class="title">总交互趋势（消息+自检）</div>
        <div class="chart">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="svg">
            <polyline :points="totalTrendPoints" fill="none" stroke="#c97d4a" stroke-width="1.4" stroke-dasharray="3 2" />
            <polyline :points="messageTrendPoints" fill="none" stroke="#b86f3f" stroke-width="2.3" />
            <polyline :points="checkinTrendPoints" fill="none" stroke="#7c9f63" stroke-width="2.3" />
          </svg>
        </div>
        <div class="smallLine">双折线：消息(棕) / 自检(绿)，虚线为总交互。点击下方日期可联动筛选。</div>
        <div class="dayChips">
          <button
            v-for="d in trends"
            :key="d.day"
            class="chip"
            :data-on="selectedDay === d.day"
            @click="pickDay(d.day)"
          >
            {{ d.day.slice(5) }}
          </button>
        </div>
      </div>
      <div class="tableBox">
        <div class="title">高风险人数趋势 + 风险分布</div>
        <div class="miniChart">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="svg">
            <polyline :points="highRiskTrendPoints" fill="none" stroke="#c44d47" stroke-width="2.4" />
          </svg>
        </div>
        <div class="riskList">
          <div class="riskRow" v-for="b in riskBars" :key="b.key">
            <div class="riskMeta">{{ b.label }} {{ b.value }}人（{{ b.pct }}%）</div>
            <div class="barBg"><div class="barFill" :data-level="b.key" :style="{ width: `${b.pct}%` }" /></div>
          </div>
        </div>
      </div>
    </div>

    <div class="tableBox">
      <div class="title">风险告警</div>
      <div v-if="!alerts.length" class="empty">当前筛选区间内没有中高风险告警</div>
      <div v-else class="alertList">
        <div v-for="a in alerts" :key="`${a.uid}-${a.score}`" class="alertRow" :data-level="a.level">
          <div class="name">{{ a.username }}（{{ a.level === "high" ? "高风险" : "中风险" }}）</div>
          <div class="meta">评分 {{ a.score }} / 危机词 {{ a.crisisCount }} / 敏感词 {{ a.bannedCount }} / 紧绷均值 {{ a.avgArousal }}</div>
          <div class="preview">{{ a.suggestion }}</div>
        </div>
      </div>
    </div>

    <div class="tableBox">
      <div class="title">账号会话概览（最近）</div>
      <div v-if="!users.length" class="empty">暂无账号数据</div>
      <div v-else class="table">
        <div v-for="u in users" :key="u.uid" class="row">
          <div class="name">{{ u.username }}</div>
          <div class="meta">
            消息 {{ u.messageCount }} / 自检 {{ u.checkinCount }} / 风险 {{ u.riskLevel }}({{ u.riskScore }}) / 最近 {{ u.lastActiveText }}
          </div>
          <div class="preview">{{ u.latestPreview || "（暂无对话）" }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.adminWrap {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}
.adminHead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.sel {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fefcf8;
  color: var(--text);
  padding: 7px 8px;
}
.title {
  font-weight: 900;
  color: var(--text);
}
.range {
  font-size: 12.5px;
  color: var(--muted);
}
.sub {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12.5px;
}
.refresh {
  border: 1px solid var(--border);
  background: rgba(44, 36, 25, 0.05);
  color: var(--text);
  border-radius: 10px;
  padding: 8px 10px;
  font-weight: 800;
  cursor: pointer;
}
.refresh:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fefcf8;
}
.k {
  color: var(--muted);
  font-size: 12px;
}
.v {
  margin-top: 5px;
  color: var(--text);
  font-size: 21px;
  font-weight: 900;
}
.danger {
  color: var(--danger);
}
.featureBox,
.tableBox {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fefcf8;
  padding: 12px;
}
.chartGrid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 10px;
}
.chart {
  margin-top: 10px;
  height: 170px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(201, 125, 74, 0.08), rgba(201, 125, 74, 0.02));
  padding: 8px;
}
.svg {
  width: 100%;
  height: 100%;
}
.smallLine {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
.dayChips {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(44, 36, 25, 0.06);
  color: var(--text);
  font-size: 11.5px;
  padding: 4px 8px;
  cursor: pointer;
}
.chip[data-on="true"] {
  border-color: var(--accent);
  background: rgba(201, 125, 74, 0.16);
}
.miniChart {
  margin-top: 10px;
  height: 90px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(196, 77, 71, 0.06);
  padding: 8px;
}
.riskList {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}
.riskMeta {
  color: var(--text);
  font-size: 12.5px;
}
.barBg {
  margin-top: 4px;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(44, 36, 25, 0.08);
  overflow: hidden;
}
.barFill {
  height: 100%;
  border-radius: 999px;
  background: #9bb57f;
}
.barFill[data-level="high"] {
  background: #c44d47;
}
.barFill[data-level="medium"] {
  background: #c97d4a;
}
.featureGrid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.featureItem {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  font-size: 12.5px;
  color: var(--text);
  background: rgba(44, 36, 25, 0.04);
}
.table {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}
.alertList {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}
.alertRow {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: rgba(196, 77, 71, 0.07);
}
.alertRow[data-level="medium"] {
  background: rgba(201, 125, 74, 0.1);
}
.row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: rgba(44, 36, 25, 0.03);
}
.name {
  font-weight: 800;
  color: var(--text);
}
.meta {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}
.preview {
  margin-top: 5px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.45;
}
.empty {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12.5px;
}
@media (max-width: 980px) {
  .stats,
  .featureGrid,
  .chartGrid {
    grid-template-columns: 1fr;
  }
}
</style>
