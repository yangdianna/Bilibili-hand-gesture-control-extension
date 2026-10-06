# Bilibili 手势控制 — 浏览器扩展

通过摄像头手势控制 B 站视频播放。悬浮面板实时显示摄像头状态、当前手势，以及三个操作对应的手势。轻量、无外部运行时依赖、MediaPipe 完全本地化（`src/vendor/` 目录，约 17MB）。

## 安装（Chrome / Edge / 其他 Chromium 内核）

1. 打开 `chrome://extensions/`（Edge 是 `edge://extensions/`）
2. 打开右上角 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择本项目根目录（含 `manifest.json` 的那一层）
4. 打开 `https://www.bilibili.com` 任意视频播放页，右上角出现 ✋ 圆形浮标
5. 点开浮标 → 浏览器请求摄像头权限 → 授权后面板展开，开始识别

## 功能

- 🖐️ **手掌** hold → 播放 / 暂停
- ✊ **握拳左右滑** → 拖动进度条
- ✊ **握拳上下滑** → 调音量（上 = 增大）
- 📷 悬浮面板实时显示摄像头状态（未启动 / 请求中 / 已开启 · Nfps / 已暂停 / 错误原因）和摄像头预览画面
- 动作触发时对应行圆点闪蓝光
- 面板可拖动（顶部 8px 条）、可收起（变成 ✋ 圆点）、8 秒无操作自动淡出
- 单手检测 + 轻量模型 + 帧抽样，CPU 占用低
- SPA 兼容（B 站内点视频卡片切换会自动重新绑定）

## 手势图鉴

| 手势 | 动作 |
|---|---|
| 🖐️ 手掌（手指张开）| 播放 / 暂停 |
| ✊ 握拳 **左右**滑动 | 拖动进度 |
| ✊ 握拳 **上下**滑动 | 调音量 |

## 参数调整（灵敏度）

所有识别参数集中在 `src/gesture/gestures.js` 顶部的 `TH` 常量对象里。修改后回 `chrome://extensions/` 点扩展的 **重新加载**，再刷新 B 站页面生效。

### 手指伸直判定 — `FINGER_EXTEND_MARGIN`

默认 `0.05`。用于判断一根手指是否"伸直"（指尖在图像中比指节高出多少才算伸直，y 坐标法）。

- **调小**（如 `0.01`）→ 手指更容易被判为伸直，拳头判定更宽松
- **调大**（如 `0.1`）→ 更严格，需要手指明确伸直

> 这个参数主要影响**拳头**（握拳时四指都应判为"未伸直"）和手掌的辅助判定。

### 手掌张开度 — `PALM_SPREAD_THRESHOLD`

默认 `0.3`。**手掌识别的核心参数**。计算五根指尖两两相邻距离之和（拇指-食指、食指-中指、中指-无名指、无名指-小指），张开时这个值大、握拳时小。**与手掌朝向无关**，因此最稳。

- **调小**（如 `0.2`）→ 手掌更容易识别（轻微张开也算）
- **调大**（如 `0.4`）→ 更严格，需要手指明显张开

**校准方法**：本扩展在 Console 里每秒打印一次 `[bg] spread: X.XXX label: Y`。张开手掌记下 X（比如 `0.45`），握拳再记下 X（比如 `0.12`），把 `PALM_SPREAD_THRESHOLD` 设到两个值之间即可。

### 手掌保持时间 — `PALM_HOLD_MS`

默认 `400`（毫秒）。手掌需要持续多久才触发播放/暂停。

- **调小**（如 `250`）→ 触发更快
- **调大**（如 `600`）→ 需要更稳定地保持，减少误触

### 动作冷却 — `ACTION_DEBOUNCE_MS`

默认 `1200`（毫秒）。同一个动作触发后，这段时间内不会再次触发。

- 调小 → 可以更快地连续触发
- 调大 → 防止一个手势被反复触发

### 拖动进度 / 音量（握拳滑动）

| 参数 | 默认 | 含义 |
|---|---|---|
| `SCRUB_MIN_DISPLACEMENT_NORM` | `0.03` | 握拳位移超过这个值才开始响应（防抖）。调小更灵敏，调大需更大幅度 |
| `SCRUB_PIXEL_TO_SECONDS` | `0.05` | 横向滑动每像素对应多少秒进度。调大 = 滑同样距离快进更多 |
| `VOLUME_SENSITIVITY` | `0.6` | 纵向滑动每满屏高度对应多少音量变化（0~1）。调大 = 音量变化更快 |

### 识别置信度 / 其他（`src/gesture/engine.js`）

