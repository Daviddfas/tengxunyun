<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import EmotionCheckIn from "./components/EmotionCheckIn.vue";
import MoodTree from "./components/MoodTree.vue";
import EmotionLineChart from "./components/EmotionLineChart.vue";
import GroundingDrawer from "./components/GroundingDrawer.vue";
import CompanionRitual from "./components/CompanionRitual.vue";
import AdminDashboard from "./components/AdminDashboard.vue";
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
const isAdminPortal = ref(false);
const adminOtp = ref("");
const loginLoading = ref(false);
const loginError = ref("");
const loginCardFade = ref(false);
const welcomeOn = ref(false);
const canvasEl = ref(null);
let stopLoginAnim = null;

async function startLoginAnim() {
  // 可重复启动：先停止旧动效，再重建
  stopLoginAnim?.();
  stopLoginAnim = null;

  if (!canvasEl.value || user.value) return;

  // 登录页：Three.js 蒲公英动效（仅未登录时加载）
  const THREE = await import("three");
  const container = canvasEl.value;
  container.innerHTML = "";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#F4F1EB", 0.012);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 85);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const createFluffTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const cx = 64,
      cy = 64;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 64);
    grad.addColorStop(0, "rgba(255, 255, 255, 1)");
    grad.addColorStop(0.3, "rgba(255, 255, 255, 0.6)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#8C7D6E";
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const angle = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 35;
      ctx.quadraticCurveTo(
        cx + Math.cos(angle + 0.3) * r * 0.5,
        cy + Math.sin(angle + 0.3) * r * 0.5,
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
      );
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  };

  const seedsCount = window.innerWidth < 480 ? 650 : 1000;
  const dandelionGroup = new THREE.Group();
  const velocities = [];

  const fluffGeo = new THREE.BufferGeometry();
  const fluffPos = new Float32Array(seedsCount * 3);

  const stemGeo = new THREE.BufferGeometry();
  const stemPos = new Float32Array(seedsCount * 6);

  const radius = 20;
  for (let i = 0; i < seedsCount; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / seedsCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = radius + (Math.random() * 3 - 1.5);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    fluffPos[i * 3] = x;
    fluffPos[i * 3 + 1] = y;
    fluffPos[i * 3 + 2] = z;

    const dir = new THREE.Vector3(x, y, z).normalize();
    const stemLength = r * 0.9;
    const startX = x - dir.x * stemLength;
    const startY = y - dir.y * stemLength;
    const startZ = z - dir.z * stemLength;

    stemPos[i * 6] = startX;
    stemPos[i * 6 + 1] = startY;
    stemPos[i * 6 + 2] = startZ;
    stemPos[i * 6 + 3] = x;
    stemPos[i * 6 + 4] = y;
    stemPos[i * 6 + 5] = z;

    velocities.push({
      x: dir.x * 0.2 + 0.2 + Math.random() * 0.3,
      y: dir.y * 0.2 + 0.2 + Math.random() * 0.3,
      z: dir.z * 0.2 + (Math.random() - 0.5) * 0.3,
    });
  }

  fluffGeo.setAttribute("position", new THREE.BufferAttribute(fluffPos, 3));
  stemGeo.setAttribute("position", new THREE.BufferAttribute(stemPos, 3));

  const fluffMaterial = new THREE.PointsMaterial({
    size: 9,
    map: createFluffTexture(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const stemMaterial = new THREE.LineBasicMaterial({
    color: 0x968a7d,
    transparent: true,
    opacity: 0.45,
  });

  const fluffs = new THREE.Points(fluffGeo, fluffMaterial);
  const stems = new THREE.LineSegments(stemGeo, stemMaterial);
  const coreGeo = new THREE.SphereGeometry(2, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x7a7065 });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);

  dandelionGroup.add(fluffs);
  dandelionGroup.add(stems);
  dandelionGroup.add(coreMesh);
  dandelionGroup.position.x = window.innerWidth > 900 ? -22 : 0;
  scene.add(dandelionGroup);

  let targetRotX = 0;
  let targetRotY = 0;
  let isBlowing = false;

  const onMouseMove = (event) => {
    if (isBlowing) return;
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    targetRotY = mouseX * 0.25;
    targetRotX = mouseY * 0.25;
  };

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (!isBlowing) dandelionGroup.position.x = window.innerWidth > 900 ? -22 : 0;
  };

  document.addEventListener("mousemove", onMouseMove);
  window.addEventListener("resize", onResize);

  let animationFrameId = 0;
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    const time = Date.now() * 0.001;

    if (!isBlowing) {
      dandelionGroup.rotation.y += (targetRotY + time * 0.08 - dandelionGroup.rotation.y) * 0.05;
      dandelionGroup.rotation.x += (targetRotX - dandelionGroup.rotation.x) * 0.05;
      coreMesh.scale.setScalar(1 + Math.sin(time * 2) * 0.03);
    } else {
      const fPos = fluffGeo.attributes.position.array;
      const sPos = stemGeo.attributes.position.array;
      for (let i = 0; i < seedsCount; i++) {
        const v = velocities[i];
        v.x += Math.sin(time * 4 + fPos[i * 3 + 1] * 0.05) * 0.012;
        v.y += Math.cos(time * 4 + fPos[i * 3] * 0.05) * 0.012;

        fPos[i * 3] += v.x;
        fPos[i * 3 + 1] += v.y;
        fPos[i * 3 + 2] += v.z;

        sPos[i * 6] += v.x;
        sPos[i * 6 + 1] += v.y;
        sPos[i * 6 + 2] += v.z;
        sPos[i * 6 + 3] += v.x;
        sPos[i * 6 + 4] += v.y;
        sPos[i * 6 + 5] += v.z;
      }
      fluffGeo.attributes.position.needsUpdate = true;
      stemGeo.attributes.position.needsUpdate = true;
      coreMesh.scale.multiplyScalar(0.995);
      if (fluffMaterial.opacity > 0) {
        fluffMaterial.opacity = Math.max(0, fluffMaterial.opacity - 0.005);
        stemMaterial.opacity = Math.max(0, stemMaterial.opacity - 0.003);
      }
    }

    renderer.render(scene, camera);
  };
  animate();

  const blow = () => {
    if (isBlowing) return;
    dandelionGroup.updateMatrixWorld();
    fluffGeo.applyMatrix4(dandelionGroup.matrixWorld);
    stemGeo.applyMatrix4(dandelionGroup.matrixWorld);
    dandelionGroup.position.set(0, 0, 0);
    dandelionGroup.rotation.set(0, 0, 0);
    isBlowing = true;
  };

  const unwatch = watch(
    () => loginLoading.value,
    (v) => {
      if (v) blow();
    },
    { immediate: true },
  );

  stopLoginAnim = () => {
    unwatch();
    cancelAnimationFrame(animationFrameId);
    document.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", onResize);
    try {
      renderer.dispose();
    } catch {}
    try {
      fluffMaterial?.map?.dispose?.();
    } catch {}
    try {
      fluffMaterial?.dispose?.();
    } catch {}
    try {
      stemMaterial?.dispose?.();
    } catch {}
    container.innerHTML = "";
  };
}

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
      fetchCheckins();
    }
  } catch {
    // ignore
  }
}

