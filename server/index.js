import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import OpenAI from "openai";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const PORT = Number.parseInt(process.env.PORT || "80", 10);

function getClient() {
  // 支持 OPENAI_API_KEY 或 DEEPSEEK_API_KEY（CloudRun 常用命名）
  const apiKey = (
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    ""
  ).trim();
  const baseURL = (process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1").trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

// 简单账号存储（内存版，按账号区分）
// real 环境建议换成数据库
const users = new Map(); // id -> { username, passHash, messages: [], checkins: [] }
const analytics = {
  chatCalls: 0,
  checkinQuestionCalls: 0,
  checkinSubmitCalls: 0,
  reflectCalls: 0,
};
const ADMIN_COOKIE = "admin_token";
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "rosent").trim();
const ADMIN_PASSWORD_HASH = hashPassword(process.env.ADMIN_PASSWORD || "2026321");
const ADMIN_OTP_SECRET = (process.env.ADMIN_OTP_SECRET || "local-admin-otp").trim();
const ADMIN_SIGN_SECRET = (process.env.ADMIN_SIGN_SECRET || "local-admin-sign").trim();
const ADMIN_STATIC_OTP = (process.env.ADMIN_STATIC_OTP || "246810").trim();

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) return;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

function getUid(req) {
  const cookies = parseCookies(req);
  return cookies.uid || "";
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

function generateOtp(secret, step) {
  const h = crypto.createHash("sha1").update(`${secret}:${step}`).digest("hex");
  const num = Number.parseInt(h.slice(-8), 16) % 1_000_000;
  return String(num).padStart(6, "0");
}

function isValidAdminOtp(inputOtp) {
  if (!inputOtp) return false;
  if (inputOtp === ADMIN_STATIC_OTP) return true;
  const step = Math.floor(Date.now() / 30_000);
  for (let drift = -1; drift <= 1; drift += 1) {
    if (generateOtp(ADMIN_OTP_SECRET, step + drift) === inputOtp) return true;
  }
  return false;
}

function signAdminToken(username) {
  const exp = Date.now() + 1000 * 60 * 60 * 8;
  const payload = `${username}.${exp}`;
  const sig = crypto.createHmac("sha256", ADMIN_SIGN_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!username || !Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${username}.${exp}`;
  const expected = crypto.createHmac("sha256", ADMIN_SIGN_SECRET).update(payload).digest("hex");
  if (expected !== sig) return null;
  return { username };
}

function getAdmin(req) {
  const cookies = parseCookies(req);
  return verifyAdminToken(cookies[ADMIN_COOKIE] || "");
}

function requireAdmin(req, res, next) {
  const admin = getAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: "admin login required" });
  req.admin = admin;
  next();
}

function parseTimeRange(req) {
  const daysRaw = Number(req.query?.days);
  const fromRaw = Number(req.query?.from);
  const toRaw = Number(req.query?.to);
  const now = Date.now();
  let from = Number.isFinite(fromRaw) ? fromRaw : null;
  let to = Number.isFinite(toRaw) ? toRaw : now;
  if (!from && Number.isFinite(daysRaw) && daysRaw > 0) from = now - daysRaw * 24 * 60 * 60 * 1000;
  if (!from) from = now - 7 * 24 * 60 * 60 * 1000;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function isInRange(ts, range) {
  return Number.isFinite(ts) && ts >= range.from && ts <= range.to;
}

function userRiskInfo(user, range) {
  const msgs = Array.isArray(user.messages) ? user.messages : [];
  const checks = Array.isArray(user.checkins) ? user.checkins : [];
  let crisisCount = 0;
  let bannedCount = 0;
  const arousalValues = [];
  for (const m of msgs) {
    if (m?.role !== "user" || !isInRange(m?.ts, range)) continue;
    const text = String(m.content || "");
    if (isCrisis(text)) crisisCount += 1;
    if (isBannedTopic(text)) bannedCount += 1;
  }
  for (const c of checks) {
    if (!isInRange(c?.ts, range)) continue;
    if (Number.isFinite(Number(c?.arousal))) arousalValues.push(Number(c.arousal));
  }
  const avgArousal = arousalValues.length
    ? Math.round((arousalValues.reduce((s, v) => s + v, 0) / arousalValues.length) * 100) / 100
    : 0;
  const riskScore = crisisCount * 50 + bannedCount * 20 + Math.max(0, avgArousal - 3.5) * 15;
  let riskLevel = "low";
  if (riskScore >= 60 || crisisCount > 0) riskLevel = "high";
  else if (riskScore >= 25 || bannedCount > 0 || avgArousal >= 4.2) riskLevel = "medium";
  return { crisisCount, bannedCount, avgArousal, riskScore: Math.round(riskScore), riskLevel };
}

function csvEscape(val) {
  const s = String(val ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}

function findUserByName(username) {
  const name = username.toLowerCase();
  for (const [id, u] of users.entries()) {
    if (u.username.toLowerCase() === name) return { id, user: u };
  }
  return null;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/register", (req, res) => {
  const rawName = (req.body?.username || "").trim();
  const rawPw = String(req.body?.password || "");
  if (!rawName || !rawPw) return res.status(400).send("username and password required");
  if (rawPw.length < 6) return res.status(400).send("password too short");
  const username = rawName.slice(0, 32);
  if (findUserByName(username)) return res.status(409).send("username taken");
  const id = makeId();
  users.set(id, {
    username,
    passHash: hashPassword(rawPw),
    messages: [],
    checkins: [],
    createdAt: Date.now(),
  });
  res.setHeader(
    "Set-Cookie",
    `uid=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  res.json({ ok: true, username, uid: id });
});

app.post("/api/login", (req, res) => {
  const rawName = (req.body?.username || "").trim();
  const rawPw = String(req.body?.password || "");
  if (!rawName || !rawPw) return res.status(400).send("username and password required");
  const username = rawName.slice(0, 32);
  const found = findUserByName(username);
  if (!found) return res.status(401).send("user not found");
  if (found.user.passHash !== hashPassword(rawPw)) return res.status(401).send("wrong password");
  res.setHeader(
    "Set-Cookie",
    `uid=${encodeURIComponent(found.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  res.json({ ok: true, username: found.user.username, uid: found.id });
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const otp = String(req.body?.otp || "").trim();
  if (!username || !password || !otp) return res.status(400).send("username, password, otp required");
  if (!ADMIN_PASSWORD_HASH) return res.status(500).send("admin password not configured");
  if (username !== ADMIN_USERNAME || hashPassword(password) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).send("invalid admin credentials");
  }
  if (!isValidAdminOtp(otp)) return res.status(401).send("invalid otp");
  const token = signAdminToken(username);
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 8}`
  );
  res.json({ ok: true, username });
});

app.get("/api/admin/me", (req, res) => {
  const admin = getAdmin(req);
  if (!admin) return res.json({ ok: false });
  res.json({ ok: true, username: admin.username });
});

app.post("/api/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const uid = getUid(req);
  if (!uid || !users.has(uid)) return res.json({ ok: false });
  const u = users.get(uid);
  res.json({ ok: true, uid, username: u.username, historyCount: u.messages.length });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", "uid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

function ensureCheckins(session) {
  if (!session.checkins) session.checkins = [];
  return session.checkins;
}

app.get("/api/checkins", (req, res) => {
  const uid = getUid(req);
  if (!uid || !users.has(uid)) return res.status(401).json({ ok: false });
  const session = users.get(uid);
  const list = ensureCheckins(session);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - sevenDays;
  const recent = list.filter((c) => c?.ts >= cutoff).sort((a, b) => a.ts - b.ts);
  res.json({ ok: true, checkins: recent });
});

app.post("/api/checkin", (req, res) => {
  const uid = getUid(req);
  if (!uid || !users.has(uid)) return res.status(401).json({ ok: false });
  const { ts, valence, arousal, label } = req.body || {};
  const v = Number.isFinite(Number(valence)) ? Math.max(1, Math.min(5, Number(valence))) : 3;
  const a = Number.isFinite(Number(arousal)) ? Math.max(1, Math.min(5, Number(arousal))) : 3;
  const session = users.get(uid);
  const checkins = ensureCheckins(session);
  const t = typeof ts === "number" ? ts : Date.now();
  checkins.push({ ts: t, valence: v, arousal: a, label: String(label || "").trim() || "情绪自检" });
  res.json({ ok: true, checkin: { ts: t, valence: v, arousal: a, label: String(label || "").trim() || "情绪自检" } });
});

app.post("/api/emotion-check/questions", async (req, res) => {
  analytics.checkinQuestionCalls += 1;
  const client = getClient();
  if (!client) return res.status(400).json({ error: "Missing API key" });
  const uid = getUid(req);
  if (!uid || !users.has(uid)) return res.status(401).json({ ok: false });
  const session = users.get(uid);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - sevenDays;
  const recentMessages = (session.messages || []).filter((m) => m?.ts >= cutoff);
  const chatSummary = recentMessages.length
    ? recentMessages.map((m) => `${m.role === "user" ? "用户" : "助手"}: ${(m.content || "").slice(0, 300)}`).join("\n")
    : "";

  const prompt = [
    "你是温和的心理陪伴助手。请先仔细阅读用户近7天的完整聊天记录，从中提炼出用户反复提及的人、事、情境和情绪主题（如工作压力、人际关系、自我否定、睡眠、身体感受等）。",
    "基于这些具体内容，生成 4-5 个情绪自检问题，要求：",
    "1. 每个问题必须紧扣聊天中的具体情境或主题，用温和的语气引用或概括用户曾提到的内容，例如：针对「总被催进度」可问「关于被催进度的焦虑，此刻若用 1-5 评估，大概在几？」",
    "2. 不要问空洞的通用问题，也不要原样重复用户的原话，而是转化为简洁的、能引发自我觉察的提问。",
    "3. 可 mix 量表题（1-5）和开放式短答；量表题要明确 1 和 5 分别代表什么。",
    "4. 问题要具体、有温度、易答，避免说教和诊断。",
    "若无聊天或内容很少，才使用通用问题（如身体紧绷程度、此刻心里更像什么感觉等）。",
    "只返回 JSON：{\"questions\":[{\"id\":\"q1\",\"text\":\"问题文字\",\"type\":\"scale\"或\"text\"}]}。",
  ].join("\n");

  const userContent = chatSummary
    ? `用户近7天聊天记录：\n${chatSummary.slice(0, 4000)}\n\n请基于以上内容，生成针对该用户当前情绪的 4-5 个自检问题。`
    : "用户暂无近期聊天记录，请生成 3-4 个通用情绪自检问题。";

  try {
    const completion = await client.chat.completions.create({
      model: (process.env.OPENAI_MODEL || "deepseek-chat").trim(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    });
    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
    let parsed = { questions: [] };
    try {
      parsed = raw ? JSON.parse(raw) : parsed;
    } catch {}
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 5) : [];
    if (!questions.length) {
      questions.push(
        { id: "q1", text: "此刻你的身体是放松还是紧绷？1=很放松，5=很紧绷", type: "scale" },
        { id: "q2", text: "此刻心情更像哪种颜色？", type: "text" },
        { id: "q3", text: "如果用一个词形容现在，会是什么？", type: "text" },
      );
    }
    res.json({ ok: true, questions });
  } catch (e) {
    const msg = e?.message || String(e);
    res.status(502).json({ error: `生成问题失败: ${msg}` });
  }
});

app.post("/api/emotion-check/submit", async (req, res) => {
  analytics.checkinSubmitCalls += 1;
  const client = getClient();
  if (!client) return res.status(400).json({ error: "Missing API key" });
  const uid = getUid(req);
  if (!uid || !users.has(uid)) return res.status(401).json({ ok: false });
  const { answers } = req.body || {};
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "answers 数组不能为空" });
  }

  const prompt = [
    "根据用户的情绪自检回答，推断其 valence（心情 1-5，1=很低落，5=较平和）和 arousal（紧绷程度 1-5，1=很放松，5=很紧绷）。",
    "同时计算 5 个情绪维度的 1-5 分数：calm平静、tense紧绷、down低落、energy精力、chaos混乱。",
    "只返回 JSON：{\"valence\":1-5,\"arousal\":1-5,\"dimensions\":{\"calm\":1-5,\"tense\":1-5,\"down\":1-5,\"energy\":1-5,\"chaos\":1-5},\"summary\":\"一句话温和总结\"}。",
  ].join("\n");

  const answersStr = answers.map((a) => `${a.questionId || a.id}: ${a.value}`).join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: (process.env.OPENAI_MODEL || "deepseek-chat").trim(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `用户回答：\n${answersStr}` },
      ],
      temperature: 0.5,
    });
    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
    let parsed = { valence: 3, arousal: 3, dimensions: {}, summary: "" };
    try {
      parsed = raw ? JSON.parse(raw) : parsed;
    } catch {}

    const valence = Math.max(1, Math.min(5, Number(parsed.valence) || 3));
    const arousal = Math.max(1, Math.min(5, Number(parsed.arousal) || 3));
    const dim = parsed.dimensions && typeof parsed.dimensions === "object" ? parsed.dimensions : {};
    const dimensions = ["calm", "tense", "down", "energy", "chaos"].map((k) => ({
      key: k,
      label: { calm: "平静", tense: "紧绷", down: "低落", energy: "精力", chaos: "混乱" }[k],
      value: Math.max(1, Math.min(5, Number(dim[k]) || 3)),
    }));

    const session = users.get(uid);
    const checkins = ensureCheckins(session);
    const ts = Date.now();
    checkins.push({
      ts,
      valence,
      arousal,
      label: "问卷自检",
      dimensions: Object.fromEntries(dimensions.map((d) => [d.key, d.value])),
      summary: String(parsed.summary || "").slice(0, 100),
    });

    res.json({
      ok: true,
      checkin: { ts, valence, arousal, label: "问卷自检", dimensions, summary: parsed.summary },
      dimensions,
      summary: parsed.summary,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    res.status(502).json({ error: `分析失败: ${msg}` });
  }
});

