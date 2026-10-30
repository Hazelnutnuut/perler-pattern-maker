# 拼豆图纸生成器 · Perler Pattern Maker

图片一键转拼豆图纸：**MARD 221 标准色号**、自定义尺寸、可手动修图，导出带色号和用量表的图纸。
Turn any image into a Perler / fuse-bead pattern with **MARD 221 standard colour codes**, any size, manual editing, and a printable chart with bead counts.

**在线使用 / Try it:** https://hazelnutnuut.github.io/perler-pattern-maker/

## 为什么做这个 · Why

以前从一张图做出拼豆图纸，要在好几个软件之间来回倒腾。这个工具想把整件事放进一个页面里：

1. **不用再在多个软件之间切换**
   以前要先在修图软件里把图片缩小、像素化，再拿到另一个工具里对色号。现在上传图片后直接出带色号的图纸。
2. **尺寸自己定，难度自己选**
   格数越多，图越精细，但也越难拼、越花时间。用户可以输入任意宽高，按自己的时间和精力选择难度：几十格的小挂件，或者上百格的大作品。
3. **自带抠图，背景不再被算进去**
   很多拼豆图纸生成工具会把背景也转成豆子，用户只能先去抠图软件里处理，或者事后一颗颗删。这里上传时会直接问要不要去背景：纯色背景一键去掉，照片和复杂背景可以用 AI 抠图。
4. **一体化工作流**
   上传 → 抠图 → 裁剪 → 定尺寸 → 匹配标准色号 → 手动修图 → 导出图纸和用量表，全部在一个页面完成，图片也不会离开你的浏览器。

Making a bead pattern from a picture used to mean juggling several apps. This tool puts the whole job on one page:

1. **No more app-hopping** — no need to shrink and pixelate the image in a photo editor first and then match colours in another tool. Upload, and get a chart with colour codes.
2. **You pick the size, so you pick the difficulty** — more beads means more detail but more time and effort. Enter any width and height to match how much time you have, from a small charm to a large piece.
3. **Built-in background removal** — many pattern generators turn the background into beads too, so you have to cut the subject out in another app or delete beads one by one afterwards. Here you're asked right after upload: remove a solid background in one click, or use AI cutout for photos and busy backgrounds.
4. **One end-to-end workflow** — upload → cut out → crop → size → match standard codes → touch up → export the chart and bead counts, all in one page, and your image never leaves your browser.

![screenshot](docs/screenshot.png)

**效果示例 / Examples**（原图 → 32 颗宽的拼豆效果 / original → 32-bead-wide result）

![demo](docs/demo.png)

导出的图纸 / Exported chart:

<img src="docs/chart.png" width="560" alt="chart">

示例图在 `docs/examples/`，可以直接拿来试。 Example images are in `docs/examples/` — try them out.

---

## 中文

### 功能
- **上传图片**：点击选择、拖拽或直接粘贴（Ctrl/⌘+V）。图片只在浏览器本地处理，不上传任何服务器。
- **裁剪**：在图上拖框选择范围；「自动裁边」会去掉纯色边和手机截图的黑色 UI 边。
- **自定义尺寸**：输入宽×高（5–200 颗），可锁定原图比例，或选 29×29 / 40×40 / 52×52 / 58×58。
- **标准色号**：内置 MARD 221 色卡，用 CIEDE2000 色差公式匹配最接近的色号（比直接比 RGB 更接近人眼感觉，肤色尤其明显）。
- **控制颜色数**：
  - 「最多颜色数」：超过就把用量最少的颜色并入最接近的颜色。
  - 「相近色合并」：把几乎一样的颜色（比如三四种黑）合成一种，少买几种豆。
