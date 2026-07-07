/*
 * mermaid-run.js — ページ(MAINワールド)側で mermaid を初期化し pre.mermaid を描画する。
 * content.js が mermaid.min.js に続けてこのファイルを注入する。
 *
 * mermaid.run() は対象要素内で HTML ラベルの寸法を計測するため、ズーム用の
 * transform が掛かったビューポート内では計測に失敗することがある。
 * そのため body 直下で計測する mermaid.render() を使い、結果の SVG を差し込む。
 * 描画結果（総数・成功数・エラー）は mdv-mermaid-done イベントの detail で通知する。
 */
(function () {
  "use strict";
  var nodes = Array.prototype.slice.call(
    document.querySelectorAll("pre.mermaid:not([data-processed])")
  );
  var total = nodes.length;
  var processed = 0;
  var firstError = null;

  function done() {
    try {
      document.dispatchEvent(new CustomEvent("mdv-mermaid-done", {
        detail: { total: total, processed: processed, error: firstError }
      }));
    } catch (e) {}
  }

  if (typeof window.mermaid === "undefined") {
    firstError = "mermaid ライブラリ未読込";
    done();
    return;
  }
  if (!total) { done(); return; }

  try {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "default",
      flowchart: { htmlLabels: true, useMaxWidth: false }
    });
  } catch (e) {
    firstError = String((e && e.message) || e);
    done();
    return;
  }

  if (!window.__mdvMermaidSeq) window.__mdvMermaidSeq = 0;

  function renderOne(el) {
    var id = "mdv-mmd-" + (window.__mdvMermaidSeq++);
    var code = el.textContent;
    return window.mermaid.render(id, code).then(function (res) {
      el.innerHTML = res.svg;
      el.setAttribute("data-processed", "true");
      if (res.bindFunctions) res.bindFunctions(el);
      processed++;
    }).catch(function (err) {
      // 失敗した図はソースコードのまま残す（content.js がバナーで通知する）
      if (!firstError) firstError = String((err && err.message) || err).split("\n")[0];
    });
  }

  nodes.reduce(function (p, el) {
    return p.then(function () { return renderOne(el); });
  }, Promise.resolve()).then(done, function (err) {
    if (!firstError) firstError = String((err && err.message) || err);
    done();
  });
})();