async function fetchAdminMe() {
  try {
    const res = await fetch("/api/admin/me");
    if (!res.ok) return;
    const data = await res.json();
    if (data?.ok) {
      user.value = { username: data.username || "admin", isAdmin: true };
      activeSide.value = "admin";
    }
  } catch {
    // ignore
  }
}

async function fetchCheckins() {
  try {
    const res = await fetch("/api/checkins");
    if (!res.ok) return;
    const data = await res.json();
    if (data?.ok && Array.isArray(data.checkins) && data.checkins.length > 0) {
      checkins.value = data.checkins;
    }
  } catch {
    // ignore
  }
}

async function login() {
  const name = loginName.value.trim();
  const pw = loginPassword.value;
  if (!name || !pw || loginLoading.value) return;
  if (isAdminPortal.value && !adminOtp.value.trim()) {
    loginError.value = "请输入管理员动态口令";
    return;
  }
  loginError.value = "";
  loginLoading.value = true;
  try {
    const endpoint = isAdminPortal.value
      ? "/api/admin/login"
      : loginMode.value === "register"
        ? "/api/register"
        : "/api/login";
    const payload = isAdminPortal.value
      ? { username: name, password: pw, otp: adminOtp.value.trim() }
      : { username: name, password: pw };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = await res.json();
    // 留出时间给“吹散 + 文案”转场，避免瞬间跳到聊天页
    welcomeOn.value = true;
    await new Promise((r) => setTimeout(r, 3600));
    if (isAdminPortal.value) {
      user.value = { username: data.username || name, isAdmin: true };
      activeSide.value = "admin";
    } else {
      user.value = { username: data.username || name };
      fetchCheckins();
    }
  } catch (e) {
    loginError.value = e?.message ?? String(e);
    loginCardFade.value = false;
    welcomeOn.value = false;
    // 登录失败：重置蒲公英场景，允许再次触发动画/字幕
    startLoginAnim().catch(() => {});
  } finally {
    loginLoading.value = false;
  }
}

