const documentsStoreModule = require("../lib/documents-store.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { getPublicDocumentSummaries } = documentsStoreModule.default || documentsStoreModule;
const { handleBlobStoreUnavailable, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "GET only" }, { Allow: "GET" });
    return;
  }

  try {
    sendJson(res, 200, {
      ok: true,
      documents: await getPublicDocumentSummaries()
    });
  } catch (error) {
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }
};