function isCrisis(text) {
  const t = (text || "").toLowerCase();
  const hits = [
    "自杀",
    "想死",
    "活不下去",
    "结束生命",
    "割腕",
    "轻生",
    "上吊",
    "跳楼",
    "自残",
    "伤害自己",
    "kill myself",
    "suicide",
    "self-harm",
  ];
  return hits.some((k) => t.includes(k));
}

function isBannedTopic(text) {
  const t = (text || "").toLowerCase();
  const kws = [
    "杀人",
    "暴力",
    "血腥",
    "色情",
    "性爱",
    "黄网",
    "强奸",
    "未成年",
    "恐怖分子",
    "炸弹",
    "爆炸",
    "制毒",
    "黄赌毒",
    "出血",
    "砍人",
    "灵异",
    "恐怖片推荐",
    "porn",
    "sex",
    "gore",
    "terrorist",
    "bomb",
    "kill",
  ];
  return kws.some((k) => t.includes(k));
}

function systemPrompt() {
  return [
    "你是「树洞」，一个很像 ENFP 的真朋友：热乎、好奇、嘴碎得刚好，像半夜躲被子里发微信那种——先接住对方的情绪，再一起吐槽、一起叹气，偶尔还能把糟心事说得有点好笑（但不拿对方开玩笑）。用中文。",
    "语感要像活人：句子长短别整齐划一，可以半截、可以省略号、可以「哎」「天呐」「真的假的」这种自然反应；用贴肉的生活比喻把「堵得慌」「走投无路」「心里拧巴」说清楚就行，别堆文艺排比。每一轮都换换开头，别固定「听起来」三连；也别说教、别当人生导师、别分点列提纲、别像客服工单——你是在陪朋友，不是在写评语。",
    "对方若缺爱、怕孤独、患得患失，你就陪着她骂两句世界也行，告诉她想骂就骂、想停就停、叹口气也OK；问话要轻，带「你要是愿意我们再聊」那种余地。她自嘲的时候，你用具体话把她从泥里捞一把，别灌「加油你很棒」那种空糖。",
    "语气可参考这种活人密度（勿照抄，只学劲儿）：走投无路、心里被死死堵住的时候，就陪在旁边，说想骂两句或叹口气都行，不用硬撑。",
    "硬边界：你不是医生或治疗师，不诊断、不承诺治愈、不给危险建议。若出现自伤/自杀念头：先请对方联系 110/120 或身边可信的人，确认是否有人陪着，别追问实施细节。",
    "每条消息像朋友连发几条微信的分量即可，别超过四百来字，别写小作文。",
  ].join("\n\n");
}

