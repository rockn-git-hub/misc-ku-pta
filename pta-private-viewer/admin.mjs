import * as pdfjsLib from "/vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";

const CANCEL_MESSAGE = "登録をキャンセルしました。";

const adminStatus = document.getElementById("admin-status");
const loginPanel = document.getElementById("admin-login-panel");
const appPanel = document.getElementById("admin-app-panel");
const loginForm = document.getElementById("admin-login-form");
const adminPasswordInput = document.getElementById("admin-password");
const logoutButton = document.getElementById("admin-logout-button");
const registerForm = document.getElementById("register-form");
const pdfFileInput = document.getElementById("pdf-file");
const titleInput = document.getElementById("doc-title");
const descriptionInput = document.getElementById("doc-description");
const startAtInput = document.getElementById("start-at");
const endAtInput = document.getElementById("end-at");
const registerButton = document.getElementById("register-button");
const uploadProgressPanel = document.getElementById("upload-progress-panel");
const uploadProgressText = document.getElementById("upload-progress-text");
const uploadProgressBar = document.getElementById("upload-progress-bar");
const cancelRegisterButton = document.getElementById("cancel-register-button");
const resultPanel = document.getElementById("result-panel");
const resultUrl = document.getElementById("result-url");
const resultPin = document.getElementById("result-pin");
const resultQr = document.getElementById("result-qr");
const copyUrlButton = document.getElementById("copy-url-button");
const adminDocList = document.getElementById("admin-doc-list");

let latestIssuedUrl = "";
let activeDocId = "";
let isRegistering = false;
let cancelRequested = false;
let currentLoadingTask = null;
let currentRenderTask = null;
let currentUploadController = null;

/**
 * 画面上部のステータスメッセージを表示します。
 * @param {string} message
 * @param {"info" | "success" | "error"} [variant]
 */
function setStatus(message, variant = "info") {
  adminStatus.textContent = message;
  adminStatus.className = `panel status-box ${variant === "info" ? "" : variant}`.trim();
}

/**
 * HTMLに埋め込む文字列を安全に整形します。
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
 * 日時を日本向けの表示文字列に変換します。
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
 * datetime-local の初期値文字列を作ります。
 * @param {Date} date
 * @returns {string}
 */
function formatLocalInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * 登録処理中かどうかに応じて入力状態を切り替えます。
 * @param {boolean} busy
 */
function setRegisteringState(busy) {
  isRegistering = busy;
  registerButton.disabled = busy;
  pdfFileInput.disabled = busy;
  titleInput.disabled = busy;
  descriptionInput.disabled = busy;
  startAtInput.disabled = busy;
  endAtInput.disabled = busy;
  cancelRegisterButton.disabled = !busy;
}

/**
 * 発行結果を表示します。
 * @param {string} viewerUrl
 * @param {string} pin
 * @param {string} qrDataUrl
 */
function showResult(viewerUrl, pin, qrDataUrl) {
  latestIssuedUrl = viewerUrl;
  resultUrl.textContent = viewerUrl;
  resultPin.textContent = pin;
  resultQr.src = qrDataUrl;
  resultQr.alt = "閲覧用QRコード";
  resultPanel.hidden = false;
}

/**
 * 発行結果の表示を隠します。
 */
function hideResult() {
  latestIssuedUrl = "";
  resultPanel.hidden = true;
}

/**
 * 登録済み資料1件分の行を描画します。
 * @param {{
 *   id: string,
 *   title?: string,
 *   description?: string,
 *   status: string,
 *   statusLabel: string,
 *   startAt: string,
 *   endAt: string,
 *   pageCount: number,
 *   pin?: string | null,
 *   sourceFileName?: string,
 *   viewerUrl: string,
 *   manualVisibility?: string
 * }} doc
 * @returns {string}
 */
