/*
 * markdown.js — 依存ライブラリなしの自己完結型マークダウンパーサー
 * グローバルに MarkdownParser.render(text) を公開する。
 * 対応: 見出し / 段落 / 強調 / コード(インライン・フェンス) / リスト(順序・非順序・タスク)
 *       引用 / 水平線 / テーブル(GFM) / リンク / 画像 / 打消線 / 自動リンク / 改行
 */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // URL を検証（javascript: など危険なスキームを弾く）
  function safeUrl(url) {
    var u = (url || "").trim();
    if (/^\s*javascript:/i.test(u)) return "#";
    if (/^\s*data:/i.test(u) && !/^\s*data:image\//i.test(u)) return "#";
    if (/^\s*vbscript:/i.test(u)) return "#";
    return u;
  }

  // ---- インライン要素の処理 ----
  function parseInline(text) {
    // コードスパンを先に退避（内部をエスケープしないため）
    var codes = [];
    text = text.replace(/(`+)([\s\S]*?)\1/g, function (_, ticks, code) {
      var token = "\uE000CODE" + codes.length + "\uE000";
      codes.push("<code>" + escapeHtml(code.replace(/^ | $/g, "")) + "</code>");
      return token;
    });

    // 生の HTML を無害化
    text = escapeHtml(text);

    // 画像 ![alt](url "title")
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      function (_, alt, url, title) {
        var t = title ? ' title="' + escapeAttr(title) + '"' : "";
        return '<img src="' + escapeAttr(safeUrl(url)) + '" alt="' + escapeAttr(alt) + '"' + t + ' loading="lazy">';
      });

    // リンク [text](url "title")
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      function (_, label, url, title) {
        var t = title ? ' title="' + escapeAttr(title) + '"' : "";
        // ページ内アンカー(#...)は新規タブを開かず、内部スクロール扱い
        if (url.charAt(0) === "#") {
          return '<a href="' + escapeAttr(url) + '" class="md-anchor">' + label + "</a>";
        }
        return '<a href="' + escapeAttr(safeUrl(url)) + '"' + t + ' target="_blank" rel="noopener noreferrer">' + label + "</a>";
      });

    // 自動リンク <http://...> / 裸のURL
    text = text.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
      function (m, pre, url) {
        return pre + '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">' + url + "</a>";
      });

    // 太字 **text** / __text__
    text = text.replace(/\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^\s_](?:[\s\S]*?[^\s_])?)__/g, "<strong>$1</strong>");

    // 斜体 *text* / _text_
    text = text.replace(/(^|[^\*])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?!\*)/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^\w])_([^\s_](?:[\s\S]*?[^\s_])?)_(?!\w)/g, "$1<em>$2</em>");

    // 打消線 ~~text~~
    text = text.replace(/~~([\s\S]+?)~~/g, "<del>$1</del>");

    // 明示的な改行（行末の \ もしくは半角スペース2つ）
    text = text.replace(/(\\|  )\n/g, "<br>\n");

    // コードスパンを復元
    text = text.replace(/\uE000CODE(\d+)\uE000/g, function (_, i) {
      return codes[+i];
    });

    return text;
  }

  // ---- テーブル判定 ----
  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(line);
  }

  function splitRow(line) {
    var s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    var cells = [];
    var buf = "";
    for (var i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "|") { buf += "|"; i++; }
      else if (s[i] === "|") { cells.push(buf); buf = ""; }
      else buf += s[i];
    }
    cells.push(buf);
    return cells.map(function (c) { return c.trim(); });
  }

  // ---- ブロックレベルの処理 ----
  function render(src) {
    src = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    var lines = src.split("\n");
    var html = [];
    var i = 0;

    function parseListItems(startIndent) {
      // 呼び出し時、lines[i] がリスト項目
      var ulItems = [];
      var listType = null; // "ul" or "ol"
      var startNum = 1;

      var out = "";
      while (i < lines.length) {
        var line = lines[i];
        var m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        var indent = m[1].length;
        if (indent < startIndent) break;
        if (indent > startIndent) break; // ネストは項目内容側で処理

        var marker = m[2];
        var thisType = /^\d/.test(marker) ? "ol" : "ul";
        if (listType === null) {
          listType = thisType;
          if (thisType === "ol") startNum = parseInt(marker, 10) || 1;
        } else if (thisType !== listType) {
          break;
        }

        var content = m[3];
        i++;

        // 継続行・ネストの収集
        var nested = "";
        var extra = [];
        while (i < lines.length) {
          var nl = lines[i];
          if (/^\s*$/.test(nl)) {
            // 空行: 次がより深いインデント継続かどうか確認
            if (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) &&
                lines[i + 1].match(/^(\s*)/)[1].length > startIndent) {
              extra.push("");
              i++;
              continue;
            }
            break;
          }
          var childList = nl.match(/^(\s*)([-*+]|\d+[.)])\s+/);
          var childIndent = nl.match(/^(\s*)/)[1].length;
          if (childList && childIndent > startIndent) {
            nested += parseListItems(childIndent);
            continue;
          }
          if (childIndent > startIndent) {
            extra.push(nl.slice(startIndent).replace(/^\s+/, ""));
            i++;
            continue;
          }
          break;
        }

        // タスクリスト
        var task = content.match(/^\[([ xX])\]\s+(.*)$/);
        var itemHtml;
        var extraText = extra.join("\n").trim();
        if (task) {
          var checked = task[1].toLowerCase() === "x" ? " checked" : "";
          itemHtml = '<label class="task"><input type="checkbox" disabled' + checked + "> " +
            parseInline(task[2]) + "</label>";
        } else {
          itemHtml = parseInline(content);
        }
        if (extraText) itemHtml += "\n" + parseInline(extraText);
        itemHtml += nested;
        ulItems.push("<li>" + itemHtml + "</li>");
      }

      var tag = listType || "ul";
      var attr = "";
      if (tag === "ol" && startNum !== 1) attr = ' start="' + startNum + '"';
      out = "<" + tag + attr + ">\n" + ulItems.join("\n") + "\n</" + tag + ">\n";
      return out;
    }

    while (i < lines.length) {
      var line = lines[i];

      // 空行
      if (/^\s*$/.test(line)) { i++; continue; }

      // コードフェンス ``` または ~~~
      var fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      if (fence) {
        var fenceChar = fence[2][0];
        var fenceLen = fence[2].length;
        var lang = fence[3].trim().split(/\s+/)[0];
        var code = [];
        i++;
        while (i < lines.length) {
          var cl = lines[i];
          var close = cl.match(/^(\s*)(`{3,}|~{3,})\s*$/);
          if (close && close[2][0] === fenceChar && close[2].length >= fenceLen) { i++; break; }
          code.push(cl);
          i++;
        }
        // mermaid はダイアグラムとして描画するため専用要素で出力
        if (/^mermaid$/i.test(lang)) {
          html.push('<div class="mermaid-block"><pre class="mermaid">' +
            escapeHtml(code.join("\n")) + "</pre></div>");
          continue;
        }
        var langClass = lang ? ' class="language-' + escapeAttr(lang) + '"' : "";
        var langLabel = lang ? '<span class="code-lang">' + escapeHtml(lang) + "</span>" : "";
        html.push('<div class="code-block">' + langLabel + "<pre><code" + langClass + ">" +
          escapeHtml(code.join("\n")) + "</code></pre></div>");
        continue;
      }

      // 見出し #
      var heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        var level = heading[1].length;
        var text = heading[2];
        var id;
        // Pandoc/Markdown Extra 形式の明示 ID: {#custom-id}
        // 和文の ID（{#1-装置概要} 等）も受け付ける。[\w-] だと ASCII しか拾えず、
        // ID として認識されないまま "{#...}" が見出しに残り、リンク先も一致しなくなる。
        var customId = text.match(/\s*\{#([^\s{}]+)\}\s*$/);
        if (customId) {
          id = customId[1];
          text = text.slice(0, customId.index);
        } else {
          // 自動生成 ID。残す文字は「文字・数字」を Unicode 全体で判定する。
          // U+3000〜U+9FFF だけを許可すると、全角英数(ＡＢＣ１２３)・半角カナ(ｶﾀｶﾅ)・
          // サロゲートペアの漢字(𠮟) が丸ごと落ち、リンク先と一致しなくなる。
          id = text.toLowerCase()
            .replace(/[^\p{L}\p{N}\p{M}\- ]/gu, "")
            .replace(/\s+/g, "-");
        }
        html.push("<h" + level + ' id="' + escapeAttr(id) + '">' + parseInline(text) + "</h" + level + ">");
        i++;
        continue;
      }

      // Setext 見出し (=== / ---)
      if (i + 1 < lines.length && /\S/.test(line) &&
          /^\s*(=+|-+)\s*$/.test(lines[i + 1]) && !/^\s*[-*+]\s/.test(line)) {
        var lvl = lines[i + 1].trim()[0] === "=" ? 1 : 2;
        html.push("<h" + lvl + ">" + parseInline(line.trim()) + "</h" + lvl + ">");
        i += 2;
        continue;
      }

      // 水平線
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        html.push("<hr>");
        i++;
        continue;
      }

      // 引用 >
      if (/^\s*>/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html.push("<blockquote>" + render(quote.join("\n")) + "</blockquote>");
        continue;
      }

      // テーブル (GFM)
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        var headers = splitRow(line);
        var aligns = splitRow(lines[i + 1]).map(function (c) {
          var l = c.charAt(0) === ":";
          var r = c.charAt(c.length - 1) === ":";
          if (l && r) return "center";
          if (r) return "right";
          if (l) return "left";
          return "";
        });
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        var t = '<div class="table-wrap"><table>\n<thead><tr>';
        headers.forEach(function (h, idx) {
          var a = aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : "";
          t += "<th" + a + ">" + parseInline(h) + "</th>";
        });
        t += "</tr></thead>\n<tbody>";
        rows.forEach(function (r) {
          t += "<tr>";
          for (var c = 0; c < headers.length; c++) {
            var a = aligns[c] ? ' style="text-align:' + aligns[c] + '"' : "";
            t += "<td" + a + ">" + parseInline(r[c] || "") + "</td>";
          }
          t += "</tr>";
        });
        t += "</tbody></table></div>";
        html.push(t);
        continue;
      }

      // リスト
      if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) {
        var baseIndent = line.match(/^(\s*)/)[1].length;
        html.push(parseListItems(baseIndent));
        continue;
      }

      // 段落（連続する非空行をまとめる）
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i])) {
        var pl = lines[i];
        // 次のブロック要素の開始なら段落を終える
        if (/^(\s*)(`{3,}|~{3,})/.test(pl) && para.length) break;
        if (/^#{1,6}\s/.test(pl) && para.length) break;
        if (/^\s*>/.test(pl) && para.length) break;
        if (/^(\s*)([-*+]|\d+[.)])\s+/.test(pl) && para.length) break;
        if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(pl) && para.length) break;
        para.push(pl);
        i++;
      }
      if (para.length) {
        html.push("<p>" + parseInline(para.join("\n")) + "</p>");
      }
    }

    return html.join("\n");
  }

  global.MarkdownParser = { render: render, escapeHtml: escapeHtml };
})(typeof window !== "undefined" ? window : this);
