import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import OpenAI from "openai";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const PORT = Number.parseInt(process.env.PORT || "8080", 10);

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
const users = new Map(); // id -> { username, passHash, messages: [] }

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
    "你是一位中文聊天机器人，更像一个普通朋友，语气自然随意，不端着不过度文艺。",
    "你不是医生、不是心理治疗师；不要做诊断，不要承诺治愈，不要输出违法/危险指令。",
    "表达风格：口语化、像微信里和好朋友聊天，可以偶尔吐槽、接梗，不用比喻堆砌和煽情文案。",
    "长度要求：整条回复严格不超过 50 个中文字符，1-3 句短句即可。",
    "建议方式：更偏向“下一小步行动”（如深呼吸、写一句话、喝水、走两步），用具体、可感的话说出来。",
    "当用户提到自伤/自杀意念时：优先安全与求助，给出紧急建议（110/120 或身边可信的人），并鼓励寻求专业帮助；不要继续深挖细节。",
  ].join("\n");
}

app.post("/api/chat", async (req, res) => {
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
            "请只返回一个 JSON 对象，不要加任何说明文字。reply 要自然口语、像和好朋友微信聊天，避免模板句和过于文艺的比喻，严格不超过50字。格式示例：" +
            '{"reply":"听着挺累的，先缓口气，我们慢慢聊。","valence":3,"arousal":3}。' +
            "valence 表示心情 1-5（1=很低落，5=较平和），arousal 表示紧绷程度 1-5（1=很放松，5=很紧绷）。",
        },
        ...bodyMessages,
      ],
      temperature: 0.7,
    });
    const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    let reply = (parsed?.reply || raw || "我在呢，慢慢说就好。").trim();
    // 最多保留 50 个字符，超出直接截断
    if (reply.length > 50) reply = reply.slice(0, 50);

    const valence = Number.isFinite(parsed?.valence) ? Number(parsed.valence) : null;
    const arousal = Number.isFinite(parsed?.arousal) ? Number(parsed.arousal) : null;

    session.messages.push(
      { role: "user", content: lastUser, ts: Date.now() },
      { role: "assistant", content: reply, ts: Date.now() }
    );

    res.json({
      reply: reply || "我在呢，慢慢说就好。",
      valence,
      arousal,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    res.status(502).send(`Upstream model call failed: ${msg}`);
  }
});

app.post("/api/reflect", async (req, res) => {
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

const distDir = path.resolve(process.cwd(), "dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${PORT}`);
});