MediaPipe 本身的检测参数在 `engine.js` 的 `hands.setOptions(...)`：

```js
minDetectionConfidence: 0.6,   // 首次检测到手的置信度阈值，调小更容易检测到手（但更易误检）
minTrackingConfidence: 0.5,    // 追踪过程中保持手的置信度阈值，调小追踪更稳定
maxNumHands: 1,                // 单手检测
modelComplexity: 0,            // 0=轻量模型（hand_landmark_lite），1=完整模型（hand_landmark_full）
```

## 项目结构

```
├── manifest.json              # MV3 配置
├── content.js                 # 内容脚本入口（注入 main world 脚本 + popup 通信）
├── content.css                # 面板样式
├── popup.html + popup.js      # 工具栏弹窗
├── icons\                     # 16/32/48/128 PNG 图标
├── src\
│   ├── inject.js              # 引导 + 摄像头 + 帧循环 + SPA 路由监听
│   ├── util\
│   │   ├── dom.js             # 等待元素 / elFromHtml
│   │   └── rect-tracker.js    # ResizeObserver + rAF 跟踪 <video> 矩形
│   ├── gesture\
│   │   ├── gestures.js        # 关键点索引 + 阈值 + 手势分类（调参在这里）
│   │   ├── engine.js          # MediaPipe Hands 包装
│   │   └── classifier.js      # 手势状态机（hold / 去抖 / 滑动）
│   ├── camera\
│   │   └── camera-manager.js  # getUserMedia + FPS + 错误本地化
│   ├── action\
│   │   └── action-mapper.js   # 手势 → <video> 操作
│   ├── panel\
│   │   └── panel.js           # 浮动面板 UI
│   └── vendor\                # MediaPipe Hands 本地资源（约 17MB）
│       ├── hands.js / hands.binarypb
│       ├── hands_solution_packed_assets.data / _loader.js
│       ├── hands_solution_simd_wasm_bin.js / .wasm
│       └── hand_landmark_lite.tflite / hand_landmark_full.tflite
└── README.md
```

## 架构

- **运行环境**：MV3 content script。`content.js`（隔离世界）负责把业务脚本注入到页面 **main world**，并桥接 popup 消息；其余逻辑在 main world 执行。
- **为什么注入 main world**：MediaPipe 内部会用 `<script>` 标签加载 WASM glue 和 assets loader，这些脚本运行在 main world。若 hands.js 留在隔离世界，两者 `window` 全局不互通，导致模型加载失败。
- **模块组织**：每个 `src/*.js` 是经典脚本，自行挂到 `window.BG` 命名空间，由 `content.js` 按依赖顺序注入。无需 webpack/vite/rollup。
- **MediaPipe 加载**：懒加载。`locateFile` 返回 `chrome-extension://` 协议下的本地 vendor 文件，完全离线可用。`.js` 走 `<script>`（满足 script-src），`.wasm`/`.data`/`.tflite` 走 fetch（bilibili 的 connect-src 放行 chrome-extension://）。
- **页面操作**：DOM 访问、`<video>.play()` / `pause()` / `muted` / `currentTime` / `volume` 在 main world 直接调用。
- **不挡字幕**：面板锚定到视频矩形右上角 + 12px 偏移（ResizeObserver 跟踪），距字幕（视频下方中心）至少半个视频高度。
- **SPA 兼容**：`pushState` / `popstate` 监听，B 站内点视频卡片自动重新绑定新 `<video>`。

## 排错

| 现象 | 处理 |
|---|---|
| 面板不出现 | 打开 DevTools Console 看 `[bg]` 日志；确认扩展已加载并启用；刷新页面 |
| 摄像头权限被拒 | 浏览器地址栏左侧小锁 → 重置权限 → 重新加载页面 |
| 摄像头被其他程序占用 | 关闭 Zoom / 会议软件 / OBS 等 |
| 模型加载失败（`ERR_FILE_NOT_FOUND`）| 检查 `src/vendor/` 是否 8 个文件齐全 |
| 手势识别不灵敏 | 见上文「参数调整」，先看 Console 的 `spread` 日志校准 |
| 面板挡字幕 | 拖动面板到任意位置，自动记忆到 localStorage |

## 开发

编辑 `src/*.js` 后，回到 `chrome://extensions/` 点扩展的 **重新加载**，再刷新 B 站页面生效。

## 已知限制

- 仅 Chromium 内核浏览器（Chrome / Edge / Brave 等）
- 单手检测，双手不被识别
- 必须授予摄像头权限（首次弹窗）
- 仅 HTTPS 的 bilibili.com / www.bilibili.com 子域生效
