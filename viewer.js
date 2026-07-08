/*
 * viewer.js — ズーム・パン移動・ドラッグ&ドロップの制御
 * MdViewer.createZoomPan(...) を公開し、viewer.html と content.js の双方で利用する。
 */
(function (global) {
  "use strict";

  var MIN_SCALE = 0.2;
  var MAX_SCALE = 8;

  // canvas: パン/ズームのビュー領域, viewport: transform を当てる要素
  function createZoomPan(canvas, viewport, opts) {
    opts = opts || {};
    var scale = 1, tx = 0, ty = 0;
    var onChange = opts.onChange || function () {};

    function apply() {
      viewport.style.transform =
        "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
      onChange(scale);
    }

    function clampScale(s) {
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
    }

    // 指定した画面座標(cx,cy)を中心にズーム
    function zoomAt(cx, cy, factor) {
      var newScale = clampScale(scale * factor);
      if (newScale === scale) return;
      // 画面座標→コンテンツ座標を保ったまま倍率変更
      tx = cx - (cx - tx) * (newScale / scale);
      ty = cy - (cy - ty) * (newScale / scale);
      scale = newScale;
      apply();
    }

    function zoomBy(factor) {
      var r = canvas.getBoundingClientRect();
      zoomAt(r.width / 2, r.height / 2, factor);
    }

    function setScale(s) {
      var r = canvas.getBoundingClientRect();
      var cx = r.width / 2, cy = r.height / 2;
      var ns = clampScale(s);
      tx = cx - (cx - tx) * (ns / scale);
      ty = cy - (cy - ty) * (ns / scale);
      scale = ns;
      apply();
    }

    function reset() {
      scale = 1; tx = 0; ty = 0; apply();
    }

    // 紙面の幅をキャンバス幅に合わせる
    function fitWidth() {
      var page = viewport.firstElementChild;
      if (!page) return;
      var r = canvas.getBoundingClientRect();
      var pw = page.offsetWidth;
      if (!pw) return;
      var margin = 40;
      scale = clampScale((r.width - margin * 2) / pw);
      tx = (r.width - pw * scale) / 2;
      ty = margin;
      apply();
    }

    // ---- ホイール: Ctrl でズーム、通常はパン(スクロール) ----
    canvas.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var r = canvas.getBoundingClientRect();
        var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
      } else {
        // 通常ホイールは縦横スクロール(パン)として扱う
        e.preventDefault();
        tx -= e.deltaX;
        ty -= e.deltaY;
        apply();
      }
    }, { passive: false });

    // ---- ドラッグでパン ----
    var dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0, moved = false;
    canvas.addEventListener("pointerdown", function (e) {
      // 左クリック/中クリックのみ。リンクや入力上では無効
      if (e.button !== 0 && e.button !== 1) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "a" || tag === "input" || tag === "button" || tag === "label") return;
      dragging = true;
      moved = false;
      startX = e.clientX; startY = e.clientY;
      startTx = tx; startTy = ty;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("panning");
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      tx = startTx + dx;
      ty = startTy + dy;
      apply();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove("panning");
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    // ドラッグ直後のクリックによるテキスト選択解除を防ぐ
    canvas.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // ダブルクリックでズームイン
    canvas.addEventListener("dblclick", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "a") return;
      var r = canvas.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, 1.4);
    });

    // ページ内アンカーへパン移動（現在の倍率を維持したまま対象を上部へ）
    function scrollToAnchor(id) {
      var page = viewport.firstElementChild;
      if (!page) return;
      var target = page.querySelector('[id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!target) return;
      // 対象要素の紙面内オフセット（transform 前の座標）
      var offTop = 0, offLeft = 0, n = target;
      while (n && n !== viewport) { offTop += n.offsetTop; offLeft += n.offsetLeft; n = n.offsetParent; }
      ty = 40 - offTop * scale;
      apply();
    }

    // アンカークリックを捕捉
    canvas.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a.md-anchor, a[href^="#"]');
      if (a) {
        var href = a.getAttribute("href") || "";
        if (href.charAt(0) === "#" && href.length > 1) {
          e.preventDefault();
          scrollToAnchor(decodeURIComponent(href.slice(1)));
        }
      }
    });

    apply();

    return {
      zoomIn: function () { zoomBy(1.25); },
      zoomOut: function () { zoomBy(1 / 1.25); },
      reset: reset,
      fitWidth: fitWidth,
      setScale: setScale,
      scrollToAnchor: scrollToAnchor,
      getScale: function () { return scale; }
    };
  }

  // マークダウン文字列を紙面要素へ描画
  function renderInto(pageEl, text) {
    pageEl.innerHTML = global.MarkdownParser.render(text);
  }

  // 表示内の文字サイズ（基準フォントサイズ）を拡大縮小する。見出し等は em 指定なので比例して変化する。
  function createFontSizer(pageEl, onChange) {
    var DEFAULT = 12, MIN = 9, MAX = 44, px = DEFAULT;
    function apply() {
      pageEl.style.fontSize = px + "px";
      if (onChange) onChange(px);
    }
    return {
      up: function () { px = Math.min(MAX, px + 2); apply(); },
      down: function () { px = Math.max(MIN, px - 2); apply(); },
      reset: function () { px = DEFAULT; apply(); },
      get: function () { return px; }
    };
  }

  // Mermaid ダイアグラムを SVG として描画（mermaid.min.js が読み込まれている場合のみ）
  var mermaidInited = false;
  var mermaidCounter = 0;
  function renderMermaid(pageEl, done) {
    done = done || function () {};
    var nodes = pageEl.querySelectorAll("pre.mermaid");
    if (!nodes.length || typeof global.mermaid === "undefined") { done(); return; }

    if (!mermaidInited) {
      try {
        global.mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "default",
          flowchart: { htmlLabels: true, useMaxWidth: false }
        });
      } catch (_) {}
      mermaidInited = true;
    }

    var list = Array.prototype.slice.call(nodes);
    var pending = list.length;
    function finish() {
      if (--pending === 0) {
        enhanceMermaidPanZoom(pageEl);
        done();
      }
    }
    list.forEach(function (el) {
      var code = el.textContent;
      var id = "mmd-" + (mermaidCounter++);
      var container = document.createElement("div");
      container.className = "mermaid-rendered";
      el.parentNode.replaceChild(container, el);
      try {
        var p = global.mermaid.render(id, code);
        // v10 は Promise、v9 はコールバックの両対応
        if (p && typeof p.then === "function") {
          p.then(function (res) {
            container.innerHTML = res.svg;
            if (res.bindFunctions) res.bindFunctions(container);
          }).catch(function (err) {
            container.outerHTML = fallbackCode(code, err);
          }).then(finish);
        } else {
          container.innerHTML = p;
          finish();
        }
      } catch (err) {
        container.outerHTML = fallbackCode(code, err);
        finish();
      }
    });
  }

  // 描画済みの各 Mermaid 図に、独立した拡大縮小・パン移動のビューポートを付与する。
  // - 図の中をドラッグで移動 / Ctrl+ホイール・＋−ボタンで拡大縮小 / 枠は縦リサイズ可
  // - viewer.html（.mermaid-rendered）と file:// 表示（pre.mermaid[data-processed]）の双方に対応
  var MMIN = 0.1, MMAX = 10;
  function enhanceMermaidPanZoom(pageEl) {
    var boxes = pageEl.querySelectorAll(
      '.mermaid-rendered, pre.mermaid[data-processed="true"]'
    );
    Array.prototype.forEach.call(boxes, function (box) {
      if (box.getAttribute("data-pz") === "1") return;
      var svg = box.querySelector("svg");
      if (!svg) return;
      box.setAttribute("data-pz", "1");
      box.classList.add("mmd-pz");

      // SVG を独立トランスフォーム用のビューポートに移す
      svg.style.maxWidth = "none";
      svg.style.display = "block";
      var vp = document.createElement("div");
      vp.className = "mmd-pz-viewport";
      vp.appendChild(svg);
      box.appendChild(vp);

      // 操作ボタン
      var controls = document.createElement("div");
      controls.className = "mmd-pz-controls";
      controls.innerHTML =
        '<button type="button" data-a="in" title="拡大">＋</button>' +
        '<button type="button" data-a="out" title="縮小">−</button>' +
        '<button type="button" data-a="fit" title="全体表示">⤢</button>';
      box.appendChild(controls);

      var scale = 1, tx = 0, ty = 0;
      function apply() {
        vp.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
      }
      function clamp(s) { return Math.min(MMAX, Math.max(MMIN, s)); }
      function zoomAt(cx, cy, factor) {
        var ns = clamp(scale * factor);
        if (ns === scale) return;
        tx = cx - (cx - tx) * (ns / scale);
        ty = cy - (cy - ty) * (ns / scale);
        scale = ns;
        apply();
      }
      function fit() {
        // 全体表示は「横幅一杯」に合わせる（縦が長い図は縦方向へパン可能）
        vp.style.transform = "translate(0px,0px) scale(1)";
        // getBoundingClientRect はページ全体のズーム倍率も掛かった画面上の寸法を返すため、
        // 枠のレイアウト幅との比から外側の倍率を割り出して除外する
        var boxRect = box.getBoundingClientRect();
        var outer = box.clientWidth ? boxRect.width / box.clientWidth : 1;
        if (!outer) outer = 1;
        var svgRect = svg.getBoundingClientRect();
        var iw = svgRect.width / outer;
        var ih = svgRect.height / outer;
        var bw = box.clientWidth, bh = box.clientHeight;
        if (!iw || !ih) { scale = 1; tx = 0; ty = 0; apply(); return; }
        scale = clamp((bw - 8) / iw);
        tx = (bw - iw * scale) / 2;
        // 図の高さが枠に収まるなら縦中央、はみ出すなら上寄せ
        var sh = ih * scale;
        ty = sh <= bh ? (bh - sh) / 2 : 4;
        apply();
      }

      // Ctrl/⌘+ホイールで図を拡大縮小（通常ホイールはページ側へ委譲）
      box.addEventListener("wheel", function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
        var r = box.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });

      // ドラッグで図内を移動（ページ全体のパンには伝播させない）
      var dragging = false, sx = 0, sy = 0, stx = 0, sty = 0;
      box.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        var t = (e.target.tagName || "").toLowerCase();
        if (t === "button" || t === "a") return;
        e.stopPropagation();
        dragging = true;
        sx = e.clientX; sy = e.clientY; stx = tx; sty = ty;
        box.setPointerCapture(e.pointerId);
        box.classList.add("panning");
      });
      box.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        e.stopPropagation();
        tx = stx + (e.clientX - sx);
        ty = sty + (e.clientY - sy);
        apply();
      });
      function end(e) {
        if (!dragging) return;
        dragging = false;
        box.classList.remove("panning");
        try { box.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      box.addEventListener("pointerup", end);
      box.addEventListener("pointercancel", end);
      box.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var r = box.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, 1.4);
      });

      controls.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        e.stopPropagation();
        var a = b.getAttribute("data-a");
        var r = box.getBoundingClientRect();
        if (a === "in") zoomAt(r.width / 2, r.height / 2, 1.25);
        else if (a === "out") zoomAt(r.width / 2, r.height / 2, 1 / 1.25);
        else if (a === "fit") fit();
      });
      controls.addEventListener("pointerdown", function (e) { e.stopPropagation(); });

      // 初期表示は全体が収まるように
      requestAnimationFrame(fit);
    });
  }

  function fallbackCode(code, err) {
    var reason = err && (err.message || err) ? " — " + String(err.message || err).split("\n")[0] : "";
    return '<div class="code-block"><span class="code-lang">mermaid（図の描画に失敗' +
      global.MarkdownParser.escapeHtml(reason) + '）</span><pre><code>' +
      global.MarkdownParser.escapeHtml(code) + "</code></pre></div>";
  }

  global.MdViewer = {
    createZoomPan: createZoomPan,
    renderInto: renderInto,
    renderMermaid: renderMermaid,
    enhanceMermaidPanZoom: enhanceMermaidPanZoom,
    createFontSizer: createFontSizer
  };

  // ===== viewer.html 専用の初期化 =====
  if (document.getElementById("mdvCanvas") && document.getElementById("mdvPage")) {
    initStandalone();
  }

  function initStandalone() {
    var canvas = document.getElementById("mdvCanvas");
    var viewport = document.getElementById("mdvViewport");
    var page = document.getElementById("mdvPage");
    var empty = document.getElementById("mdvEmpty");
    var title = document.getElementById("mdvTitle");
    var zoomLabel = document.getElementById("mdvZoom");
    var fileInput = document.getElementById("mdvFileInput");

    var fontLabel = document.getElementById("mdvFont");
    var ctrl = createZoomPan(canvas, viewport, {
      onChange: function (s) { zoomLabel.textContent = Math.round(s * 100) + "%"; }
    });
    var fontSizer = createFontSizer(page, function (px) {
      if (fontLabel) fontLabel.textContent = px + "px";
    });

    function loadText(text, name) {
      renderInto(page, text);
      empty.style.display = "none";
      title.textContent = name || "Markdown Viewer";
      document.title = (name ? name + " — " : "") + "Markdown Viewer";
      // Mermaid 図を描画してから、レイアウト確定後に幅合わせ
      renderMermaid(page, function () {
        requestAnimationFrame(function () { ctrl.fitWidth(); });
      });
      requestAnimationFrame(function () { ctrl.fitWidth(); });
    }

    function loadFile(file) {
      var reader = new FileReader();
      reader.onload = function () { loadText(String(reader.result), file.name); };
      reader.readAsText(file, "UTF-8");
    }

    function pickMdFile(files) {
      var arr = Array.prototype.slice.call(files);
      var md = arr.filter(function (f) {
        return /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name) ||
          f.type === "text/markdown" || f.type === "text/plain";
      });
      return md[0] || arr[0];
    }

    // ボタン類
    document.getElementById("mdvZoomIn").addEventListener("click", ctrl.zoomIn);
    document.getElementById("mdvZoomOut").addEventListener("click", ctrl.zoomOut);
    document.getElementById("mdvReset").addEventListener("click", ctrl.reset);
    document.getElementById("mdvFit").addEventListener("click", ctrl.fitWidth);
    document.getElementById("mdvFontUp").addEventListener("click", fontSizer.up);
    document.getElementById("mdvFontDown").addEventListener("click", fontSizer.down);
    // 印刷: @media print 側で変形を解除し、紙面(.mdv-page)だけを実寸で出力する
    document.getElementById("mdvPrint").addEventListener("click", function () {
      // 未読み込み時は無効
      if (empty.style.display !== "none") return;
      window.print();
    });

    document.getElementById("mdvOpen").addEventListener("click", function () { fileInput.click(); });
    document.getElementById("mdvOpenBig").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files.length) {
        var f = pickMdFile(fileInput.files);
        if (f) loadFile(f);
      }
      fileInput.value = "";
    });

    // キーボードショートカット
    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") { e.preventDefault(); ctrl.zoomIn(); }
        else if (e.key === "-") { e.preventDefault(); ctrl.zoomOut(); }
        else if (e.key === "0") { e.preventDefault(); ctrl.reset(); }
      }
    });

    // ---- ドラッグ&ドロップ ----
    ["dragenter", "dragover"].forEach(function (ev) {
      canvas.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
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
      e.preventDefault();
      e.stopPropagation();
      canvas.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        var f = pickMdFile(e.dataTransfer.files);
        if (f) loadFile(f);
      } else {
        var uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
        if (uri && /\.(md|markdown|mdown|mkd)$/i.test(uri)) {
          fetch(uri).then(function (r) { return r.text(); })
            .then(function (t) { loadText(t, uri.split("/").pop()); })
            .catch(function () {});
        }
      }
    });
    // ページ全体でのドロップによる遷移を防ぐ
    window.addEventListener("dragover", function (e) { e.preventDefault(); });
    window.addEventListener("drop", function (e) { e.preventDefault(); });

    // クエリ ?file= で外部URLを読み込む（file:// の直接表示補助）
    var params = new URLSearchParams(location.search);
    var fileUrl = params.get("file");
    if (fileUrl) {
      fetch(fileUrl).then(function (r) { return r.text(); })
        .then(function (t) { loadText(t, decodeURIComponent(fileUrl.split("/").pop())); })
        .catch(function () {});
    }
  }
})(typeof window !== "undefined" ? window : this);