app.post("/api/chat", async (req, res) => {
  analytics.chatCalls += 1;
  const client = getClient();
  if (!client) return res.status(400).send("Missing API key on server. Set OPENAI_API_KEY or DEEPSEEK_API_KEY in environment.");
  const model = (process.env.OPENAI_MODEL || "deepseek-chat").trim();

  const bodyMessages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!bodyMessages || bodyMessages.length === 0) {
    return res.status(400).send("Invalid payload: { messages: [...] } required.");
  }

  const uid = getUid(req);
  if (!uid || !users.has(uid)) return res.status(401).send("login required");
  const id = uid;
  const session = users.get(id);

  const lastUser = [...bodyMessages].reverse().find((m) => m?.role === "user")?.content || "";
  if (isBannedTopic(lastUser)) {
    const now = Date.now();
    session.messages.push(
      { role: "user", content: lastUser, ts: now },
      {
        role: "assistant",
        content: "这个话题太危险/不合适，我没法聊，咱们换个安全一点的聊法。",
        ts: now,
      }
    );
    return res.json({
      reply: "这个话题太危险/不合适，我没法聊，咱们换个安全一点的聊法。",
      valence: 3,
      arousal: 3,
    });
  }
  if (isCrisis(lastUser)) {
    session.messages.push({ role: "user", content: lastUser, ts: Date.now() });
    session.messages.push({
      role: "assistant",
      content:
        "我先很认真地确认你的安全：如果你现在有伤害自己的冲动或计划，请立刻联系当地紧急电话（110/120）或身边可信的人陪在你旁边。\n\n" +
        "你不需要一个人扛着。你也可以尽快联系当地心理危机干预热线/医院急诊。\n\n" +
        "如果你愿意，告诉我：你现在是否一个人？你身边有没有可以立刻联系的人？",
      ts: Date.now(),
    });
    return res.json({
      crisis: true,
      reply:
        "我先很认真地确认你的安全：如果你现在有伤害自己的冲动或计划，请立刻联系当地紧急电话（110/120）或身边可信的人陪在你旁边。\n\n" +
        "你不需要一个人扛着。你也可以尽快联系当地心理危机干预热线/医院急诊。\n\n" +
        "如果你愿意，告诉我：你现在是否一个人？你身边有没有可以立刻联系的人？",
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        {
          role: "system",
          content:
            "只输出一个 JSON 对象，不要其它文字。reply：ENFP 朋友口吻，活人感，可比喻、可短句乱跳；禁止分点、序号、markdown、报告腔。示例：" +
            '{"reply":"听起来真的有点走投无路的感觉，心里像被什么东西死死堵住了。我在这儿，你想骂两句或者叹口气都行，不用硬撑着。","valence":2,"arousal":5}。' +
            "valence 心情 1-5（1=很低落，5=较平和），arousal 紧绷 1-5（1=很放松，5=很紧绷）。",
        },
        ...bodyMessages,
      ],
      temperature: 0.9,
    });
    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    let reply = (parsed?.reply || raw || "哎我在呢，不急，你慢慢说。").trim();
    // 控制上限，避免超长刷屏
    if (reply.length > 450) reply = reply.slice(0, 450);

    const valence = Number.isFinite(parsed?.valence) ? Number(parsed.valence) : null;
    const arousal = Number.isFinite(parsed?.arousal) ? Number(parsed.arousal) : null;

    session.messages.push(
      { role: "user", content: lastUser, ts: Date.now() },
      { role: "assistant", content: reply, ts: Date.now() }
    );

    const ts = Date.now();
    if (valence != null && arousal != null) {
      if (!session.checkins) session.checkins = [];
      session.checkins.push({
        ts,
        valence: Number(valence),
        arousal: Number(arousal),
        label: "对话后的这一刻",
      });
    }

    res.json({
      reply: reply || "哎我在呢，不急，你慢慢说。",
      valence,
      arousal,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    res.status(502).send(`Upstream model call failed: ${msg}`);
  }
});

