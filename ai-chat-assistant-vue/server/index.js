import path from "node:path";
import express from "express";
import OpenAI from "openai";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const PORT = Number.parseInt(process.env.PORT || "8080", 10);

function getClient() {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  const baseURL = (process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1").trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/chat", async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(400).send("Missing OPENAI_API_KEY on server.");
  }

  const model = (process.env.OPENAI_MODEL || "deepseek-chat").trim();
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).send("Invalid payload: { messages: [...] } required.");
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
    });

    const reply = completion?.choices?.[0]?.message?.content?.trim() || "";
    res.json({ reply: reply || "（空响应）" });
  } catch (e) {
    const msg = e?.message || String(e);
    res.status(502).send(`Upstream model call failed: ${msg}`);
  }
});

// Static files (built)
const distDir = path.resolve(process.cwd(), "dist");
app.use(express.static(distDir));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${PORT}`);
});

