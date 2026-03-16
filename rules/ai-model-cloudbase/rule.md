---
name: ai-model-cloudbase
description: Complete guide for calling AI models with CloudBase - covers JS/Node SDK and WeChat Mini Program. Text generation, streaming, and image generation.
alwaysApply: false
---

## When to use this skill

Use this skill for **calling AI models using CloudBase** across all platforms.

**Supported platforms:**

| Platform | SDK/API | Section |
|----------|---------|---------|
| Web (Browser) | `@cloudbase/js-sdk` | Part 1 |
| Node.js (Server/Cloud Functions) | `@cloudbase/node-sdk` ≥3.16.0 | Part 1 (same API, different init) |
| Any platform (HTTP) | HTTP API / OpenAI SDK | Part 2 |
| WeChat Mini Program | `wx.cloud.extend.AI` | Part 3 ⚠️ Different API |

---

## How to use this skill (for a coding agent)

1. **Identify the target platform** - Ask user which platform they're developing for
2. **Confirm CloudBase environment** - Get `env` (environment ID) and credentials
3. **Pick the appropriate section** - **Part 1** for JS/Node SDK, **Part 3** for WeChat Mini Program
4. **Follow CloudBase API shapes exactly** - Do not invent new APIs

---

# Part 1: CloudBase JS SDK & Node SDK

**JS SDK and Node SDK share the same AI API.** Only initialization differs.

## Installation

```bash
# For Web (Browser)
npm install @cloudbase/js-sdk

# For Node.js (Server/Cloud Functions)
npm install @cloudbase/node-sdk
```

⚠️ **Node SDK AI feature requires version 3.16.0 or above.** Check your version with `npm list @cloudbase/node-sdk`.

## Initialization - Web (JS SDK)

```js
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "<YOUR_ENV_ID>",
  accessKey: "<YOUR_PUBLISHABLE_KEY>"  // Get from CloudBase console
});

const auth = app.auth();
await auth.signInAnonymously();

const ai = app.ai();
```

## Initialization - Node.js (Node SDK)

```js
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: '<YOUR_ENV_ID>' });

exports.main = async (event, context) => {
  const ai = app.ai();
  // Use AI features - same API as JS SDK
};
```

## generateText() - Non-streaming

```js
const model = ai.createModel("hunyuan-exp");

const result = await model.generateText({
  model: "hunyuan-lite",
  messages: [{ role: "user", content: "你好，请你介绍一下李白" }],
});

console.log(result.text);           // Generated text string
console.log(result.usage);          // { prompt_tokens, completion_tokens, total_tokens }
console.log(result.messages);       // Full message history
console.log(result.rawResponses);   // Raw model responses
```

## streamText() - Streaming

```js
const model = ai.createModel("hunyuan-exp");

const res = await model.streamText({
  model: "hunyuan-turbos-latest",
  messages: [{ role: "user", content: "你好，请你介绍一下李白" }],
});

// Option 1: Iterate text stream (recommended)
for await (let text of res.textStream) {
  console.log(text);  // Incremental text chunks
}

// Option 2: Iterate data stream for full response data
for await (let data of res.dataStream) {
  console.log(data);  // Full response chunk with metadata
}

// Option 3: Get final results
const messages = await res.messages;  // Full message history
const usage = await res.usage;        // Token usage
```

## generateImage() - Image Generation

⚠️ **Image generation is currently only available in Node SDK**, not in JS SDK (Web) or WeChat Mini Program.

```js
// Node SDK only
const imageModel = ai.createImageModel("hunyuan-image");

const res = await imageModel.generateImage({
  model: "hunyuan-image",
  prompt: "一只可爱的猫咪在草地上玩耍",
  size: "1024x1024",
  version: "v1.9",
});

console.log(res.data[0].url);           // Image URL (valid 24 hours)
console.log(res.data[0].revised_prompt);// Revised prompt if revise=true
```

---

# Part 2: CloudBase HTTP API

## API Endpoint

```
https://<ENV_ID>.api.tcloudbasegateway.com/v1/ai/<PROVIDER>/v1/chat/completions
```

## cURL - Non-streaming

```bash
curl -X POST 'https://<ENV_ID>.api.tcloudbasegateway.com/v1/ai/deepseek/v1/chat/completions' \
  -H 'Authorization: Bearer <YOUR_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"model": "deepseek-r1", "messages": [{"role": "user", "content": "你好"}], "stream": false}'
```

## cURL - Streaming

```bash
curl -X POST 'https://<ENV_ID>.api.tcloudbasegateway.com/v1/ai/deepseek/v1/chat/completions' \
  -H 'Authorization: Bearer <YOUR_API_KEY>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"model": "deepseek-r1", "messages": [{"role": "user", "content": "你好"}], "stream": true}'
```

## OpenAI SDK Compatible

```js
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: "<YOUR_API_KEY>",
  baseURL: "https://<ENV_ID>.api.tcloudbasegateway.com/v1/ai/deepseek/v1",
});

const completion = await client.chat.completions.create({
  model: "deepseek-r1",
  messages: [{ role: "user", content: "你好" }],
  stream: true,
});

for await (const chunk of completion) {
  console.log(chunk);
}
```

---

# Part 3: WeChat Mini Program

⚠️ **WeChat Mini Program API is DIFFERENT from JS/Node SDK.** Pay attention to the parameter structure.

**Requires base library 3.7.1+. No extra SDK needed.**

## Initialization

```js
// app.js
App({
  onLaunch: function() {
    wx.cloud.init({ env: "<YOUR_ENV_ID>" });
  }
})
```

## generateText() - Non-streaming

⚠️ **Different from JS/Node SDK:** Return value is raw model response.

```js
const model = wx.cloud.extend.AI.createModel("hunyuan-exp");

const res = await model.generateText({
  model: "hunyuan-lite",
  messages: [{ role: "user", content: "你好" }],
});

// ⚠️ Return value is RAW model response, NOT wrapped like JS/Node SDK
console.log(res.choices[0].message.content);  // Access via choices array
console.log(res.usage);                        // Token usage
```

## streamText() - Streaming

⚠️ **Different from JS/Node SDK:** Must wrap parameters in `data` object, supports callbacks.

```js
const model = wx.cloud.extend.AI.createModel("hunyuan-exp");

// ⚠️ Parameters MUST be wrapped in `data` object
const res = await model.streamText({
  data: {                              // ⚠️ Required wrapper
    model: "hunyuan-lite",
    messages: [{ role: "user", content: "hi" }]
  },
  onText: (text) => {                  // Optional: incremental text callback
    console.log("New text:", text);
  },
  onEvent: ({ data }) => {             // Optional: raw event callback
    console.log("Event:", data);
  },
  onFinish: (fullText) => {            // Optional: completion callback
    console.log("Done:", fullText);
  }
});

// Async iteration also available
for await (let str of res.textStream) {
  console.log(str);
}

// Check for completion with eventStream
for await (let event of res.eventStream) {
  console.log(event);
  if (event.data === "[DONE]") {       // ⚠️ Check for [DONE] to stop
    break;
  }
}
```

---

# Best Practices

1. **Use streaming for long responses** - Better user experience
2. **Handle errors gracefully** - Wrap AI calls in try/catch
3. **Keep API Keys secure** - Never expose in client-side code
4. **Initialize early** - Initialize SDK/cloud in app entry point
5. **Check for [DONE]** - In WeChat Mini Program streaming, check `event.data === "[DONE]"` to stop