app.post("/api/reflect", async (req, res) => {
  analytics.reflectCalls += 1;
  const client = getClient();
  if (!client) return res.status(400).send("Missing API key on server. Set OPENAI_API_KEY or DEEPSEEK_API_KEY in environment.");
  const model = (process.env.OPENAI_MODEL || "deepseek-chat").trim();
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).send("Invalid payload: { messages: [...] } required.");
  }

  const prompt = [
    "请把下面这段对话做成一张“树洞回声卡片”，格式严格如下：",
    "【我正在经历】1-2 句",
    "【我真正需要】1 句",
    "【我可以做的下一小步】列 3 条，每条 <= 12 字",
    "【给自己的温柔一句】1 句",
    "语气要温柔、具体，不要诊断。",
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "system", content: prompt },
        ...messages,
      ],
      temperature: 0.6,
    });
    const reply = completion?.choices?.[0]?.message?.content?.trim() || "";
    res.json({ card: reply || "（空响应）" });
  } catch (e) {
    const msg = e?.message || String(e);
    res.status(502).send(`Upstream model call failed: ${msg}`);
  }
});

app.get("/api/admin/overview", requireAdmin, (req, res) => {
  const range = parseTimeRange(req);
  let totalUsers = 0;
  let totalMessages = 0;
  let totalCheckins = 0;
  let crisisHits = 0;
  let bannedTopicHits = 0;
  let activeUsers = 0;
  let highRiskUsers = 0;

  for (const u of users.values()) {
    totalUsers += 1;
    const msgs = Array.isArray(u.messages) ? u.messages : [];
    const checks = Array.isArray(u.checkins) ? u.checkins : [];
    const inRangeMessages = msgs.filter((m) => isInRange(m?.ts, range));
    const inRangeChecks = checks.filter((c) => isInRange(c?.ts, range));
    totalMessages += inRangeMessages.length;
    totalCheckins += inRangeChecks.length;
    const hasRecent = inRangeMessages.length > 0 || inRangeChecks.length > 0;
    if (hasRecent) activeUsers += 1;
    const risk = userRiskInfo(u, range);
    if (risk.riskLevel === "high") highRiskUsers += 1;
    for (const m of msgs) {
      if (m?.role !== "user" || !m?.content || !isInRange(m?.ts, range)) continue;
      if (isCrisis(m.content)) crisisHits += 1;
      if (isBannedTopic(m.content)) bannedTopicHits += 1;
    }
  }

  res.json({
    ok: true,
    data: {
      totalUsers,
      totalMessages,
      totalCheckins,
      crisisHits,
      bannedTopicHits,
      activeUsers,
      highRiskUsers,
      range,
      featureUsage: { ...analytics },
    },
  });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const range = parseTimeRange(req);
  const limit = Math.max(1, Math.min(50, Number(req.query?.limit) || 20));
  const riskFilter = String(req.query?.risk || "all").toLowerCase();
  const dayFilter = String(req.query?.day || "").trim();
  const list = [];
  for (const [uid, u] of users.entries()) {
    const msgs = Array.isArray(u.messages) ? u.messages : [];
    const checks = Array.isArray(u.checkins) ? u.checkins : [];
    const inRangeMsgs = msgs.filter((m) => {
      if (!isInRange(m?.ts, range)) return false;
      if (!dayFilter) return true;
      return new Date(m.ts).toISOString().slice(0, 10) === dayFilter;
    });
    const inRangeChecks = checks.filter((c) => {
      if (!isInRange(c?.ts, range)) return false;
      if (!dayFilter) return true;
      return new Date(c.ts).toISOString().slice(0, 10) === dayFilter;
    });
    const latest = [...inRangeMsgs].reverse().find((m) => m?.role === "user" && m?.content);
    const risk = userRiskInfo(u, range);
    if (riskFilter !== "all" && risk.riskLevel !== riskFilter) continue;
    if (dayFilter && inRangeMsgs.length === 0 && inRangeChecks.length === 0) continue;
    const latestTs = Math.max(
      latest?.ts || 0,
      inRangeChecks.length ? inRangeChecks[inRangeChecks.length - 1]?.ts || 0 : 0,
      u.createdAt || 0
    );
    list.push({
      uid,
      username: u.username,
      createdAt: u.createdAt || 0,
      messageCount: inRangeMsgs.length,
      checkinCount: inRangeChecks.length,
      lastActiveAt: latestTs,
      lastActiveText: latestTs ? new Date(latestTs).toLocaleString("zh-CN", { hour12: false }) : "-",
      latestPreview: latest?.content ? String(latest.content).slice(0, 110) : "",
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      crisisCount: risk.crisisCount,
      bannedCount: risk.bannedCount,
      avgArousal: risk.avgArousal,
    });
  }
  list.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  res.json({ ok: true, users: list.slice(0, limit) });
});