function renderAdminDocRow(doc) {
  const pinLabel = doc.pin
    ? `<span class="doc-pin">${escapeHtml(doc.pin)}</span>`
    : "<span class=\"doc-pin\">PIN不明</span>";
  const visibilityAction = doc.manualVisibility === "private" ? "公開に戻す" : "非公開にする";
  const visibilityValue = doc.manualVisibility === "private" ? "public" : "private";

  return `
    <article class="doc-row">
      <div class="doc-row-main">
        <div class="doc-row-head">
          <span class="status-pill ${escapeHtml(doc.status)}">${escapeHtml(doc.statusLabel)}</span>
          <h3>${escapeHtml(doc.title || "名称未設定の資料")}</h3>
        </div>
        <p class="doc-row-description">${escapeHtml(doc.description || "説明はありません。")}</p>
        <div class="doc-row-meta">
          <span>公開期間: ${formatDate(doc.startAt)} - ${formatDate(doc.endAt)}</span>
          <span>${escapeHtml(doc.pageCount)}ページ</span>
          <span>PIN: ${pinLabel}</span>
          ${doc.sourceFileName ? `<span>元ファイル: ${escapeHtml(doc.sourceFileName)}</span>` : ""}
        </div>
      </div>
      <div class="doc-row-actions">
        <a class="card-link" href="${escapeHtml(doc.viewerUrl)}" target="_blank" rel="noreferrer">閲覧画面を開く</a>
        <button class="ghost-button" type="button" data-action="toggle-visibility" data-doc-id="${escapeHtml(doc.id)}" data-visibility="${escapeHtml(visibilityValue)}">${visibilityAction}</button>
        <button class="ghost-button" type="button" data-action="reissue-pin" data-doc-id="${escapeHtml(doc.id)}">PINを再発行</button>
        <button class="ghost-button danger-button" type="button" data-action="delete-document" data-doc-id="${escapeHtml(doc.id)}">削除する</button>
      </div>
    </article>
  `;
}

/**
 * JSON APIを呼び出し、失敗時は例外に変換します。
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "通信に失敗しました。");
  }

  return payload;
}

/**
 * 管理画面の表示状態を切り替えます。
 * @param {boolean} authenticated
 */
function showAdminState(authenticated) {
  loginPanel.hidden = authenticated;
  appPanel.hidden = !authenticated;
}

/**
 * 登録済み資料一覧を読み込みます。
 * @returns {Promise<void>}
 */
