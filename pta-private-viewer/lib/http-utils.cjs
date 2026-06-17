/**
 * Shared HTTP helpers for local dev and Vercel serverless handlers.
 */

function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(payload));
}

function sendBinary(res, status, payload, contentType, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(payload);
}

function sendText(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(message);
}

function isBlobStoreUnavailableError(error) {
  const message = String(error?.message || "");
  return message.includes("This store has been suspended")
    || message.includes("Your store is blocked")
    || message.includes("Failed to fetch blob: 403 Forbidden");
}

function handleBlobStoreUnavailable(res, error) {
  if (!isBlobStoreUnavailableError(error)) {
    return false;
  }

  sendJson(res, 503, {
    ok: false,
    message: "現在、資料ストレージが停止しているため利用できません。しばらくしてから再度お試しください。"
  });
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function readBufferBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function buildAbsoluteUrl(req, pathname) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${protocol}://${host}${pathname}`;
}

module.exports = {
  sendJson,
  sendBinary,
  sendText,
  handleBlobStoreUnavailable,
  readJsonBody,
  readBufferBody,
  buildAbsoluteUrl
};
