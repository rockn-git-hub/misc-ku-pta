const titleElement = document.getElementById("viewer-title");
const gatePanel = document.getElementById("gate-panel");
const viewerPanel = document.getElementById("viewer-panel");
const pinForm = document.getElementById("pin-form");
const pinInput = document.getElementById("pin-input");
const gateMessage = document.getElementById("gate-message");
const pageIndicator = document.getElementById("page-indicator");
const pageImage = document.getElementById("page-image");
const prevButton = document.getElementById("prev-button");
const nextButton = document.getElementById("next-button");
const logoutButton = document.getElementById("logout-button");
const swipeSurface = document.getElementById("swipe-surface");
const endAtElement = document.getElementById("viewer-end-at");
const sessionExpiryElement = document.getElementById("viewer-session-expiry");

const params = new URLSearchParams(window.location.search);
const docId = params.get("doc");

let manifest = null;
let currentIndex = 0;
let touchStartX = 0;
let renderSequence = 0;
const pageUrlCache = new Map();
const failedPageRetries = new Set();

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
 * PIN入力画面のメッセージを更新します。
 * @param {string} message
 */
function setGateMessage(message) {
  gateMessage.textContent = message;
}

/**
 * キャッシュ済みの画像URLがまだ使えるか確認して返します。
 * 失効直前のURLは使わずに取り直します。
 * @param {{ pageNumber: number }} page
 * @returns {string | null}
 */
function getCachedImageUrl(page) {
  const cached = pageUrlCache.get(page.pageNumber);
  if (!cached) {
    return null;
  }

  if (!cached.expiresAt) {
    return cached.imageUrl;
  }

  const expiresAt = new Date(cached.expiresAt);
  if (Number.isNaN(expiresAt.valueOf())) {
    return cached.imageUrl;
  }

  if (expiresAt.getTime() - Date.now() <= 30 * 1000) {
    pageUrlCache.delete(page.pageNumber);
    return null;
  }

  return cached.imageUrl;
}

/**
 * 現在のページ画像に使うURLを解決します。
 * CloudFront signed URL を使う場合は API から都度取得します。
 * @param {{ pageNumber: number, imageUrl?: string | null, imageUrlEndpoint?: string }} page
 * @returns {Promise<string>}
 */
async function resolveImageUrl(page) {
  if (page.imageUrl) {
    return page.imageUrl;
  }

  const cachedImageUrl = getCachedImageUrl(page);
  if (cachedImageUrl) {
    return cachedImageUrl;
  }

  const response = await fetch(page.imageUrlEndpoint, {
    credentials: "same-origin"
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (response.status === 401) {
    manifest = null;
    titleElement.textContent = "PINコードを入力";
    viewerPanel.hidden = true;
    gatePanel.hidden = false;
    setGateMessage(payload.message || "PINコードの入力が必要です。");
    window.setTimeout(() => pinInput.focus(), 0);
    throw new Error(payload.message || "PINコードの入力が必要です。");
  }

  if (!response.ok || payload.ok === false || !payload.imageUrl) {
    throw new Error(payload.message || "ページ画像の取得に失敗しました。");
  }

  pageUrlCache.set(page.pageNumber, {
    imageUrl: payload.imageUrl,
    expiresAt: payload.expiresAt || null
  });

  return payload.imageUrl;
}

/**
 * 現在のページ画像を描画します。
 * @returns {Promise<void>}
 */
async function renderCurrentPage() {
  if (!manifest || !manifest.pages[currentIndex]) {
    return;
  }

  const renderId = ++renderSequence;
  const page = manifest.pages[currentIndex];
  pageIndicator.textContent = `${currentIndex + 1}/${manifest.pages.length}ページ`;
  pageImage.alt = `${manifest.title} ${currentIndex + 1}ページ`;
  pageImage.dataset.pageNumber = String(page.pageNumber);
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === manifest.pages.length - 1;

  try {
    const imageUrl = await resolveImageUrl(page);
    if (renderId !== renderSequence) {
      return;
    }
    pageImage.src = imageUrl;
  } catch (error) {
    if (renderId !== renderSequence) {
      return;
    }
    pageImage.removeAttribute("src");
    pageIndicator.textContent = error.message;
  }
}

/**
 * PIN認証済みの資料画面を表示します。
 * @param {{
 *   title: string,
 *   endAt: string,
 *   expiresAt: string,
 *   pages: Array<{ pageNumber: number, imageUrl?: string | null, imageUrlEndpoint?: string }>
 * }} documentManifest
 */
function showViewer(documentManifest) {
  manifest = documentManifest;
  currentIndex = 0;
  renderSequence = 0;
  pageUrlCache.clear();
  failedPageRetries.clear();
  titleElement.textContent = manifest.title;
  setGateMessage("");
  endAtElement.textContent = `公開終了: ${formatDate(manifest.endAt)}`;
  sessionExpiryElement.textContent = `セッション期限: ${formatDate(manifest.expiresAt)}`;
  gatePanel.hidden = true;
  viewerPanel.hidden = false;
  void renderCurrentPage();
}

/**
 * PIN入力画面を表示します。
 */
function showGate() {
  viewerPanel.hidden = true;
  gatePanel.hidden = false;
  window.setTimeout(() => pinInput.focus(), 0);
}

/**
 * 資料情報を読み込みます。
 * @returns {Promise<void>}
 */
async function loadManifest() {
  if (!docId) {
    titleElement.textContent = "資料IDがありません";
    gatePanel.hidden = true;
    viewerPanel.hidden = true;
    return;
  }

  try {
    const response = await fetch(`/api/document?doc=${encodeURIComponent(docId)}`, {
      credentials: "same-origin"
    });
    const payload = await response.json();

    if (response.status === 401) {
      titleElement.textContent = "PINコードを入力";
      setGateMessage("");
      showGate();
      return;
    }

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "資料の読み込みに失敗しました。");
    }

    showViewer(payload.document);
  } catch (error) {
    titleElement.textContent = error.message;
    gatePanel.hidden = true;
    viewerPanel.hidden = true;
  }
}