async function logout() {
  try {
    const endpoint = user.value?.isAdmin ? "/api/admin/logout" : "/api/logout";
    await fetch(endpoint, { method: "POST" });
  } catch {
    // ignore
  }
  user.value = null;
  loginPassword.value = "";
  adminOtp.value = "";
  input.value = "";
  crisisMode.value = false;
  isAdminPortal.value = false;
  loginCardFade.value = false;
  welcomeOn.value = false;
  await nextTick();
  startLoginAnim().catch(() => {});
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
  const hint = c.summary
    ? c.summary + "\n\n如果你愿意，可以说说这背后最让你难受/最想被理解的是什么。"
    : `我记录下了这一刻：心情 ${c.valence}/5，紧绷 ${c.arousal}/5` + (c.label ? `（${c.label}）` : "") + "。\n\n如果你愿意，说说这背后最让你难受/最想被理解的是什么？";
  messages.value.push({ role: "assistant", content: hint });
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
  fetchAdminMe();
  fetchMe();
  startLoginAnim().catch(() => {});
});

onBeforeUnmount(() => {
  stopLoginAnim?.();
});
</script>

<template>
  <div v-if="!user" class="loginPage">
    <div ref="canvasEl" class="canvasContainer" />

    <div class="uiContainer">
      <div class="welcomeMsg" :data-on="welcomeOn">深呼吸...<br />烦恼正随风消散</div>

      <div class="loginCardNew" :class="{ fadeOut: loginCardFade || loginLoading }">
        <div class="headerNew">
          <h1 class="titleNew">聆心小开</h1>
          <p class="subtitleNew">像吹散蒲公英一样，<br />把沉重的思绪交给风，只留下一片轻盈。</p>
        </div>

        <div class="authToggle" :class="{ registerMode: loginMode === 'register' }">
          <div class="toggleSlider"></div>
          <button
            class="toggleBtn"
            :class="{ active: loginMode === 'login' }"
            type="button"
            @click="
              () => {
                isAdminPortal = false;
                loginMode = 'login';
              }
            "
          >
            登录
          </button>
          <button
            class="toggleBtn"
            :class="{ active: loginMode === 'register' }"
            type="button"
            @click="
              () => {
                isAdminPortal = false;
                loginMode = 'register';
              }
            "
          >
            注册
          </button>
        </div>
        <button class="adminSwitch" type="button" @click="isAdminPortal = !isAdminPortal">
          {{ isAdminPortal ? "返回普通登录" : "管理员入口" }}
        </button>

        <form
          class="loginFormNew"
          @submit.prevent="
            () => {
              loginCardFade = true;
              welcomeOn = true;
              login();
            }
          "
        >
          <div class="inputGroup">
            <label>{{ isAdminPortal ? "管理员账号" : "你的称呼" }}</label>
            <input
              v-model="loginName"
              type="text"
              :placeholder="isAdminPortal ? 'rosent' : '例如：旅人 / 星期八'"
              required
              autocomplete="off"
            />
          </div>
          <div class="inputGroup">
            <label>{{ isAdminPortal ? "管理员密码" : "你的密码" }}</label>
            <input v-model="loginPassword" type="password" :placeholder="isAdminPortal ? '输入管理员密码' : '心底的密码'" required />
          </div>
          <div v-if="isAdminPortal" class="inputGroup">
            <label>动态口令</label>
            <input v-model="adminOtp" type="text" placeholder="6位动态口令" required />
          </div>

          <button class="submitBtn" type="submit" :disabled="loginLoading">
            {{
              loginLoading
                ? "正在吹散…"
                : isAdminPortal
                  ? "管理员登录"
                  : loginMode === "login"
                    ? "登录并吹散"
                    : "注册并吹散"
            }}
          </button>

          <div v-if="loginError" class="loginErrorNew">{{ loginError }}</div>
          <div class="loginHintNew">仅演示用，账号数据只存在服务器内存中。</div>
        </form>
      </div>
    </div>
  </div>

  <div v-else-if="user?.isAdmin" class="adminPage">
    <div class="adminTop">
      <div class="brand">
        <div class="badge">管</div>
        <div class="t">
          <div class="name">后台管理系统</div>
          <div class="sub">账号聊天数据与风险分析看板</div>
        </div>
      </div>
      <div class="me">
        <span class="meName">{{ user.username }}</span>
        <button class="ghost smallBtn" @click="logout">退出</button>
      </div>
    </div>
    <AdminDashboard />
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
        <button v-if="user?.isAdmin" class="navBtn" :data-on="activeSide === 'admin'" @click="activeSide = 'admin'">后台管理</button>
      </nav>

      <div class="sideBody">
        <EmotionCheckIn @checkin="addCheckIn" />
        <div v-if="activeSide === 'tree'" class="stack">
          <MoodTree :checkins="checkins" />
          <EmotionLineChart />
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
          <AdminDashboard v-if="activeSide === 'admin' && user?.isAdmin" />
          <CompanionRitual v-else :prefs="prefs" :messages="messages" />
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

