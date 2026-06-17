/**
 * Storage abstraction.
 * Local development stores files under data/.
 * Production can switch to Vercel Blob by setting BLOB_READ_WRITE_TOKEN.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const s3CloudFrontModule = require("./s3-cloudfront.cjs");
const s3CloudFront = s3CloudFrontModule.default || s3CloudFrontModule;

const LOCAL_ROOT = path.join(process.cwd(), "data");

function isS3StorageEnabled() {
  return s3CloudFront.isS3StorageEnabled();
}

function isBlobStorageEnabled() {
  return !isS3StorageEnabled() && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function toLocalPath(pathname) {
  return path.join(LOCAL_ROOT, ...pathname.split("/"));
}

async function getBlobSdk() {
  return import("@vercel/blob");
}

function isBlobRateLimited(error) {
  return error && (error.name === "BlobServiceRateLimited" || error.constructor?.name === "BlobServiceRateLimited");
}

async function withBlobRetry(task) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!isBlobRateLimited(error) || attempt === maxAttempts) {
        throw error;
      }

      const retryAfterSeconds = Number(error.retryAfter || 0);
      const waitMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : attempt * 200;
      await delay(waitMs);
    }
  }

  throw new Error("blob-retry-exhausted");
}

async function readJson(pathname, fallback = null) {
  if (isS3StorageEnabled()) {
    return s3CloudFront.readJson(pathname, fallback);
  }

  if (isBlobStorageEnabled()) {
    try {
      const { get } = await getBlobSdk();
      const result = await withBlobRetry(() => get(pathname, { access: "private" }));
      if (!result || result.statusCode !== 200 || !result.stream) {
        return fallback;
      }
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    } catch (error) {
      if (error && error.name === "BlobNotFoundError") {
        return fallback;
      }
      throw error;
    }
  }

  const filePath = toLocalPath(pathname);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const text = await fsp.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function writeJson(pathname, value) {
  if (isS3StorageEnabled()) {
    await s3CloudFront.writeJson(pathname, value);
    return;
  }

  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (isBlobStorageEnabled()) {
    const { put } = await getBlobSdk();
    await withBlobRetry(() => put(pathname, text, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8"
    }));
    return;
  }

  const filePath = toLocalPath(pathname);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, text, "utf8");
}

async function writeBuffer(pathname, buffer, contentType, options = {}) {
  if (isS3StorageEnabled()) {
    return s3CloudFront.writeBuffer(pathname, buffer, contentType, options);
  }

  const access = options.access === "public" ? "public" : "private";

  if (isBlobStorageEnabled()) {
    const { put } = await getBlobSdk();
    const result = await withBlobRetry(() => put(pathname, buffer, {
      access,
      allowOverwrite: true,
      contentType
    }));
    return {
      pathname: result.pathname,
      url: result.url,
      downloadUrl: result.downloadUrl || null,
      contentType: result.contentType || contentType
    };
  }

  const filePath = toLocalPath(pathname);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, buffer);
  return {
    pathname,
    url: null,
    downloadUrl: null,
    contentType
  };
}

function normalizeEtag(value) {
  if (!value) {
    return null;
  }
  return String(value).trim();
}

function createLocalEtag(buffer) {
  return `"${crypto.createHash("sha1").update(buffer).digest("hex")}"`;
}

async function readBuffer(pathname, options = {}) {
  if (isS3StorageEnabled()) {
    return s3CloudFront.readBuffer(pathname, options);
  }

  const ifNoneMatch = normalizeEtag(options.ifNoneMatch);

  if (isBlobStorageEnabled()) {
    try {
      const { get } = await getBlobSdk();
      const result = await withBlobRetry(() => get(pathname, {
        access: "private",
        ifNoneMatch: ifNoneMatch || undefined
      }));
      if (!result) {
        return null;
      }
      if (result.statusCode === 304) {
        return {
          statusCode: 304,
          etag: result.blob?.etag || ifNoneMatch,
          contentType: result.blob?.contentType || null
        };
      }
      if (result.statusCode !== 200 || !result.stream) {
        return null;
      }
      const arrayBuffer = await new Response(result.stream).arrayBuffer();
      return {
        statusCode: 200,
        buffer: Buffer.from(arrayBuffer),
        contentType: result.blob.contentType,
        etag: result.blob.etag || null
      };
    } catch (error) {
      if (error && error.name === "BlobNotFoundError") {
        return null;
      }
      throw error;
    }
  }

  const filePath = toLocalPath(pathname);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const buffer = await fsp.readFile(filePath);
  const etag = createLocalEtag(buffer);
  if (ifNoneMatch && ifNoneMatch === etag) {
    return {
      statusCode: 304,
      etag,
      contentType: null
    };
  }
  return {
    statusCode: 200,
    buffer,
    contentType: null,
    etag
  };
}

async function exists(pathname) {
  if (isS3StorageEnabled()) {
    return s3CloudFront.exists(pathname);
  }

  if (isBlobStorageEnabled()) {
    try {
      const { head } = await getBlobSdk();
      await withBlobRetry(() => head(pathname, { access: "private" }));
      return true;
    } catch (error) {
      if (error && error.name === "BlobNotFoundError") {
        return false;
      }
      throw error;
    }
  }

  return fs.existsSync(toLocalPath(pathname));
}

async function listPathnames(prefix) {
  if (isS3StorageEnabled()) {
    return s3CloudFront.listPathnames(prefix);
  }

  if (isBlobStorageEnabled()) {
    const { list } = await getBlobSdk();
    const pathnames = [];
    let cursor;

    do {
      const result = await withBlobRetry(() => list({
        prefix,
        cursor,
        limit: 1000
      }));
      for (const blob of result.blobs) {
        pathnames.push(blob.pathname);
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    return pathnames.sort();
  }

  const rootPath = toLocalPath(prefix);
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const stats = await fsp.stat(rootPath);
  if (stats.isFile()) {
    return [prefix];
  }

  const pathnames = [];

  async function walk(currentPath, currentPrefix) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      const nextPrefix = `${currentPrefix}${entry.name}`;
      if (entry.isDirectory()) {
        await walk(nextPath, `${nextPrefix}/`);
      } else {
        pathnames.push(nextPrefix);
      }
    }
  }

  await walk(rootPath, prefix.endsWith("/") ? prefix : `${prefix}/`);
  return pathnames.sort();
}

async function deletePathnames(pathnames) {
  if (!Array.isArray(pathnames) || pathnames.length === 0) {
    return;
  }

  if (isS3StorageEnabled()) {
    await s3CloudFront.deletePathnames(pathnames);
    return;
  }

  if (isBlobStorageEnabled()) {
    const { del } = await getBlobSdk();
    await withBlobRetry(() => del(pathnames));
    return;
  }

  for (const pathname of pathnames) {
    const filePath = toLocalPath(pathname);
    if (fs.existsSync(filePath)) {
      await fsp.rm(filePath, { force: true });
    }
  }
}

async function deletePrefix(prefix) {
  if (isS3StorageEnabled()) {
    await s3CloudFront.deletePrefix(prefix);
    return;
  }

  if (isBlobStorageEnabled()) {
    const pathnames = await listPathnames(prefix);
    await deletePathnames(pathnames);
    return;
  }

  const filePath = toLocalPath(prefix);
  if (fs.existsSync(filePath)) {
    await fsp.rm(filePath, { recursive: true, force: true });
  }
}

module.exports = {
  isS3StorageEnabled,
  isBlobStorageEnabled,
  readJson,
  writeJson,
  writeBuffer,
  readBuffer,
  exists,
  listPathnames,
  deletePathnames,
  deletePrefix,
  createSignedUrl: s3CloudFront.createSignedUrl,
  isCloudFrontSigningEnabled: s3CloudFront.isCloudFrontSigningEnabled
};