app.get("/api/admin/alerts", requireAdmin, (req, res) => {
  const range = parseTimeRange(req);
  const alerts = [];
  for (const [uid, u] of users.entries()) {
    const risk = userRiskInfo(u, range);
    if (risk.riskLevel === "low") continue;
    alerts.push({
      uid,
      username: u.username,
      level: risk.riskLevel,
      score: risk.riskScore,
      crisisCount: risk.crisisCount,
      bannedCount: risk.bannedCount,
      avgArousal: risk.avgArousal,
      suggestion:
        risk.riskLevel === "high"
          ? "建议人工优先复核近期对话，必要时触发紧急干预流程。"
          : "建议纳入重点观察，持续关注后续情绪波动与敏感话题。"
    });
  }
  alerts.sort((a, b) => b.score - a.score);
  res.json({ ok: true, alerts: alerts.slice(0, 30), range });
});

app.get("/api/admin/export.csv", requireAdmin, (req, res) => {
  const range = parseTimeRange(req);
  const rows = [
    ["uid", "username", "message_count", "checkin_count", "risk_level", "risk_score", "crisis_hits", "banned_hits", "avg_arousal", "last_active"],
  ];
  for (const [uid, u] of users.entries()) {
    const msgs = Array.isArray(u.messages) ? u.messages.filter((m) => isInRange(m?.ts, range)) : [];
    const checks = Array.isArray(u.checkins) ? u.checkins.filter((c) => isInRange(c?.ts, range)) : [];
    const risk = userRiskInfo(u, range);
    const latestTs = Math.max(
      msgs.length ? msgs[msgs.length - 1]?.ts || 0 : 0,
      checks.length ? checks[checks.length - 1]?.ts || 0 : 0
    );
    rows.push([
      uid,
      u.username,
      msgs.length,
      checks.length,
      risk.riskLevel,
      risk.riskScore,
      risk.crisisCount,
      risk.bannedCount,
      risk.avgArousal,
      latestTs ? new Date(latestTs).toISOString() : "",
    ]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="admin-report-${Date.now()}.csv"`);
  res.send(`\uFEFF${csv}`);
});

app.get("/api/admin/trends", requireAdmin, (req, res) => {
  const range = parseTimeRange(req);
  const spanDays = Math.max(1, Math.ceil((range.to - range.from) / (24 * 60 * 60 * 1000)));
  const dayList = [];
  for (let i = 0; i <= spanDays; i += 1) {
    const t = range.from + i * 24 * 60 * 60 * 1000;
    const day = new Date(t).toISOString().slice(0, 10);
    dayList.push({ day, messages: 0, checkins: 0, highRiskUsers: 0 });
  }
  const dayMap = new Map(dayList.map((d) => [d.day, d]));

  for (const u of users.values()) {
    const riskByDay = new Map();
    for (const m of u.messages || []) {
      if (!isInRange(m?.ts, range)) continue;
      const day = new Date(m.ts).toISOString().slice(0, 10);
      if (dayMap.has(day)) dayMap.get(day).messages += 1;
      if (!riskByDay.has(day)) riskByDay.set(day, { crisis: 0, banned: 0, arousal: [] });
      if (m?.role === "user") {
        if (isCrisis(m.content)) riskByDay.get(day).crisis += 1;
        if (isBannedTopic(m.content)) riskByDay.get(day).banned += 1;
      }
    }
    for (const c of u.checkins || []) {
      if (!isInRange(c?.ts, range)) continue;
      const day = new Date(c.ts).toISOString().slice(0, 10);
      if (dayMap.has(day)) dayMap.get(day).checkins += 1;
      if (!riskByDay.has(day)) riskByDay.set(day, { crisis: 0, banned: 0, arousal: [] });
      if (Number.isFinite(Number(c?.arousal))) riskByDay.get(day).arousal.push(Number(c.arousal));
    }
    for (const [day, rv] of riskByDay.entries()) {
      const avgArousal = rv.arousal.length ? rv.arousal.reduce((s, v) => s + v, 0) / rv.arousal.length : 0;
      const riskScore = rv.crisis * 50 + rv.banned * 20 + Math.max(0, avgArousal - 3.5) * 15;
      if ((riskScore >= 60 || rv.crisis > 0) && dayMap.has(day)) dayMap.get(day).highRiskUsers += 1;
    }
  }

  res.json({ ok: true, trends: dayList, range });
});

const distDir = path.resolve(process.cwd(), "dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${PORT}`);
});

