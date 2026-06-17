/**
 * S3 storage and CloudFront signed URL helpers.
 * This module keeps the existing logical pathname contract and maps it to:
 * - tmp/* for JSON metadata
 * - images/* for page images
 * - pdf/* for PDF files
 */
const {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/cloudfront-signer");

let cachedClient = null;

/**
 * Return true when the app should use S3 instead of Blob/local storage.
 * @returns {boolean}
 */
function isS3StorageEnabled() {
  return Boolean(process.env.S3_BUCKET_NAME);
}

/**
 * Return true when CloudFront signed URL generation is available.
 * @returns {boolean}
 */
function isCloudFrontSigningEnabled() {
  return Boolean(
    process.env.CLOUDFRONT_DOMAIN
    && process.env.CLOUDFRONT_KEY_PAIR_ID
    && process.env.CLOUDFRONT_PRIVATE_KEY
  );
}

/**
 * Create a shared S3 client.
 * Region is resolved from the standard AWS environment variables.
 * @returns {S3Client}
 */
function getS3Client() {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
    });
  }
  return cachedClient;
}

/**
 * Return the configured S3 bucket name.
 * @returns {string}
 */
function getBucketName() {
  return process.env.S3_BUCKET_NAME;
}

/**
 * Normalize a pathname that may already contain a storage prefix.
 * @param {string} pathname
 * @returns {string}
 */
function normalizeLogicalPathname(pathname) {
  return String(pathname || "").replace(/^\/+/, "");
}

/**
 * Decide which S3 prefix should be used for the logical pathname.
 * @param {string} pathname
 * @param {string | null} [contentType]
 * @returns {"tmp" | "images" | "pdf"}
 */
function resolveStoragePrefix(pathname, contentType = null) {
  const normalizedPathname = normalizeLogicalPathname(pathname);
  const lowerPathname = normalizedPathname.toLowerCase();
  const lowerContentType = String(contentType || "").toLowerCase();

  if (
    normalizedPathname.startsWith("tmp/")
    || normalizedPathname.endsWith(".json")
    || lowerContentType.includes("application/json")
  ) {
    return "tmp";
  }

  if (normalizedPathname.startsWith("pdf/") || lowerPathname.endsWith(".pdf") || lowerContentType === "application/pdf") {
    return "pdf";
  }

  return "images";
}

/**
 * Convert the logical pathname used by the app into the physical S3 object key.
 * @param {string} pathname
 * @param {string | null} [contentType]
 * @returns {string}
 */
function toS3Key(pathname, contentType = null) {
  const normalizedPathname = normalizeLogicalPathname(pathname);
  const prefix = resolveStoragePrefix(normalizedPathname, contentType);

  if (normalizedPathname.startsWith(`${prefix}/`)) {
    return normalizedPathname;
  }

  return `${prefix}/${normalizedPathname}`;
}

/**
 * Convert a physical S3 key back to the logical pathname used by the app.
 * @param {string} key
 * @returns {string}
 */
function fromS3Key(key) {
  const normalizedKey = String(key || "");
  if (normalizedKey.startsWith("tmp/")) {
    return normalizedKey.slice(4);
  }
  if (normalizedKey.startsWith("images/")) {
    return normalizedKey.slice(7);
  }
  if (normalizedKey.startsWith("pdf/")) {
    return normalizedKey.slice(4);
  }
  return normalizedKey;
}

/**
 * Convert an S3 object body into a Node.js Buffer.
 * @param {any} body
 * @returns {Promise<Buffer>}
 */
async function readBodyAsBuffer(body) {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  if (typeof body.transformToString === "function") {
    return Buffer.from(await body.transformToString(), "utf8");
  }
  return Buffer.from(await new Response(body).arrayBuffer());
}

/**
 * Return true when the AWS SDK error means the object does not exist.
 * @param {any} error
 * @returns {boolean}
 */
function isNotFoundError(error) {
  return error?.name === "NoSuchKey"
    || error?.name === "NotFound"
    || error?.$metadata?.httpStatusCode === 404;
}

/**
 * Normalize an ETag value for comparison.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function normalizeEtag(value) {
  if (!value) {
    return null;
  }
  return String(value).trim();
}

/**
 * Return the signed URL lifetime in seconds.
 * @returns {number}
 */
function getSignedUrlExpireSeconds() {
  const rawValue = Number.parseInt(String(process.env.SIGNED_URL_EXPIRE_SECONDS || ""), 10);
  if (Number.isInteger(rawValue) && rawValue > 0) {
    return rawValue;
  }
  return 600;
}

/**
 * Build a CloudFront URL for the given S3 object key.
 * Each path segment is encoded individually so spaces and Japanese names remain safe.
 * @param {string} key
 * @returns {string}
 */
function buildCloudFrontUrl(key) {
  const domain = String(process.env.CLOUDFRONT_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const encodedPath = String(key)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://${domain}/${encodedPath}`;
}

/**
 * Normalize the CloudFront private key loaded from the environment.
 * @returns {string}
 */
function getCloudFrontPrivateKey() {
  return String(process.env.CLOUDFRONT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

/**
 * Read a JSON file from S3 using the app's logical pathname.
 * @param {string} pathname
 * @param {unknown} [fallback]
 * @returns {Promise<unknown>}
 */
async function readJson(pathname, fallback = null) {
  const client = getS3Client();
  const key = toS3Key(pathname, "application/json");

  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key
    }));
    const buffer = await readBodyAsBuffer(response.Body);
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    if (isNotFoundError(error)) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Write JSON metadata into the tmp/ prefix on S3.
 * @param {string} pathname
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function writeJson(pathname, value) {
  const client = getS3Client();
  const key = toS3Key(pathname, "application/json");
  const text = `${JSON.stringify(value, null, 2)}\n`;

  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: text,
    ContentType: "application/json; charset=utf-8"
  }));
}