/**
 * PIN を送信して閲覧セッションを開始します。
 * @param {SubmitEvent} event
 * @returns {Promise<void>}
 */
async function handlePinSubmit(event) {
  event.preventDefault();

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        docId,
        pin: pinInput.value
      })
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "PINコードの認証に失敗しました。");
    }

    pinInput.value = "";
    setGateMessage("");
    await loadManifest();
  } catch (error) {
    setGateMessage(error.message);
  }
}

/**
 * 次または前のページへ移動します。
 * @param {number} direction
 */
function movePage(direction) {
  if (!manifest) {
    return;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= manifest.pages.length) {
    return;
  }

  currentIndex = nextIndex;
  void renderCurrentPage();
}

/**
 * 閲覧を終了して PIN 入力画面に戻します。
 * @returns {Promise<void>}
 */
async function logout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } finally {
    manifest = null;
    pageUrlCache.clear();
    failedPageRetries.clear();
    pageImage.removeAttribute("src");
    titleElement.textContent = "PINコードを入力";
    endAtElement.textContent = "";
    sessionExpiryElement.textContent = "";
    setGateMessage("閲覧を終了しました。再度開くにはPINコードを入力してください。");
    showGate();
  }
}

pinForm.addEventListener("submit", handlePinSubmit);
prevButton.addEventListener("click", () => movePage(-1));
nextButton.addEventListener("click", () => movePage(1));
logoutButton.addEventListener("click", logout);

pageImage.addEventListener("error", async () => {
  if (!manifest) {
    return;
  }

  const page = manifest.pages[currentIndex];
  if (!page || failedPageRetries.has(page.pageNumber)) {
    pageIndicator.textContent = "ページ画像の表示に失敗しました。";
    return;
  }

  failedPageRetries.add(page.pageNumber);
  pageUrlCache.delete(page.pageNumber);

  try {
    const refreshedUrl = await resolveImageUrl(page);
    pageImage.src = refreshedUrl;
  } catch {
    pageIndicator.textContent = "ページ画像の表示に失敗しました。";
  }
});

swipeSurface.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
});

swipeSurface.addEventListener("touchend", (event) => {
  const deltaX = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(deltaX) < 40) {
    return;
  }
  movePage(deltaX < 0 ? 1 : -1);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    movePage(1);
  } else if (event.key === "ArrowLeft") {
    movePage(-1);
  }
});

loadManifest();
