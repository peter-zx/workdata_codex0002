import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const usersFile = path.join(dataDir, "users.json");
const sessionsFile = path.join(dataDir, "sessions.json");
const entriesDir = path.join(dataDir, "entries");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";
const hashPassword = promisify(scrypt);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function log(level, message, meta = {}) {
  console[level === "error" ? "error" : "log"](JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...meta
  }));
}

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(entriesDir, { recursive: true });
  await ensureJsonFile(usersFile, []);
  await ensureJsonFile(sessionsFile, []);
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await stat(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeJson(filePath, fallback);
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    log("error", "Failed to read JSON file", { filePath, error: error.message });
    throw error;
  }
}

async function writeJson(filePath, value) {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    log("error", "Failed to write JSON file", { filePath, error: error.message });
    throw error;
  }
}

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(statusCode, { "content-type": contentType, ...headers });
  res.end(body);
}

function sendJson(res, statusCode, body, headers = {}) {
  send(res, statusCode, JSON.stringify(body), "application/json; charset=utf-8", headers);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw httpError(413, "请求内容过大");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function validateCredentials(username, password) {
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5.-]{2,30}$/.test(username)) {
    throw httpError(400, "账号需为 2-30 位，可包含中文、字母、数字、点、横线或下划线");
  }
  if (String(password || "").length < 6) {
    throw httpError(400, "密码至少 6 位");
  }
}

async function makePasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await hashPassword(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const derived = await hashPassword(password, salt, 64);
  const storedBuffer = Buffer.from(hash, "hex");
  return storedBuffer.length === derived.length && timingSafeEqual(storedBuffer, derived);
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(value.join("="));
  }
  return cookies;
}

function sessionCookie(sessionId, maxAge = 60 * 60 * 24 * 30) {
  return `daily_log_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function getCurrentUser(req) {
  const sessionId = parseCookies(req).daily_log_session;
  if (!sessionId) return null;

  const sessions = await readJson(sessionsFile, []);
  const session = sessions.find((item) => item.id === sessionId && new Date(item.expiresAt) > new Date());
  if (!session) return null;

  const users = await readJson(usersFile, []);
  const user = users.find((item) => item.id === session.userId);
  if (!user) return null;

  return { id: user.id, username: user.username, displayName: user.displayName };
}

async function requireUser(req) {
  const user = await getCurrentUser(req);
  if (!user) throw httpError(401, "请先登录");
  return user;
}

function entriesFile(userId) {
  return path.join(entriesDir, `${userId}.json`);
}

async function handleApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/auth/me") {
    const user = await getCurrentUser(req);
    return sendJson(res, 200, { user });
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/auth/register") {
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    validateCredentials(username, password);

    const users = await readJson(usersFile, []);
    if (users.some((user) => user.username === username)) {
      throw httpError(409, "账号已存在");
    }

    const user = {
      id: randomUUID(),
      username,
      displayName: username,
      passwordHash: await makePasswordHash(password),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeJson(usersFile, users);
    await writeJson(entriesFile(user.id), []);

    const session = await createSession(user.id);
    return sendJson(res, 201, {
      user: { id: user.id, username: user.username, displayName: user.displayName }
    }, { "set-cookie": sessionCookie(session.id) });
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    const users = await readJson(usersFile, []);
    const user = users.find((item) => item.username === username);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw httpError(401, "账号或密码不正确");
    }

    const session = await createSession(user.id);
    return sendJson(res, 200, {
      user: { id: user.id, username: user.username, displayName: user.displayName }
    }, { "set-cookie": sessionCookie(session.id) });
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    const sessionId = parseCookies(req).daily_log_session;
    if (sessionId) {
      const sessions = await readJson(sessionsFile, []);
      await writeJson(sessionsFile, sessions.filter((item) => item.id !== sessionId));
    }
    return sendJson(res, 200, { ok: true }, { "set-cookie": sessionCookie("", 0) });
  }

  if (requestUrl.pathname === "/api/entries") {
    const user = await requireUser(req);
    if (req.method === "GET") {
      const entries = await readJson(entriesFile(user.id), []);
      return sendJson(res, 200, { entries });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const now = new Date();
      const entry = {
        id: randomUUID(),
        date: toDateKey(now),
        createdAt: now.toISOString(),
        content: String(body.content || "").trim(),
        progress: String(body.progress || "").trim(),
        review: String(body.review || "").trim()
      };
      if (!entry.content && !entry.progress && !entry.review) {
        throw httpError(400, "请至少填写一项内容");
      }

      const entries = await readJson(entriesFile(user.id), []);
      entries.unshift(entry);
      await writeJson(entriesFile(user.id), entries);
      return sendJson(res, 201, { entry });
    }
  }

  const entryMatch = requestUrl.pathname.match(/^\/api\/entries\/([^/]+)$/);
  if (entryMatch && req.method === "DELETE") {
    const user = await requireUser(req);
    const entryId = entryMatch[1];
    const entries = await readJson(entriesFile(user.id), []);
    await writeJson(entriesFile(user.id), entries.filter((entry) => entry.id !== entryId));
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "not_found" });
}

async function createSession(userId) {
  const sessions = await readJson(sessionsFile, []);
  const session = {
    id: randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  };
  sessions.push(session);
  await writeJson(sessionsFile, sessions.filter((item) => new Date(item.expiresAt) > new Date()));
  return session;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolvePublicPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const requested = decodedPath === "/" ? "/index.html" : decodedPath;
  const absolutePath = path.resolve(publicDir, `.${requested}`);
  const relative = path.relative(publicDir, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolutePath;
}

async function handleStatic(req, res, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed");
  }

  const filePath = resolvePublicPath(requestUrl.pathname);
  if (!filePath) return send(res, 403, "Forbidden");

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return send(res, 404, "Not Found");

    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": fileStat.size,
      "cache-control": "no-store"
    });
    if (req.method === "HEAD") return res.end();

    createReadStream(filePath)
      .on("error", () => send(res, 500, "Internal Server Error"))
      .pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") return send(res, 404, "Not Found");
    log("error", "Static file error", { error: error.message });
    return send(res, 500, "Internal Server Error");
  }
}

await ensureStore();

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (requestUrl.pathname.startsWith("/api/")) {
      return await handleApi(req, res, requestUrl);
    }
    return await handleStatic(req, res, requestUrl);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      log("error", "Request failed", { path: requestUrl.pathname, error: error.message });
    }
    return sendJson(res, statusCode, { error: error.message || "服务器错误" });
  }
});

server.listen(port, host, () => {
  log("info", "Daily Log Tool running", { url: `http://localhost:${port}`, dataDir });
});