async function loadAdminDocuments() {
  try {
    const payload = await requestJson("/api/admin-docs");
    if (!payload.documents.length) {
      adminDocList.innerHTML = "<p>まだ登録済みの資料はありません。</p>";
      return;
    }
    adminDocList.innerHTML = payload.documents.map(renderAdminDocRow).join("");
  } catch (error) {
    adminDocList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

/**
 * 既存の管理者セッションを確認します。
 * @returns {Promise<void>}
 */
async function checkAdminSession() {
  try {
    const payload = await requestJson("/api/admin-session");
    showAdminState(payload.authenticated);
    if (payload.authenticated) {
      setStatus("管理者ログイン済みです。PDFを登録できます。", "success");
      await loadAdminDocuments();
    } else {
      setStatus("管理者パスワードを入力してください。");
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

/**
 * 管理者ログインを実行します。
 * @param {SubmitEvent} event
 * @returns {Promise<void>}
 */
async function handleLogin(event) {
  event.preventDefault();

  try {
    await requestJson("/api/admin-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPasswordInput.value })
    });
    adminPasswordInput.value = "";
    showAdminState(true);
    setStatus("ログインしました。PDFを登録できます。", "success");
    await loadAdminDocuments();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

/**
 * 管理者ログアウトを実行します。
 * @returns {Promise<void>}
 */
async function handleLogout() {
  try {
    await requestJson("/api/admin-session", { method: "DELETE" });
    showAdminState(false);
    adminDocList.innerHTML = "";
    setStatus("ログアウトしました。");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

/**
 * 選択したPDFのファイル名でタイトルを上書きします。
 */
function populateTitleFromFile() {
  const file = pdfFileInput.files?.[0];
  if (!file) {
    return;
  }
  titleInput.value = file.name.replace(/\.pdf$/i, "");
}

/**
 * PDFページをWebP画像に変換します。
 * @param {import("/vendor/pdf.min.mjs").PDFPageProxy} page
 * @returns {Promise<Blob>}
 */
async function renderPageToWebp(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(1.6, 1440 / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  currentRenderTask = page.render({
    canvasContext: context,
    viewport
  });

  try {
    await currentRenderTask.promise;
  } catch (error) {
    if (cancelRequested || error?.name === "RenderingCancelledException") {
      throw new Error(CANCEL_MESSAGE);
    }
    throw error;
  } finally {
    currentRenderTask = null;
  }

  if (cancelRequested) {
    throw new Error(CANCEL_MESSAGE);
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("ページ画像の変換に失敗しました。"));
        return;
      }
      resolve(result);
    }, "image/webp", 0.82);
  });

  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

/**
 * 進捗表示を更新します。
 * @param {number} completed
 * @param {number} total
 */
function updateProgress(completed, total) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  uploadProgressPanel.hidden = false;
  uploadProgressText.textContent = total > 0 ? `${completed} / ${total} ページ完了` : "準備中です。";
  uploadProgressBar.style.width = `${percentage}%`;
}

/**
 * キャンセルされたドラフト資料を削除します。
 * @param {string} docId
 * @returns {Promise<void>}
 */
async function cleanupCancelledDraft(docId) {
  if (!docId) {
    return;
  }

  try {
    await requestJson("/api/admin-delete-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId })
    });
  } catch {
    // キャンセル後の片付け失敗は本体のエラーを上書きしない。
  }
}

/**
 * 現在進行中の登録をキャンセルします。
 */
function requestCancelRegistration() {
  if (!isRegistering) {
    return;
  }

  cancelRequested = true;
  setStatus("キャンセルを受け付けました。現在の変換またはアップロードが終わり次第停止します。");

  if (currentUploadController) {
    currentUploadController.abort();
  }
  if (currentRenderTask && typeof currentRenderTask.cancel === "function") {
    currentRenderTask.cancel();
  }
  if (currentLoadingTask && typeof currentLoadingTask.destroy === "function") {
    Promise.resolve(currentLoadingTask.destroy()).catch(() => {});
  }
}

/**
 * PDFを登録し、URL・QR・PINを発行します。
 * @param {SubmitEvent} event
 * @returns {Promise<void>}
 */
async function handleRegister(event) {
  event.preventDefault();

  const file = pdfFileInput.files?.[0];
  if (!file) {
    setStatus("PDFファイルを選んでください。", "error");
    return;
  }

  let pdf = null;

  setRegisteringState(true);
  hideResult();
  uploadProgressPanel.hidden = false;
  updateProgress(0, 0);
  setStatus("PDFを読み込み中です。");
  cancelRequested = false;
  activeDocId = "";

  try {
    const pdfData = await file.arrayBuffer();
    currentLoadingTask = pdfjsLib.getDocument({ data: pdfData });

    try {
      pdf = await currentLoadingTask.promise;
    } catch (error) {
      if (cancelRequested) {
        throw new Error(CANCEL_MESSAGE);
      }
      throw error;
    } finally {
      currentLoadingTask = null;
    }

    if (cancelRequested) {
      throw new Error(CANCEL_MESSAGE);
    }

    const createPayload = await requestJson("/api/admin-create-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value.trim() || file.name.replace(/\.pdf$/i, ""),
        description: descriptionInput.value.trim(),
        sourceFileName: file.name,
        pageCount: pdf.numPages,
        startAt: new Date(startAtInput.value).toISOString(),
        endAt: new Date(endAtInput.value).toISOString()
      })
    });

    activeDocId = createPayload.docId;
    updateProgress(0, pdf.numPages);
    setStatus("ページ画像を作成してアップロードしています。");

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (cancelRequested) {
        throw new Error(CANCEL_MESSAGE);
      }

      const page = await pdf.getPage(pageNumber);
      const blob = await renderPageToWebp(page);

      currentUploadController = new AbortController();
      const response = await fetch(`/api/admin-upload-page?doc=${encodeURIComponent(createPayload.docId)}&page=${pageNumber}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "image/webp" },
        body: blob,
        signal: currentUploadController.signal
      }).catch((error) => {
        if (cancelRequested || error?.name === "AbortError") {
          throw new Error(CANCEL_MESSAGE);
        }
        throw error;
      });
      currentUploadController = null;

      if (!response.ok) {
        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }
        throw new Error(payload.message || `${pageNumber}ページ目のアップロードに失敗しました。`);
      }

      updateProgress(pageNumber, pdf.numPages);
    }

    if (cancelRequested) {
      throw new Error(CANCEL_MESSAGE);
    }

    setStatus("公開情報を確定しています。");
    const finalizePayload = await requestJson("/api/admin-finalize-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId: createPayload.docId })
    });

    showResult(finalizePayload.document.viewerUrl, createPayload.pin, finalizePayload.document.qrDataUrl);
    setStatus("URL、QRコード、PINを発行しました。", "success");
    activeDocId = "";
    await loadAdminDocuments();
  } catch (error) {
    if (error.message === CANCEL_MESSAGE) {
      await cleanupCancelledDraft(activeDocId);
      hideResult();
      setStatus("登録をキャンセルしました。途中までのデータは削除しました。");
      await loadAdminDocuments();
    } else {
      setStatus(error.message, "error");
    }
  } finally {
    activeDocId = "";
    currentLoadingTask = null;
    currentRenderTask = null;
    currentUploadController = null;
    cancelRequested = false;
    if (pdf && typeof pdf.destroy === "function") {
      await Promise.resolve(pdf.destroy()).catch(() => {});
    }
    setRegisteringState(false);
  }
}

/**
 * 発行済みURLをクリップボードへコピーします。
 * @returns {Promise<void>}
 */
async function copyUrl() {
  if (!latestIssuedUrl) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestIssuedUrl);
    setStatus("URLをコピーしました。", "success");
  } catch {
    setStatus("URLのコピーに失敗しました。", "error");
  }
}

/**
 * 登録済み資料の操作ボタンを処理します。
 * @param {MouseEvent} event
 * @returns {Promise<void>}
 */
async function handleDocumentAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const docId = button.dataset.docId;
  if (!action || !docId) {
    return;
  }

  button.disabled = true;

  try {
    if (action === "toggle-visibility") {
      const manualVisibility = button.dataset.visibility === "private" ? "private" : "public";
      await requestJson("/api/admin-update-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          action: "set-visibility",
          manualVisibility
        })
      });
      setStatus(manualVisibility === "private" ? "資料を非公開にしました。" : "資料を公開に戻しました。", "success");
      await loadAdminDocuments();
      return;
    }

    if (action === "reissue-pin") {
      if (!window.confirm("PINを再発行します。現在のPINでは閲覧できなくなります。よろしいですか？")) {
        return;
      }

      const payload = await requestJson("/api/admin-update-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          action: "reissue-pin"
        })
      });

      showResult(payload.document.viewerUrl, payload.pin, payload.document.qrDataUrl);
      setStatus("PINを再発行しました。", "success");
      await loadAdminDocuments();
      return;
    }

    if (action === "delete-document") {
      if (!window.confirm("この資料を削除します。元に戻せません。よろしいですか？")) {
        return;
      }

      await requestJson("/api/admin-delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId })
      });
      hideResult();
      setStatus("資料を削除しました。", "success");
      await loadAdminDocuments();
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
    }
  }
}

const defaultStart = new Date();
const defaultEnd = new Date(defaultStart.getTime() + 7 * 24 * 60 * 60 * 1000);
startAtInput.value = formatLocalInput(defaultStart);
endAtInput.value = formatLocalInput(defaultEnd);
setRegisteringState(false);

loginForm.addEventListener("submit", handleLogin);
logoutButton.addEventListener("click", handleLogout);
pdfFileInput.addEventListener("change", populateTitleFromFile);
registerForm.addEventListener("submit", handleRegister);
cancelRegisterButton.addEventListener("click", requestCancelRegistration);
copyUrlButton.addEventListener("click", copyUrl);
adminDocList.addEventListener("click", handleDocumentAction);

checkAdminSession();
