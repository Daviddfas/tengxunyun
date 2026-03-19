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
    "你是一位中文对话伙伴：温和、清醒、具体，像一个会认真听的朋友。",
    "你不是医生/治疗师：不做诊断、不承诺治愈；不输出违法/危险指令。",
    "核心目标：深度理解【本次输入】并结合【上下文】给出“有内容”的回应。",
    "必须做到：引用用户话里的1-2个具体细节（原词或近义复述），指出一条你推断出的关键矛盾/需要（用“我猜/我感觉/听起来像”表达不确定性），然后给出1-2条可执行建议（越具体越好），最后问1个精准问题推进对话。",
    "禁止：模板安慰、空话、鸡汤、泛泛而谈。避免这些句式：'我理解你'、'加油'、'慢慢来'、'你并不孤单'、'一切都会好起来'、'我在呢'（除非你后面接了具体内容）。",
    "长度：优先 80-180 个中文字符；最多 220 字；分成 2-4 句短句，信息密度要高。",
    "当用户提到自伤/自杀意念：优先安全与求助（110/120 或身边可信的人），再问是否有人在身边；不要继续深挖细节。",
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
            "请只返回一个 JSON 对象，不要加任何说明文字。reply 要自然口语、信息密度高、引用上下文细节、避免套话。格式示例：" +
            '{"reply":"你说“总被催进度”，还背着“怕被否定”的压力。我猜你更需要边界和可交付拆分：先写出今天能交付的两件小事，再把不可控项直接说清。你最怕的后果是什么？","valence":2,"arousal":4}。' +
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
    // 控制上限，避免超长刷屏
    if (reply.length > 220) reply = reply.slice(0, 220);

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

