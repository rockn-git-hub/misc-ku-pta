/**
 * Simple concurrent load test for the PTA private viewer.
 *
 * Usage:
 * node scripts/load-test-viewer.mjs --baseUrl=https://ku-pta-private-viewer.vercel.app --docId=... --pin=0420 --users=300 --rounds=1
 */

import { performance } from "node:perf_hooks";

/**
 * Parse CLI options.
 * @returns {{baseUrl: string, docId: string, pin: string, users: number, rounds: number}}
 */
function parseArgs() {
  const defaults = {
    baseUrl: "https://ku-pta-private-viewer.vercel.app",
    docId: "",
    pin: "",
    users: 50,
    rounds: 1
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split("=");
    if (!key.startsWith("--")) {
      continue;
    }
    const name = key.slice(2);
    if (name === "users" || name === "rounds") {
      defaults[name] = Number.parseInt(value, 10);
    } else if (name in defaults) {
      defaults[name] = value;
    }
  }

  if (!defaults.docId || !defaults.pin) {
    throw new Error("docId と pin を指定してください。");
  }

  return defaults;
}

/**
 * Read all Set-Cookie values from a fetch response.
 * @param {Response} response
 * @returns {string[]}
 */
function getSetCookies(response) {
  const getSetCookie = response.headers.getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(response.headers);
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Resolve absolute URL for page assets.
 * @param {string} baseUrl
 * @param {string} maybeAbsoluteUrl
 * @returns {string}
 */
function resolveUrl(baseUrl, maybeAbsoluteUrl) {
  return new URL(maybeAbsoluteUrl, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

/**
 * Extract cookie pair from Set-Cookie header.
 * @param {string} cookie
 * @returns {string}
 */
function toCookiePair(cookie) {
  return cookie.split(";", 1)[0];
}

/**
 * Execute one viewer session: login, manifest fetch, page fetch, 304 re-fetch.
 * @param {{baseUrl: string, docId: string, pin: string}} options
 * @returns {Promise<{loginMs:number, manifestMs:number, pageMs:number, revalidateMs:number, statuses:number[]}>}
 */
async function runOneUser(options) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const loginStarted = performance.now();
  const loginResponse = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      docId: options.docId,
      pin: options.pin
    })
  });
  const loginMs = performance.now() - loginStarted;

  if (!loginResponse.ok) {
    const text = await loginResponse.text();
    throw new Error(`ログイン失敗: ${loginResponse.status} ${text}`);
  }

  const cookieHeader = getSetCookies(loginResponse).map(toCookiePair).join("; ");
  if (!cookieHeader) {
    throw new Error("セッションクッキーを取得できませんでした。");
  }

  const manifestStarted = performance.now();
  const manifestResponse = await fetch(`${baseUrl}/api/document?doc=${encodeURIComponent(options.docId)}`, {
    headers: {
      Cookie: cookieHeader
    }
  });
  const manifestMs = performance.now() - manifestStarted;

  if (!manifestResponse.ok) {
    const text = await manifestResponse.text();
    throw new Error(`manifest 取得失敗: ${manifestResponse.status} ${text}`);
  }

  const manifest = await manifestResponse.json();
  const firstPageUrl = resolveUrl(baseUrl, manifest.document.pages[0].imageUrl);

  const pageStarted = performance.now();
  const pageResponse = await fetch(firstPageUrl, {
    headers: {
      ...(firstPageUrl.startsWith(baseUrl) ? { Cookie: cookieHeader } : {})
    }
  });
  const pageMs = performance.now() - pageStarted;

  if (!pageResponse.ok) {
    const text = await pageResponse.text();
    throw new Error(`page 取得失敗: ${pageResponse.status} ${text}`);
  }

  const etag = pageResponse.headers.get("etag");
  await pageResponse.arrayBuffer();

  const revalidateStarted = performance.now();
  const revalidateResponse = await fetch(firstPageUrl, {
    headers: {
      ...(firstPageUrl.startsWith(baseUrl) ? { Cookie: cookieHeader } : {}),
      ...(etag ? { "If-None-Match": etag } : {})
    }
  });
  const revalidateMs = performance.now() - revalidateStarted;

  return {
    loginMs,
    manifestMs,
    pageMs,
    revalidateMs,
    statuses: [loginResponse.status, manifestResponse.status, pageResponse.status, revalidateResponse.status]
  };
}

/**
 * Calculate percentile from numeric values.
 * @param {number[]} values
 * @param {number} percentile
 * @returns {number}
 */
function calculatePercentile(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * Format milliseconds.
 * @param {number} value
 * @returns {string}
 */
function formatMs(value) {
  return `${value.toFixed(1)}ms`;
}

/**
 * Print summary table.
 * @param {string} label
 * @param {number[]} values
 */
function printMetric(label, values) {
  console.log(
    `${label}: avg=${formatMs(values.reduce((sum, value) => sum + value, 0) / values.length)} `
    + `p50=${formatMs(calculatePercentile(values, 50))} `
    + `p95=${formatMs(calculatePercentile(values, 95))} `
    + `max=${formatMs(Math.max(...values))}`
  );
}

async function main() {
  const options = parseArgs();
  const allResults = [];

  for (let round = 1; round <= options.rounds; round += 1) {
    console.log(`round ${round}: users=${options.users}`);
    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: options.users }, () => runOneUser(options))
    );
    const totalMs = performance.now() - started;
    allResults.push(...results);
    console.log(`round ${round} finished in ${formatMs(totalMs)}`);
  }

  const loginValues = allResults.map((item) => item.loginMs);
  const manifestValues = allResults.map((item) => item.manifestMs);
  const pageValues = allResults.map((item) => item.pageMs);
  const revalidateValues = allResults.map((item) => item.revalidateMs);
  const statusCounts = new Map();

  for (const result of allResults) {
    for (const status of result.statuses) {
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }
  }

  console.log("");
  printMetric("login", loginValues);
  printMetric("manifest", manifestValues);
  printMetric("page", pageValues);
  printMetric("page revalidate", revalidateValues);
  console.log(`status counts: ${JSON.stringify(Object.fromEntries(statusCounts))}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
