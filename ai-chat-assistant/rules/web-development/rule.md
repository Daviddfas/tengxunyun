---
name: web-development
description: Web frontend project development rules. Use this skill when developing web frontend pages, deploying static hosting, and integrating CloudBase Web SDK.
alwaysApply: false
---

## When to use this skill

Use this skill for **Web frontend project development** when you need to:

- Develop web frontend pages and interfaces
- Deploy static websites to CloudBase static hosting
- Integrate CloudBase Web SDK for database, cloud functions, and authentication
- Set up modern frontend build systems (Vite, Webpack, etc.)
- Handle routing and build configurations for static hosting

**Do NOT use for:**
- Mini-program development (use miniprogram-development skill)
- Backend service development (use cloudrun-development skill)
- UI design only (use ui-design skill, but may combine with this skill)

---

## How to use this skill (for a coding agent)

1. **Follow project structure conventions**
   - Frontend source code in `src` directory
   - Build output in `dist` directory
   - Cloud functions in `cloudfunctions` directory
   - Use modern frontend build systems (Vite, etc.)

2. **Use CloudBase Web SDK correctly**
   - Always use SDK built-in authentication features
   - Never implement login logic in cloud functions
   - Use `envQuery` tool to get environment ID

3. **Deploy and preview properly**
   - Build project first (ensure `npm install` is executed)
   - Use relative paths for `publicPath` configuration
   - Use hash routing for better static hosting compatibility
   - Deploy to subdirectory if user doesn't specify root directory

---

# Web Frontend Development Rules

## Project Structure

1. **Directory Organization**:
   - Frontend source code should be stored in `src` directory
   - Build output should be placed in `dist` directory
   - Cloud functions should be in `cloudfunctions` directory

2. **Routing**:
   - If the frontend project involves routing, use hash routing by default
   - Hash routing solves the 404 refresh issue and is more suitable for static website hosting deployment

## CloudBase Web SDK Usage

**Important: Authentication must use SDK built-in features. It is strictly forbidden to implement login authentication logic using cloud functions!**

```js
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "xxxx-yyy", // Can query environment ID via envQuery tool
});
const auth = app.auth();

// Check current login state
let loginState = await auth.getLoginState();

if (loginState && loginState.user) {
  // Logged in
  const user = await auth.getCurrentUser();
  console.log("Current user:", user);
} else {
  // Not logged in - use SDK built-in authentication features
  const verificationInfo = await auth.getVerification({
    phone_number: `+86 ${phoneNum}`,
  });

  await auth.signInWithSms({
    verificationInfo,
    verificationCode,
    phoneNum,
  });
}
```

**Initialization rules (Web, @cloudbase/js-sdk):**

- Always use **synchronous initialization** with the pattern above
- Do **not** lazy-load the SDK with `import("@cloudbase/js-sdk")`
- Do **not** wrap SDK initialization in async helpers such as `initCloudBase()` with internal `initPromise` caches
- Keep a single shared `app`/`auth` instance in your frontend app; reuse it instead of re-initializing

