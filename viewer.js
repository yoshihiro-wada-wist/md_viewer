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
      syncScrollbar();
      onChange(scale, tx, ty);
    }

    function clampScale(s) {
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
    }

    // ---- 縦スクロールバー ----
    // 紙面は transform でパンしているためブラウザ標準のスクロールバーが出ない。
    // 現在位置と紙面の高さから、つまみの位置・大きさを自前で描画する。
    var sbTrack = document.createElement("div");
    sbTrack.className = "mdv-scrollbar";
    var sbThumb = document.createElement("div");
    sbThumb.className = "mdv-scroll-thumb";
    sbTrack.appendChild(sbThumb);
    canvas.appendChild(sbTrack);

    // スクロール量の算出。パンは自由移動で紙面の外へも出られるため、
    // はみ出した分も範囲に含めてつまみがトラックから飛び出さないようにする。
    function scrollMetrics() {
      var ch = canvas.clientHeight;
      // viewport の高さは紙面 + 上下マージン。倍率を掛けて画面上の高さにする
      var h = viewport.offsetHeight * scale;
      var top = Math.min(0, -ty);
      var bottom = Math.max(h, -ty + ch);
      return { ch: ch, top: top, total: Math.max(1, bottom - top) };
    }

    function syncScrollbar() {
      var m = scrollMetrics();
      // 紙面が収まりきっているときは表示しない
      if (m.total <= m.ch + 1) { sbTrack.classList.add("mdv-scrollbar-off"); return; }
      sbTrack.classList.remove("mdv-scrollbar-off");
      var size = Math.max(24, m.ch * m.ch / m.total);
      var room = m.ch - size;
      var pos = room <= 0 ? 0 : (-ty - m.top) / (m.total - m.ch) * room;
      sbThumb.style.height = size + "px";
      sbThumb.style.transform = "translateY(" + Math.min(room, Math.max(0, pos)) + "px)";
    }

    // トラック上の位置(px)からその位置へジャンプ。
    // ドラッグ中は開始時の m を渡し、算出基準が動いてつまみが指からずれるのを防ぐ。
    function scrollToTrackPos(pos, m) {
      m = m || scrollMetrics();
      var room = m.ch - sbThumb.offsetHeight;
      if (room <= 0) return;
      pos = Math.min(room, Math.max(0, pos));
      ty = -(m.top + pos / room * (m.total - m.ch));
      apply();
    }

    var sbDrag = null;
    sbThumb.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();   // キャンバスのドラッグパンを起こさない
      // transform で動かしているため offsetTop では位置が取れない。実測値を使う
      var top = sbThumb.getBoundingClientRect().top - sbTrack.getBoundingClientRect().top;
      sbDrag = { y: e.clientY, top: top, m: scrollMetrics() };
      sbThumb.setPointerCapture(e.pointerId);
      sbThumb.classList.add("dragging");
    });
    sbThumb.addEventListener("pointermove", function (e) {
      if (!sbDrag) return;
      scrollToTrackPos(sbDrag.top + (e.clientY - sbDrag.y), sbDrag.m);
    });
    function endSbDrag(e) {
      if (!sbDrag) return;
      sbDrag = null;
      sbThumb.classList.remove("dragging");
      try { sbThumb.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    sbThumb.addEventListener("pointerup", endSbDrag);
    sbThumb.addEventListener("pointercancel", endSbDrag);

    // トラックの余白をクリックしたら、その位置へつまみの中心を合わせる
    sbTrack.addEventListener("pointerdown", function (e) {
      if (e.target === sbThumb) return;
      e.preventDefault();
      e.stopPropagation();
      var r = sbTrack.getBoundingClientRect();
      scrollToTrackPos(e.clientY - r.top - sbThumb.offsetHeight / 2);
    });

    // 描画内容(Mermaid の遅延描画を含む)やウィンドウサイズの変化に追従
    if (global.ResizeObserver) {
      var ro = new global.ResizeObserver(syncScrollbar);
      ro.observe(viewport);
      ro.observe(canvas);
    }
    window.addEventListener("resize", syncScrollbar);


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

    // 紙面の幅をキャンバス幅に合わせる（左右の余白が均等になるよう中央寄せ）
    function fitWidth() {
      var page = viewport.firstElementChild;
      if (!page) return;
      var r = canvas.getBoundingClientRect();
      var pw = page.offsetWidth;
      if (!pw) return;
      var margin = 40;
      // 紙面自身の左マージン分だけ右にずれるため、tx で打ち消して左右対称にする
      var ml = parseFloat(getComputedStyle(page).marginLeft) || 0;
      scale = clampScale((r.width - margin * 2) / pw);
      tx = (r.width - pw * scale) / 2 - ml * scale;
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

    // ---- キーボードでパン ----
    function panBy(dx, dy) {
      tx += dx;
      ty += dy;
      apply();
    }

    // 紙面の上端/下端へ移動（下端は紙面がキャンバスより短ければ上端と同じ）
    function panToEdge(bottom) {
      var page = viewport.firstElementChild;
      if (!page) return;
      var top = 40;
      if (!bottom) { ty = top; apply(); return; }
      var h = page.offsetHeight * scale;
      var ch = canvas.getBoundingClientRect().height;
      ty = h + top <= ch ? top : ch - h - 40;
      apply();
    }

    // 入力中やボタン操作中はページのパンを行わない
    function isEditingTarget(el) {
      if (!el) return false;
      var tag = (el.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" ||
        tag === "button" || el.isContentEditable;
    }

    var KEY_STEP = 60;
    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditingTarget(e.target)) return;
      var ch = canvas.getBoundingClientRect().height;
      var step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
      switch (e.key) {
        case "ArrowUp":    panBy(0, step); break;
        case "ArrowDown":  panBy(0, -step); break;
        case "ArrowLeft":  panBy(step, 0); break;
        case "ArrowRight": panBy(-step, 0); break;
        case "PageUp":     panBy(0, ch * 0.9); break;
        case "PageDown":   panBy(0, -ch * 0.9); break;
        case "Home":       panToEdge(false); break;
        case "End":        panToEdge(true); break;
        default: return;
      }
      e.preventDefault();
    });

    // ---- ドラッグでパン ----
    var dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0, moved = false;
    canvas.addEventListener("pointerdown", function (e) {
      // ここで必ず落としておく。リンク上でドラッグを開始しない場合も含め、
      // 前回のパン操作の「動かした」状態を次のクリックへ持ち越すと、
      // 下の click ハンドラがアンカーのクリックまで打ち消してしまう。
      moved = false;
      // 左クリック/中クリックのみ。リンクや入力上では無効
      if (e.button !== 0 && e.button !== 1) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "a" || tag === "input" || tag === "button" || tag === "label") return;
      dragging = true;
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

    // 対象要素の紙面内オフセット（transform 前の座標）
    function offsetTopIn(el) {
      var top = 0, n = el;
      while (n && n !== viewport) { top += n.offsetTop; n = n.offsetParent; }
      return top;
    }

    // 要素へパン移動（現在の倍率を維持したまま対象を上部へ）
    function scrollToElement(el) {
      if (!el) return;
      ty = 40 - offsetTopIn(el) * scale;
      apply();
    }

    // id で紙面内の要素を探す。和文や先頭が数字の id（例: "1-装置概要"）は
    // セレクタに埋め込むとエスケープ規則の影響を受けるため、id を直接比較する。
    function findById(root, id) {
      var all = root.querySelectorAll("[id]");
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i];
      }
      return null;
    }

    // ページ内アンカーへパン移動
    function scrollToAnchor(id) {
      var page = viewport.firstElementChild;
      if (!page) return;
      scrollToElement(findById(page, id));
    }

    // "#..." の中身を取り出す。%エンコード済みなら戻すが、生の和文 id が
    // そのまま入っている場合もあるため、復号に失敗したら原文を使う。
    function anchorId(href) {
      var raw = href.slice(1);
      try { return decodeURIComponent(raw); } catch (_) { return raw; }
    }

    // アンカークリックを捕捉
    canvas.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a.md-anchor, a[href^="#"]');
      if (a) {
        var href = a.getAttribute("href") || "";
        if (href.charAt(0) === "#" && href.length > 1) {
          e.preventDefault();
          var id = anchorId(href);
          // 復号後の id で見つからなければ、生の文字列でも探す
          var page = viewport.firstElementChild;
          if (page && !findById(page, id) && findById(page, href.slice(1))) {
            id = href.slice(1);
          }
          scrollToAnchor(id);
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
      scrollToElement: scrollToElement,
      offsetTopIn: offsetTopIn,
      getScale: function () { return scale; },
      getOffset: function () { return { tx: tx, ty: ty }; },
      refresh: syncScrollbar
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

  // ===== 目次（インデックスジャンプ） =====
  // 紙面の見出しから目次を組み立て、クリック/キー操作で該当位置へパン移動する。
  // panel: 目次を差し込む空要素, ctrl: createZoomPan の戻り値, page: 紙面要素
  function createToc(opts) {
    var panel = opts.panel, page = opts.page, ctrl = opts.ctrl;
    var onToggle = opts.onToggle || function () {};
    var items = [];      // { el, link, text(小文字・絞り込み用), top(紙面内オフセット) }
    var active = -1;

    panel.classList.add("mdv-toc");
    panel.innerHTML =
      '<div class="mdv-toc-head">' +
        '<span class="mdv-toc-caption">目次</span>' +
        '<button type="button" class="mdv-toc-close" title="目次を閉じる (Ctrl + I)">×</button>' +
      '</div>' +
      '<input type="search" class="mdv-toc-filter" placeholder="見出しを絞り込み" spellcheck="false">' +
      '<nav class="mdv-toc-list"></nav>';
    var listEl = panel.querySelector(".mdv-toc-list");
    var filterEl = panel.querySelector(".mdv-toc-filter");

    // 見出しの id は markdown.js が本文から生成するため、空や重複がありうる。
    // ジャンプ先として一意に参照できるよう、ここで補正する。
    function ensureId(h, index, used) {
      var id = h.id;
      if (!id || used[id]) {
        var base = id || "mdv-heading-" + (index + 1);
        var cand = base, n = 2;
        while (used[cand]) cand = base + "-" + (n++);
        id = cand;
        h.id = id;
      }
      used[id] = true;
    }

    function rebuild() {
      items = [];
      active = -1;
      listEl.innerHTML = "";
      var used = {};
      var hs = page.querySelectorAll("h1, h2, h3, h4, h5, h6");
      Array.prototype.forEach.call(hs, function (h, idx) {
        ensureId(h, idx, used);
        var level = parseInt(h.tagName.charAt(1), 10);
        var text = (h.textContent || "").trim();
        var link = document.createElement("a");
        link.className = "mdv-toc-item mdv-toc-lv" + level;
        link.href = "#" + h.id;
        link.textContent = text || "（無題の見出し）";
        link.title = text;
        var index = items.length;
        link.addEventListener("click", function (e) {
          e.preventDefault();
          jumpTo(index);
        });
        listEl.appendChild(link);
        items.push({ el: h, link: link, text: text.toLowerCase(), top: 0 });
      });
      if (!items.length) {
        var empty = document.createElement("p");
        empty.className = "mdv-toc-empty";
        empty.textContent = "見出しがありません";
        listEl.appendChild(empty);
      }
      measure();
      applyFilter();
      syncActive();
    }

    // 見出しの紙面内オフセットを控える（Mermaid 描画などでレイアウトが動いたら再計測する）
    function measure() {
      items.forEach(function (it) { it.top = ctrl.offsetTopIn(it.el); });
    }

    function setActive(i) {
      if (i === active) return;
      if (items[active]) items[active].link.classList.remove("current");
      active = i;
      if (items[active]) {
        items[active].link.classList.add("current");
        scrollItemIntoView(items[active].link);
      }
    }

    // 目次パネル自身のスクロール（紙面のパンとは別物）
    function scrollItemIntoView(link) {
      var lr = listEl.getBoundingClientRect(), ir = link.getBoundingClientRect();
      if (ir.top < lr.top) listEl.scrollTop -= lr.top - ir.top + 8;
      else if (ir.bottom > lr.bottom) listEl.scrollTop += ir.bottom - lr.bottom + 8;
    }

    // 紙面の上端付近にある見出しを現在位置として反映する。
    // パン/ズームのたびに呼ばれるが、見出し位置は measure() で控えてあるため
    // ここではレイアウトを読まず計算だけで済む（間引き不要）。
    function syncActive() {
      if (!items.length) return;
      var scale = ctrl.getScale();
      var ty = ctrl.getOffset().ty;
      var found = 0;
      for (var i = 0; i < items.length; i++) {
        // 見出しの画面上の y 位置。上端から少し下（80px）までを「現在地」とみなす
        if (ty + items[i].top * scale <= 80) found = i;
        else break;
      }
      setActive(found);
    }

    function jumpTo(i) {
      var it = items[i];
      if (!it) return;
      it.top = ctrl.offsetTopIn(it.el);
      ctrl.scrollToElement(it.el);
      setActive(i);
    }

    // 現在地から前後の見出しへ移動（Alt + ↑ / ↓）
    function jumpBy(delta) {
      if (!items.length) return;
      var visible = items.filter(function (it) { return !it.link.hidden; });
      if (!visible.length) return;
      var cur = items[active];
      var pos = cur ? visible.indexOf(cur) : -1;
      if (pos === -1) {
        // 絞り込みで現在地が隠れている場合は、直近の可視見出しを基準にする
        pos = delta > 0 ? -1 : visible.length;
      }
      var next = visible[Math.min(visible.length - 1, Math.max(0, pos + delta))];
      if (next) jumpTo(items.indexOf(next));
    }

    function applyFilter() {
      var q = (filterEl.value || "").trim().toLowerCase();
      items.forEach(function (it) {
        it.link.hidden = q ? it.text.indexOf(q) === -1 : false;
      });
    }
    filterEl.addEventListener("input", applyFilter);
    filterEl.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { filterEl.value = ""; applyFilter(); e.stopPropagation(); }
      else if (e.key === "Enter") {
        var first = items.filter(function (it) { return !it.link.hidden; })[0];
        if (first) jumpTo(items.indexOf(first));
      }
    });

    function isOpen() { return !panel.hidden; }
    function setOpen(open) {
      panel.hidden = !open;
      onToggle(open);
      if (open) { measure(); syncActive(); }
    }
    panel.querySelector(".mdv-toc-close").addEventListener("click", function () { setOpen(false); });

    var api = {
      rebuild: rebuild,
      measure: measure,
      syncActive: syncActive,
      jumpBy: jumpBy,
      isOpen: isOpen,
      setOpen: setOpen,
      toggle: function () { setOpen(!isOpen()); }
    };

    // Ctrl+I で目次の開閉、Alt+↑/↓ で前後の見出しへジャンプ
    window.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        api.toggle();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey &&
                 (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        jumpBy(e.key === "ArrowDown" ? 1 : -1);
      }
    });

    rebuild();
    return api;
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
      // 図の全体が枠内に収まる倍率で中央に配置する
      function fit() {
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
        var pad = 8;
        // 縦横のうち厳しい方に合わせる（縦長の図も枠内へ収める）
        scale = clamp(Math.min((bw - pad) / iw, (bh - pad) / ih));
        tx = (bw - iw * scale) / 2;
        ty = (bh - ih * scale) / 2;
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
    createFontSizer: createFontSizer,
    createToc: createToc
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
    var tocPanel = document.getElementById("mdvToc");
    var tocBtn = document.getElementById("mdvTocBtn");
    var toc = null;
    var ctrl = createZoomPan(canvas, viewport, {
      onChange: function (s) {
        zoomLabel.textContent = Math.round(s * 100) + "%";
        if (toc && toc.isOpen()) toc.syncActive();
      }
    });
    var fontSizer = createFontSizer(page, function (px) {
      if (fontLabel) fontLabel.textContent = px + "px";
      if (toc) toc.measure();
    });

    toc = createToc({
      panel: tocPanel, page: page, ctrl: ctrl,
      onToggle: function (open) { tocBtn.classList.toggle("active", open); }
    });
    tocBtn.addEventListener("click", toc.toggle);

    function loadText(text, name) {
      renderInto(page, text);
      empty.style.display = "none";
      title.textContent = name || "Markdown Viewer";
      document.title = (name ? name + " — " : "") + "Markdown Viewer";
      toc.rebuild();
      // Mermaid 図を描画してから、レイアウト確定後に幅合わせ
      renderMermaid(page, function () {
        requestAnimationFrame(function () { ctrl.fitWidth(); toc.measure(); });
      });
      requestAnimationFrame(function () { ctrl.fitWidth(); });
      // フォールバック: 読み込み経路（?src= 等）やタイミングで rAF が
      // 走らず初期幅合わせが適用されないと、紙面が左に寄ったままになる。
      // レイアウト確定後に確実に一度合わせる。
      setTimeout(function () { ctrl.fitWidth(); toc.measure(); }, 120);
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

    var params = new URLSearchParams(location.search);

    // ?src= で chrome.storage に置かれた本文を読み込む（content.js からの引き継ぎ）。
    // file:// を拡張ページで開き直してタブに拡張アイコンを表示するための経路。
    var srcKey = params.get("src");
    if (srcKey && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      var stKey = "mdv:" + srcKey;
      chrome.storage.local.get(stKey, function (obj) {
        var text = obj && obj[stKey];
        if (typeof text === "string") {
          loadText(text, decodeURIComponent(srcKey.split("/").pop() || "Markdown"));
          chrome.storage.local.remove(stKey);
        } else {
          showLoadError(srcKey, new Error("本文データが見つかりませんでした（ファイルを開き直してください）"));
        }
      });
    }

    // クエリ ?file= で外部URLを読み込む（file:// の直接表示補助）
    var fileUrl = params.get("file");
    if (fileUrl) {
      fetch(fileUrl).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
        return r.text();
      })
        .then(function (t) { loadText(t, decodeURIComponent(fileUrl.split("/").pop())); })
        .catch(function (err) { showLoadError(fileUrl, err); });
    }

    // ?file= の読み込みに失敗したとき、無言の初期画面ではなく理由を表示する
    function showLoadError(url, err) {
      empty.style.display = "";
      var h2 = empty.querySelector("h2");
      if (h2) h2.textContent = "ファイルを読み込めませんでした";
      var box = empty.querySelector(".mdv-load-error");
      if (!box) {
        box = document.createElement("p");
        box.className = "mdv-load-error";
        box.style.cssText = "max-width:640px;color:#e57373;word-break:break-all;font-size:13px";
        var btn = empty.querySelector(".mdv-open-btn");
        empty.insertBefore(box, btn || null);
      }
      box.textContent = String((err && err.message) || err) + " — " + decodeURIComponent(url);
    }
  }
})(typeof window !== "undefined" ? window : this);
