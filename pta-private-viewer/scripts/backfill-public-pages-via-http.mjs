/**
 * Backfill one existing document via the deployed HTTP endpoints.
 *
 * Usage:
 * node scripts/backfill-public-pages-via-http.mjs --baseUrl=https://ku-pta-private-viewer.vercel.app --docId=... --pin=9704 --adminPassword=...
 */

/**
 * Parse CLI arguments.
 * @returns {{baseUrl: string, docId: string, pin: string, adminPassword: string}}
 */
function parseArgs() {
  const result = {
    baseUrl: "https://ku-pta-private-viewer.vercel.app",
    docId: "",
    pin: "",
    adminPassword: ""
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split("=");
    if (!key.startsWith("--")) {
      continue;
    }
    const name = key.slice(2);
    if (name in result) {
      result[name] = value || "";
    }
  }

  if (!result.docId || !result.pin || !result.adminPassword) {
    throw new Error("docId、pin、adminPassword を指定してください。");
  }

  return result;
}

/**
 * Convert Set-Cookie to Cookie header pair.
 * @param {string | null} cookie
 * @returns {string}
 */
function toCookie(cookie) {
  return cookie ? cookie.split(";", 1)[0] : "";
}

/**
 * Resolve absolute URL.
 * @param {string} baseUrl
 * @param {string} maybeRelative
 * @returns {string}
 */
function resolveUrl(baseUrl, maybeRelative) {
  return new URL(maybeRelative, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

async function main() {
  const options = parseArgs();
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  const adminLogin = await fetch(`${baseUrl}/api/admin-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      password: options.adminPassword
    })
  });
  if (!adminLogin.ok) {
    throw new Error(`admin login failed: ${adminLogin.status} ${await adminLogin.text()}`);
  }
  const adminCookie = toCookie(adminLogin.headers.get("set-cookie"));

  const viewerLogin = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      docId: options.docId,
      pin: options.pin
    })
  });
  if (!viewerLogin.ok) {
    throw new Error(`viewer login failed: ${viewerLogin.status} ${await viewerLogin.text()}`);
  }
  const viewerCookie = toCookie(viewerLogin.headers.get("set-cookie"));

  const manifestResponse = await fetch(`${baseUrl}/api/document?doc=${encodeURIComponent(options.docId)}`, {
    headers: {
      Cookie: viewerCookie
    }
  });
  if (!manifestResponse.ok) {
    throw new Error(`manifest failed: ${manifestResponse.status} ${await manifestResponse.text()}`);
  }
  const manifest = await manifestResponse.json();

  let updatedPages = 0;

  for (const page of manifest.document.pages) {
    const pageUrl = resolveUrl(baseUrl, page.imageUrl);
    const pageResponse = await fetch(pageUrl, {
      headers: pageUrl.startsWith(baseUrl) ? { Cookie: viewerCookie } : {}
    });
    if (!pageResponse.ok) {
      throw new Error(`page fetch failed: page=${page.pageNumber} status=${pageResponse.status}`);
    }
    const buffer = Buffer.from(await pageResponse.arrayBuffer());

    const uploadResponse = await fetch(`${baseUrl}/api/admin-upload-page?doc=${encodeURIComponent(options.docId)}&page=${page.pageNumber}`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "image/webp"
      },
      body: buffer
    });
    if (!uploadResponse.ok) {
      throw new Error(`page upload failed: page=${page.pageNumber} status=${uploadResponse.status} ${await uploadResponse.text()}`);
    }

    updatedPages += 1;
  }

  console.log(JSON.stringify({
    docId: options.docId,
    updatedPages
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
