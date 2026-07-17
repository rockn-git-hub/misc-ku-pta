/**
 * Shared document utilities for both admin and viewer flows.
 */

function buildViewerPath(docId) {
  return `/viewer.html?doc=${encodeURIComponent(docId)}`;
}

function getAvailability(doc, now = new Date()) {
  if (doc.deletedAt) {
    return { status: "deleted", label: "削除済み" };
  }

  if (doc.manualVisibility === "private") {
    return { status: "hidden", label: "非公開" };
  }

  if (doc.ready === false) {
    return { status: "draft", label: "登録中" };
  }

  const start = new Date(doc.startAt);
  const end = new Date(doc.endAt);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return { status: "invalid", label: "公開設定エラー" };
  }
  if (now < start) {
    return { status: "scheduled", label: "公開前" };
  }
  if (now > end) {
    return { status: "closed", label: "公開終了" };
  }
  return { status: "live", label: "公開中" };
}

function isDocumentLive(doc, now = new Date()) {
  return getAvailability(doc, now).status === "live";
}

module.exports = {
  buildViewerPath,
  getAvailability,
  isDocumentLive
};