.adminPage {
  max-width: 1280px;
  margin: 0 auto;
  padding: 22px 18px 30px;
}

.adminTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: #fefcf8;
  box-shadow: 0 8px 32px var(--shadow);
  padding: 14px;
  margin-bottom: 12px;
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
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, #ebe6df 0%, #f4f1eb 100%);
}

.canvasContainer {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.canvasContainer :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.uiContainer {
  position: relative;
  z-index: 10;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  align-items: center;
  justify-content: flex-end;
  padding-right: 12vw;
  box-sizing: border-box;
  animation: fadeInUI 1.2s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

@keyframes fadeInUI {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.welcomeMsg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  font-weight: 300;
  color: #5c544b;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.8s cubic-bezier(0.25, 1, 0.3, 1);
  z-index: 5;
  letter-spacing: 4px;
  text-align: center;
  line-height: 1.6;
}
.welcomeMsg[data-on="true"] {
  opacity: 1;
}

.loginCardNew {
  background-color: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  width: 380px;
  padding: 45px 45px;
  box-shadow: 0 30px 60px rgba(92, 84, 75, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  transition: all 0.6s cubic-bezier(0.25, 1, 0.3, 1);
  pointer-events: auto;
}
.loginCardNew.fadeOut {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
  pointer-events: none;
  filter: blur(10px);
}

.headerNew {
  margin-bottom: 30px;
}
.titleNew {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 10px 0;
  letter-spacing: 2px;
  color: #4a423c;
}
.subtitleNew {
  font-size: 14px;
  color: #9e968d;
  margin: 0;
  line-height: 1.8;
  letter-spacing: 0.5px;
}

.authToggle {
  display: flex;
  position: relative;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  margin-bottom: 25px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.8);
}
.toggleBtn {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  z-index: 2;
  transition: color 0.3s;
  color: #9e968d;
  background: transparent;
  border: 0;
  font-family: inherit;
}
.toggleBtn.active {
  color: #5c544b;
}
.toggleSlider {
  position: absolute;
  top: 5px;
  left: 5px;
  width: calc(50% - 5px);
  height: calc(100% - 10px);
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(92, 84, 75, 0.1);
  transition: 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  z-index: 1;
}
.authToggle.registerMode .toggleSlider {
  transform: translateX(100%);
}

.loginFormNew {
  display: block;
}
.inputGroup {
  margin-bottom: 22px;
}
.inputGroup label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #5c544b;
  margin-bottom: 10px;
  letter-spacing: 1px;
}
.inputGroup input {
  width: 100%;
  padding: 16px 20px;
  background-color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(220, 215, 208, 0.8);
  border-radius: 14px;
  box-sizing: border-box;
  font-size: 14px;
  color: #5c544b;
  outline: none;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  font-family: inherit;
}
.inputGroup input:focus {
  background-color: rgba(255, 255, 255, 1);
  border-color: #b59c82;
  box-shadow: 0 0 0 4px rgba(181, 156, 130, 0.15);
  transform: translateY(-2px);
}
.submitBtn {
  width: 100%;
  padding: 18px;
  margin-top: 10px;
  background-color: #b59c82;
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 10px 25px rgba(181, 156, 130, 0.25);
}
.submitBtn:hover {
  background-color: #9e856c;
  transform: translateY(-3px);
  box-shadow: 0 15px 35px rgba(181, 156, 130, 0.4);
}
.submitBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
.loginErrorNew {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--danger);
}
.loginHintNew {
  margin-top: 8px;
  font-size: 11.5px;
  color: #9e968d;
}
.adminSwitch {
  width: 100%;
  margin-bottom: 16px;
  border: 1px solid rgba(220, 215, 208, 0.8);
  background: rgba(255, 255, 255, 0.55);
  color: #5c544b;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 700;
}

@media (max-width: 980px) {
  .uiContainer {
    justify-content: center;
    padding-right: 0;
    padding-left: 0;
  }
  .loginCardNew {
    width: min(92vw, 380px);
    padding: 36px 24px;
  }
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

