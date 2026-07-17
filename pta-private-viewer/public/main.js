const listElement = document.getElementById("document-list");

/**
 * HTMLに埋め込む文字列を安全な形に整えます。
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 日付を日本向けの表示文字列に変換します。
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "日時未設定";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/**
 * 公開資料1件分の表示HTMLを組み立てます。
 * @param {{
 *   title?: string,
 *   description?: string,
 *   status: string,
 *   statusLabel: string,
 *   startAt: string,
 *   endAt: string,
 *   pageCount: number,
 *   viewerUrl: string
 * }} doc
 * @returns {string}
 */
function renderRow(doc) {
  const description = escapeHtml(doc.description || "説明はありません。");
  return `
    <article class="public-doc-row">
      <div class="public-doc-main">
        <div class="public-doc-head">
          <span class="status-pill ${escapeHtml(doc.status)}">${escapeHtml(doc.statusLabel)}</span>
          <h3>${escapeHtml(doc.title || "名称未設定の資料")}</h3>
        </div>
        <p class="public-doc-description">${description}</p>
        <div class="public-doc-meta">
          <span>公開期間: ${formatDate(doc.startAt)} - ${formatDate(doc.endAt)}</span>
          <span>${escapeHtml(doc.pageCount)}ページ</span>
        </div>
      </div>
      <div class="public-doc-actions">
        <a class="card-link" href="${escapeHtml(doc.viewerUrl)}">資料を開く</a>
      </div>
    </article>
  `;
}

/**
 * 公開資料一覧を取得して画面に表示します。
 * @returns {Promise<void>}
 */
async function loadDocuments() {
  listElement.innerHTML = "<p>公開資料を読み込み中です。</p>";

  try {
    const response = await fetch("/api/public-docs");
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "一覧の取得に失敗しました。");
    }

    if (!payload.documents.length) {
      listElement.innerHTML = "<p>現在公開中の資料はありません。</p>";
      return;
    }

    listElement.innerHTML = payload.documents.map(renderRow).join("");
  } catch (error) {
    listElement.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

loadDocuments();
