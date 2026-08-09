/**
 * Optional live smoke against a running codexnovel server.
 *
 *   CODEXNOVEL_BASE_URL=http://127.0.0.1:3008 node scripts/smoke-codexnovel.mjs
 *
 * Does not require login for /health. Set CODEXNOVEL_USER / CODEXNOVEL_PASSWORD to also login.
 */

const base = (process.env.CODEXNOVEL_BASE_URL || "").replace(/\/+$/, "");
if (!base) {
  console.error("Set CODEXNOVEL_BASE_URL (e.g. http://127.0.0.1:3008)");
  process.exit(1);
}

const api = `${base.replace(/\/api\/v1$/i, "")}/api/v1`;

async function main() {
  const healthRes = await fetch(`${api}/health`);
  if (!healthRes.ok) {
    throw new Error(`health failed: ${healthRes.status}`);
  }
  const health = await healthRes.json();
  console.log("health:", health);

  const user = process.env.CODEXNOVEL_USER;
  const password = process.env.CODEXNOVEL_PASSWORD;
  if (!user || !password) {
    console.log("skip login (set CODEXNOVEL_USER / CODEXNOVEL_PASSWORD to test auth)");
    return;
  }

  const loginRes = await fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password, deviceName: "smoke-script" }),
  });
  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`login failed: ${loginRes.status} ${text}`);
  }
  const auth = await loginRes.json();
  console.log("login user:", auth.user);

  const meRes = await fetch(`${api}/me`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!meRes.ok) {
    throw new Error(`me failed: ${meRes.status}`);
  }
  console.log("me:", await meRes.json());
  console.log("smoke ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
