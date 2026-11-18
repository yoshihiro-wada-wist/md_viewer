# Markdown Viewer — Chrome Extension

[日本語](README.md) | English

A Chrome extension that renders Markdown files visually. It renders Markdown syntax and supports **zooming, panning and drag & drop**.

> The extension's UI is in Japanese. Button labels are shown below in their original form, with their meaning in parentheses.

## Features

- **Rendered view**: renders Markdown syntax (headings, emphasis, code, lists, tables, blockquotes, task lists, links, images, etc.)
- **Mermaid diagrams**: renders ` ```mermaid ` fences (flowcharts, etc.) as diagrams
  - Each diagram has its **own viewport** that can be zoomed and panned independently (`Ctrl` + wheel / `＋` `−` `⤢` buttons / drag on the diagram; drag the bottom edge of the frame to change its height)
- **In-page links**: anchors such as `[...](#sec1)` jump to the target when clicked
- **Table of contents (heading jump)**: the "☰ 目次" (Contents) button (`Ctrl + I`) opens a sidebar listing the headings; click one to jump to it
  - Indented by heading level, with a filter box and highlighting of the current position
  - `Alt + ↑` / `Alt + ↓` moves to the previous / next heading
- **Zoom**: `Ctrl + mouse wheel`, the `＋` / `−` buttons, `Ctrl + +/-/0`, or double-click
- **Pan**: drag the view area (the plain mouse wheel also scrolls)
- **Fit to width**: the "幅合わせ" (Fit width) button fits the page to the canvas width
- **Drag & drop**: just drop a `.md` file onto the window
- Fully self-contained; no external libraries are loaded and no network access is made

## Installation

1. Open `chrome://extensions` in Chrome
2. Turn on **"Developer mode"** in the top right
3. Click **"Load unpacked"**
4. Select this folder (`md_viewer`)

## Usage

### 1. Open the viewer and drop a file

- Click the extension icon in the toolbar to open the viewer
- Drag & drop a `.md` file onto it, or load one with the "ファイルを選択" (Choose file) button

### 2. Open `.md` files directly (optional)

To render local `.md` files automatically when you open them directly in Chrome,
turn on **"Allow access to file URLs"** on this extension's details page in
`chrome://extensions`.

## Controls

| Action | How |
|:-------|:----|
| Zoom in | `Ctrl` + wheel up / `＋` button / `Ctrl` `+` / double-click |
| Zoom out | `Ctrl` + wheel down / `−` button / `Ctrl` `-` |
| Reset to 100% | "100%" button / `Ctrl` `0` |
| Fit to width | "幅合わせ" (Fit width) button |
| Change text size | `A−` / `A＋` buttons in the toolbar (scales only the body text) |
| Pan | Drag the view area / scroll with the wheel |
| Show/hide contents | "☰ 目次" (Contents) button / `Ctrl` `I` |
| Jump to a heading | Click an item in the contents / press `Enter` in the filter box (jumps to the first match) |
| Previous/next heading | `Alt` `↑` / `Alt` `↓` |
| Open a file | Drag & drop / "開く" (Open) button |

## Troubleshooting

- **Mermaid diagrams are not shown**:
  - If diagrams do not appear after updating the files, **reload** this extension (🔄) in `chrome://extensions`, then reload the page (a reload is required whenever the extension's files change)
  - If a diagram fails to load or render, a yellow banner at the top of the screen shows the cause (library failed to load, syntax error, etc.)
  - Diagrams with syntax errors are shown as source code (other valid diagrams are still rendered)

## Files

| File | Role |
|:-----|:-----|
| `manifest.json` | Extension definition (Manifest V3) |
| `background.js` | Opens the viewer when the icon is clicked |
| `viewer.html` / `viewer.js` / `viewer.css` | The viewer page |
| `markdown.js` | Self-contained Markdown parser |
| `mermaid.min.js` | Mermaid diagram library (bundled locally) |
| `content.js` / `content.css` | Automatic rendering when a `.md` file is opened directly |
| `README.md` | Japanese version of this README |
| `LICENSE` | License (MIT) |

## License

Released under the [MIT License](LICENSE).

The bundled `mermaid.min.js` is a prebuilt file from [Mermaid](https://github.com/mermaid-js/mermaid) and is subject to Mermaid's MIT License.
