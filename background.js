// ツールバーアイコンをクリックしたらビューアーページを開く
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
});

// file:// で開いた Markdown を拡張ページ(viewer.html)へリダイレクトする。
// Chrome は file:// ページの favicon を表示しない仕様のため、content.js で
// その場に描画するとタブアイコンが既定のドキュメントアイコンのままになる。
// 拡張ページ(chrome-extension://)で開けば、タブに拡張機能のアイコンが表示される。
const MD_RE = /\.(md|markdown|mdown|mkd)$/i;

function redirectIfMarkdown(details) {
  if (details.frameId !== 0) return; // トップフレームのみ
  const url = details.url || "";
  // file://<host>/... のホスト部を取り出す。ホスト付き（WSL の wsl.localhost 等）は
  // 拡張ページからの fetch が Chrome に弾かれるため、リダイレクトせず
  // content.js のその場描画に任せる（確実に開ける。タブアイコンは既定のまま）。
  const m = /^file:\/\/([^/]*)\//i.exec(url);
  if (!m || m[1]) return; // マッチしない or ホスト付きは対象外
  const path = url.split(/[?#]/)[0]; // クエリ/ハッシュを除いた末尾で判定
  if (!MD_RE.test(path)) return;
  const target = chrome.runtime.getURL("viewer.html") + "?file=" + encodeURIComponent(url);
  chrome.tabs.update(details.tabId, { url: target });
}

if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener(
    redirectIfMarkdown,
    { url: [{ schemes: ["file"] }] }
  );
}
