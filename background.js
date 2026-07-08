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