/**
 * Write a binary asset into the correct S3 prefix.
 * @param {string} pathname
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<{ pathname: string, url: string | null, downloadUrl: string | null, contentType: string }>}
 */
async function writeBuffer(pathname, buffer, contentType) {
  const client = getS3Client();
  const key = toS3Key(pathname, contentType);

  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));

  return {
    pathname,
    url: null,
    downloadUrl: null,
    contentType
  };
}

/**
 * Read a binary asset from S3 using the app's logical pathname.
 * @param {string} pathname
 * @param {{ ifNoneMatch?: string }} [options]
 * @returns {Promise<{ statusCode: number, buffer?: Buffer, contentType: string | null, etag: string | null } | null>}
 */
async function readBuffer(pathname, options = {}) {
  const client = getS3Client();
  const key = toS3Key(pathname);
  const ifNoneMatch = normalizeEtag(options.ifNoneMatch);

  try {
    const headResponse = await client.send(new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: key
    }));
    const etag = normalizeEtag(headResponse.ETag);

    if (ifNoneMatch && etag && ifNoneMatch === etag) {
      return {
        statusCode: 304,
        etag,
        contentType: headResponse.ContentType || null
      };
    }

    const getResponse = await client.send(new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key
    }));
    const buffer = await readBodyAsBuffer(getResponse.Body);
    return {
      statusCode: 200,
      buffer,
      contentType: getResponse.ContentType || headResponse.ContentType || null,
      etag
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Return true when the logical pathname exists on S3.
 * @param {string} pathname
 * @returns {Promise<boolean>}
 */
async function exists(pathname) {
  const client = getS3Client();
  const key = toS3Key(pathname);

  try {
    await client.send(new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: key
    }));
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * List logical pathnames under the given logical prefix.
 * Metadata is the main caller, but the implementation also handles image/pdf keys.
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
async function listPathnames(prefix) {
  const client = getS3Client();
  const physicalPrefixes = [
    toS3Key(prefix, "application/json"),
    toS3Key(prefix, "image/webp"),
    toS3Key(prefix, "application/pdf")
  ];
  const pathnames = new Set();

  for (const physicalPrefix of physicalPrefixes) {
    let continuationToken;

    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: getBucketName(),
        Prefix: physicalPrefix,
        ContinuationToken: continuationToken
      }));

      for (const item of response.Contents || []) {
        if (item.Key) {
          pathnames.add(fromS3Key(item.Key));
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  return [...pathnames].sort();
}

/**
 * Delete the provided logical pathnames from S3.
 * @param {string[]} pathnames
 * @returns {Promise<void>}
 */
async function deletePathnames(pathnames) {
  if (!Array.isArray(pathnames) || pathnames.length === 0) {
    return;
  }

  const client = getS3Client();
  const keys = [...new Set(pathnames.map((pathname) => toS3Key(pathname)).filter(Boolean))];

  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: getBucketName(),
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
        Quiet: true
      }
    }));
  }
}

/**
 * Delete every logical file under the provided logical prefix.
 * This removes metadata under tmp/ and assets under images/ and pdf/.
 * @param {string} prefix
 * @returns {Promise<void>}
 */
async function deletePrefix(prefix) {
  const client = getS3Client();
  const physicalPrefixes = [
    toS3Key(prefix, "application/json"),
    toS3Key(prefix, "image/webp"),
    toS3Key(prefix, "application/pdf")
  ];
  const keys = [];

  for (const physicalPrefix of physicalPrefixes) {
    let continuationToken;

    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: getBucketName(),
        Prefix: physicalPrefix,
        ContinuationToken: continuationToken
      }));

      for (const item of response.Contents || []) {
        if (item.Key) {
          keys.push(item.Key);
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  if (keys.length === 0) {
    return;
  }

  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: getBucketName(),
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
        Quiet: true
      }
    }));
  }
}

/**
 * Create a CloudFront signed URL for the logical pathname.
 * Returns null when CloudFront signing is not configured or when the pathname is not a public asset.
 * @param {string} pathname
 * @param {{ expiresInSeconds?: number }} [options]
 * @returns {{ url: string, expiresAt: string } | null}
 */
function createSignedUrl(pathname, options = {}) {
  if (!isS3StorageEnabled() || !isCloudFrontSigningEnabled()) {
    return null;
  }

  const key = toS3Key(pathname);
  if (!(key.startsWith("images/") || key.startsWith("pdf/"))) {
    return null;
  }

  const expiresInSeconds = Number.isInteger(options.expiresInSeconds) && options.expiresInSeconds > 0
    ? options.expiresInSeconds
    : getSignedUrlExpireSeconds();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const unsignedUrl = buildCloudFrontUrl(key);

  return {
    url: getSignedUrl({
      url: unsignedUrl,
      keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
      privateKey: getCloudFrontPrivateKey(),
      dateLessThan: expiresAt.toISOString()
    }),
    expiresAt: expiresAt.toISOString()
  };
}

module.exports = {
  isS3StorageEnabled,
  isCloudFrontSigningEnabled,
  readJson,
  writeJson,
  writeBuffer,
  readBuffer,
  exists,
  listPathnames,
  deletePathnames,
  deletePrefix,
  createSignedUrl
};
