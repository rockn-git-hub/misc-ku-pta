/**
 * Backfill existing documents so page images can be served directly from public Blob URLs.
 *
 * Usage:
 * node scripts/backfill-public-page-urls.mjs --docId=doc-xxxx
 * node scripts/backfill-public-page-urls.mjs --all
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const documentsStoreModule = require("../lib/documents-store.cjs");
const storageModule = require("../lib/storage.cjs");

const { getDocumentById, backfillDocumentPublicPageUrls } = documentsStoreModule.default || documentsStoreModule;
const storage = storageModule.default || storageModule;

/**
 * Parse command line arguments.
 * @returns {{docId: string, all: boolean}}
 */
function parseArgs() {
  const result = {
    docId: "",
    all: false
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--all") {
      result.all = true;
      continue;
    }

    const [key, value] = arg.split("=");
    if (key === "--docId") {
      result.docId = value || "";
    }
  }

  if (!result.all && !result.docId) {
    throw new Error("--docId=... または --all を指定してください。");
  }

  return result;
}

/**
 * Read index and return document ids.
 * @returns {Promise<string[]>}
 */
async function readDocumentIds() {
  const index = await storage.readJson("documents/index.json", { documents: [] });
  return index.documents.map((doc) => doc.id);
}

async function main() {
  const args = parseArgs();
  const docIds = args.all ? await readDocumentIds() : [args.docId];

  for (const docId of docIds) {
    const result = await backfillDocumentPublicPageUrls(docId);
    console.log(JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
