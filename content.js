/*
 * content.js — file:// で直接開いた .md ファイルを自動的にビジュアル表示へ置き換える
 * （要: 拡張機能の詳細設定で「ファイルの URL へのアクセスを許可する」を有効化）
 */
(function () {
  "use strict";

  // Chrome は .md を <pre> に生テキストで表示する。その本文を取得。
  function getRawMarkdown() {
    var pre = document.body ? document.body.querySelector("pre") : null;
    if (pre && document.body.children.length === 1) {
      return pre.textContent;
    }
    // pre が無い場合は body テキスト全体（プレーン表示のフォールバック）
    if (document.body && document.body.children.length === 0) {
      return document.body.textContent;
    }
    return null;
  }

  var raw = getRawMarkdown();
  if (raw === null || raw === undefined) return; // 通常のHTMLページでは何もしない

  // file:// ページは Chrome 仕様で favicon を表示できない。読み取り済みの本文を
  // chrome.storage 経由で拡張ページ(viewer.html)へ引き継いでリダイレクトすると、
  // 拡張ページ扱いになりタブに拡張機能のアイコンが表示される。WSL など fetch でき
  // ないファイルでも、ここで取得済みの本文を渡すため確実に開ける。
  if (location.protocol === "file:" && typeof chrome !== "undefined" &&
      chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.getURL) {
    var handoff = {};
    handoff["mdv:" + location.href] = raw;
    try {
      chrome.storage.local.set(handoff, function () {
        if (chrome.runtime.lastError) { renderInPlace(); return; }
        location.replace(chrome.runtime.getURL("viewer.html") + "?src=" + encodeURIComponent(location.href));
      });
      return; // 成功時はリダイレクト。失敗時のみコールバックでその場描画にフォールバック
    } catch (e) { /* 続けてその場描画にフォールバック */ }
  }
  renderInPlace();

  // ===== その場描画（拡張ページへ本文を渡せない場合のフォールバック） =====
  function renderInPlace() {
  // 既存の内容を消してビューアーUIを構築
  document.documentElement.innerHTML = "";
  var head = document.createElement("head");
  var body = document.createElement("body");
  document.documentElement.appendChild(head);
  document.documentElement.appendChild(body);

  var fileName = decodeURIComponent(location.pathname.split("/").pop() || "Markdown");
  document.title = fileName;

  // タブのファビコンを拡張機能アイコンに設定（既定のドキュメントアイコンを置き換え）。
  // file:// ページでは chrome-extension:// を指す favicon が無視されるため、
  // アイコンを取得して data URI に変換してから設定する。
  try {
    var favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    head.appendChild(favicon);
    fetch(chrome.runtime.getURL("icons/icon32.png"))
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
      })
      .then(function (dataUrl) { favicon.href = dataUrl; })
      .catch(function () {});
  } catch (e) {}

  var root = document.createElement("div");
  root.className = "mdv-root";
  root.innerHTML =
    '<div class="mdv-toolbar">' +
      '<span class="mdv-title"></span>' +
      '<button data-act="zoomout" title="縮小 (Ctrl + ホイール下)">−</button>' +
      '<span class="mdv-zoom-level">100%</span>' +
      '<button data-act="zoomin" title="拡大 (Ctrl + ホイール上)">＋</button>' +
      '<button data-act="reset" title="等倍">100%</button>' +
      '<button data-act="fit" title="幅に合わせる">幅合わせ</button>' +
      '<span class="mdv-sep"></span>' +
      '<button data-act="fontdown" title="文字を小さく"><span style="font-size:11px">A</span>−</button>' +
      '<span class="mdv-font-level">12px</span>' +
      '<button data-act="fontup" title="文字を大きく"><span style="font-size:15px">A</span>＋</button>' +
      '<span class="mdv-sep"></span>' +
      '<button data-act="print" title="印刷 (Ctrl + P)">🖨 印刷</button>' +
      '<span class="mdv-sep"></span>' +
      '<span class="mdv-hint">ドラッグ・↑↓←→でパン移動 / Ctrl+ホイールで拡大縮小</span>' +
    '</div>' +
    '<div class="mdv-canvas">' +
      '<div class="mdv-viewport">' +
        '<div class="mdv-page markdown-body"></div>' +
      '</div>' +
    '</div>';
  body.appendChild(root);

  var canvas = root.querySelector(".mdv-canvas");
  var viewport = root.querySelector(".mdv-viewport");
  var page = root.querySelector(".mdv-page");
  var titleEl = root.querySelector(".mdv-title");
  var zoomLabel = root.querySelector(".mdv-zoom-level");
  var fontLabel = root.querySelector(".mdv-font-level");

  titleEl.textContent = fileName;
  MdViewer.renderInto(page, raw);

  var ctrl = MdViewer.createZoomPan(canvas, viewport, {
    onChange: function (s) { zoomLabel.textContent = Math.round(s * 100) + "%"; }
  });

  // mermaid はページ(MAINワールド)側で描画する。
  // content_scripts に mermaid を同梱すると Chrome の UTF-8 検証で弾かれるため、
  // web_accessible_resources を script タグで注入して実行する。
  // 失敗時は原因をバナーで表示する（従来は無言で図が出ないままになっていた）。
  function showNotice(msg) {
    var n = root.querySelector(".mdv-notice");
    if (!n) {
      n = document.createElement("div");
      n.className = "mdv-notice";
      root.insertBefore(n, canvas);
    }
    n.textContent = msg;
  }

  var mermaidInjected = false;
  function runMermaid(after) {
    after = after || function () {};
    if (!page.querySelector("pre.mermaid")) { after(); return; }

    // 保険: 描画完了イベントが来なくても一定時間後にレイアウトを確定させる
    var timer = setTimeout(function () { after(); }, 8000);
    var cleanup = function () {
      clearTimeout(timer);
      document.removeEventListener("mdv-mermaid-done", onDone);
    };
    var onDone = function (e) {
      cleanup();
      var d = (e && e.detail) || {};
      if (d.total && d.processed < d.total) {
        showNotice("Mermaid 図を描画できませんでした（成功 " + d.processed + "/" + d.total + "）" +
          (d.error ? "： " + d.error : "。図の構文を確認してください。"));
      } else if (d.error) {
        showNotice("Mermaid 図の描画に失敗しました: " + d.error);
      }
      requestAnimationFrame(after);
    };
    document.addEventListener("mdv-mermaid-done", onDone);

    if (mermaidInjected) {
      injectRunner();
      return;
    }
    mermaidInjected = true;
    var lib = document.createElement("script");
    lib.src = chrome.runtime.getURL("mermaid.min.js");
    lib.onload = injectRunner;
    lib.onerror = function () {
      mermaidInjected = false;
      showNotice("Mermaid ライブラリを読み込めませんでした。" +
        "chrome://extensions で本拡張機能を再読み込み（更新ボタン 🔄）してから、ページを再読み込みしてください。");
      cleanup();
      after();
    };
    (document.head || document.documentElement).appendChild(lib);

    function injectRunner() {
      var run = document.createElement("script");
      run.src = chrome.runtime.getURL("mermaid-run.js");
      (document.head || document.documentElement).appendChild(run);
    }
  }

  runMermaid(function () { MdViewer.enhanceMermaidPanZoom(page); ctrl.fitWidth(); });
  requestAnimationFrame(function () { ctrl.fitWidth(); });

  root.querySelector('[data-act="zoomin"]').addEventListener("click", ctrl.zoomIn);
  root.querySelector('[data-act="zoomout"]').addEventListener("click", ctrl.zoomOut);
  root.querySelector('[data-act="reset"]').addEventListener("click", ctrl.reset);
  root.querySelector('[data-act="fit"]').addEventListener("click", ctrl.fitWidth);
  var fontSizer = MdViewer.createFontSizer(page, function (px) {
    if (fontLabel) fontLabel.textContent = px + "px";
  });
  root.querySelector('[data-act="fontup"]').addEventListener("click", fontSizer.up);
  root.querySelector('[data-act="fontdown"]').addEventListener("click", fontSizer.down);
  // 印刷: @media print 側でズーム/パンの変形を解除し、紙面を実寸で出力する
  root.querySelector('[data-act="print"]').addEventListener("click", function () {
    window.print();
  });

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "=" || e.key === "+") { e.preventDefault(); ctrl.zoomIn(); }
      else if (e.key === "-") { e.preventDefault(); ctrl.zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); ctrl.reset(); }
    }
  });

  // ---- ドラッグ&ドロップで別の .md を読み込む ----
  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      MdViewer.renderInto(page, String(reader.result));
      titleEl.textContent = file.name;
      document.title = file.name;
      ctrl.reset();
      runMermaid(function () { MdViewer.enhanceMermaidPanZoom(page); ctrl.fitWidth(); });
      requestAnimationFrame(function () { ctrl.fitWidth(); });
    };
    reader.readAsText(file, "UTF-8");
  }
  function pickMd(files) {
    var arr = Array.prototype.slice.call(files);
    return arr.filter(function (f) {
      return /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name);
    })[0] || arr[0];
  }

  ["dragenter", "dragover"].forEach(function (ev) {
    canvas.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      canvas.classList.add("dragover");
    });
  });
  ["dragleave", "dragend"].forEach(function (ev) {
    canvas.addEventListener(ev, function (e) {
      e.preventDefault();
      if (ev === "dragleave" && canvas.contains(e.relatedTarget)) return;
      canvas.classList.remove("dragover");
    });
  });
  canvas.addEventListener("drop", function (e) {
    e.preventDefault(); e.stopPropagation();
    canvas.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      var f = pickMd(e.dataTransfer.files);
      if (f) loadFile(f);
    }
  });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });
  } // renderInPlace
})();