- **抠图 / 去背景**：上传后会问你要不要去背景，三选一：
  - 不用
  - 去纯色背景：从图片边缘开始，把和背景色相近、并且连通的格子变成空格（不放豆），人物内部的白色不会被误删。快，适合白底卡通。
  - **AI 抠图**：适合照片和复杂背景，在浏览器本地运行，图片不上传。两个模型：人像（[MODNet](https://huggingface.co/Xenova/modnet)，Apache-2.0，约 25MB）和通用（[BiRefNet-lite](https://huggingface.co/onnx-community/BiRefNet_lite)，MIT，人/动物/物品都行，约 100MB+）。第一次使用要下载模型，之后浏览器会缓存。有 WebGPU 的浏览器会更快。
- **两种取色方式**：主色（适合卡通、线条清晰）／平均色（适合照片）。
- **手动修图**：画笔、橡皮、吸管、填充、整色替换，支持撤销/重做（⌘/Ctrl+Z）。鼠标悬停在「用到的颜色」上会高亮它在图里的位置。
- **导出**：
  - 图纸 PNG：每格印色号、四边坐标、每 5/10 格粗线、色号用量表
  - 豆子效果图 PNG
  - 打印 / 存为 PDF
  - CSV（每格色号，方便放进 Excel）
- **板子分割线**：按 29 或 52 的板子画虚线，方便分板拼。
- **中英双语界面**。

### 小贴士
- 卡通图、Q 版头像、像素风图片效果最好。真人照片压到几十格会糊，建议先用 AI 转成 Q 版再来。
- 几十格的小尺寸里，眼睛和嘴通常需要用画笔手动修一下。
- 色号的 HEX 值是屏幕近似值，实物颜色会受豆子批次和光线影响，买豆前最好对照实物色卡。

### 本地运行
纯静态网页，没有构建步骤：
```bash
git clone https://github.com/Hazelnutnuut/perler-pattern-maker.git
cd perler-pattern-maker
python3 -m http.server 8000
# 打开 http://localhost:8000
```
（需要用本地服务器打开，直接双击 index.html 的话浏览器会拦截 ES module。）

---

## English

### Features
- **Upload** by click, drag & drop or paste. Everything runs locally in your browser — nothing is uploaded.
- **Crop** by dragging a box; **Auto-trim** strips solid borders and phone-viewer UI bars from screenshots.
- **Any size** from 5 to 200 beads per side, with aspect-ratio lock and common pegboard presets.
- **MARD 221 standard codes**, matched with the **CIEDE2000** colour difference formula.
- **Colour control**: cap the number of colours, and merge near-duplicate colours so you buy fewer bead types.
- **Background removal / cutout** — after upload you're asked whether to remove the background:
  - *Solid background*: flood-fill from the border, so white areas inside the subject are kept. Fast; great for cartoons.
  - *AI cutout*: for photos and busy backgrounds, running locally in the browser via [Transformers.js](https://github.com/huggingface/transformers.js). Choose *Portrait* ([MODNet](https://huggingface.co/Xenova/modnet), Apache-2.0, ~25 MB) or *General* ([BiRefNet-lite](https://huggingface.co/onnx-community/BiRefNet_lite), MIT, ~100 MB+). Models download once and are cached; WebGPU is used when available.
- **Two sampling modes**: dominant colour (cartoons) or average colour (photos).
- **Editor**: paint, erase, eyedropper, fill, replace-all, undo/redo. Hover a used colour to highlight where it is.
- **Export**: chart PNG (code in every cell, coordinates, 5/10 guides, bead count table), bead preview PNG, print / save as PDF, CSV.
- **Pegboard lines** for 29×29 and 52×52 boards.
- Chinese / English UI.

### Run locally
Static site, no build step:
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

### Project layout
```
index.html        page
style.css         styles
js/palette.js     MARD 221 colour table
js/color.js       RGB → Lab, CIEDE2000
js/convert.js     image → bead grid (sampling, background removal, matching, colour limits, auto-trim)
js/cutout.js      AI background removal (Transformers.js, loaded on demand)
js/render.js      editor canvas, bead preview, printable chart
js/i18n.js        Chinese / English strings
js/app.js         UI wiring and editor
```

### Adding another palette
Add an entry to `PALETTES` in `js/palette.js`:
```js
perler: { name: "Perler", colors: [["P01", "#F1F1F1"], ["P18", "#2E2F32"], /* ... */] }
```
It will show up in the palette dropdown automatically.

## Notes
MARD HEX values come from community-compiled colour charts and are screen approximations only.

## License
MIT
