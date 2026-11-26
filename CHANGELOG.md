# Changelog

## v1.0.0 (2026-11-26) — First Official Public Release
- **Windows 图标兼容彻底修复**：重构 `src-tauri/icons/icon.ico` 为严格符合 Windows 规范的 `16~128px` 32-bit DIB BMP + `256px` PNG 混合多尺寸图标，解决资源管理器/任务栏/托盘图标显示旧图问题。
- **Android 正式版签名就绪**：启用独立正式 Release Keystore 签发，确保 `v1.0.0` 起所有后续版本可长期无缝覆盖升级。
- **公开版 README 与社区整活展示**：重写精简清爽主页 `README.md`，注明采用 **Gemini 4 Neon** 与 **Gemini 4 Carbon** 开发，补充角色卡规范入口，并在文末附上六大内置角色的 README 整活翻译版。

## v0.5.3 (2026-11-26) — Unified Dual-Platform App Icon & Creator Attribution Links
- **双端统一极简黑曜石新图标（方案 C · 双泡折光）**：
  - 全新纯矢量绘制后景磨砂人话气泡 + 前景纯白 AI 星芒气泡图标，统一替换 Windows 多分辨率 `.ico` / `.png`（含 16px 托盘至 256px 高分图标）以及 Android 全套 Adaptive Foreground + Background + 各密度 Mipmap / 圆标。
- **版权致谢规范化**：
  - 将 `ZipZipPipe` 署名统一精简为英文名，并在软件内「关于与版权致谢」卡片、`README.md`、`LICENSE-ASSETS` 补全 [ZipZipPipe](https://space.bilibili.com/4168597) 与 [上善无形](https://space.bilibili.com/4456176) 的 B 站主页直达链接。

## v0.5.1 (2026-11-26) — Public Release Readiness & Platform UI Cleanup
- **Windows 真·绿色便携存储**：
  - `src-tauri/src/lib.rs` 优先将配置、导入角色卡与历史摘录写入程序同级 `data\h2ai_store.json`（只读目录自动降级回退 `%APPDATA%`），首次启动自动从旧 `%APPDATA%` 无损迁移，并在桌面端设置页展示当前实际存储路径。
- **双端界面严格隔离**：
  - 偏好设置将 `保护句首 @昵称 前缀` 抽离为跨端「通用转译偏好」；
  - Windows 端隐藏所有 Android 悬浮窗 / 无障碍配置；Android 端隐藏 Windows 全局热键 / 进程黑名单及演练场 `Ctrl ↵` 桌面快捷键角标。
- **公开发行合规与分离开源授权**：
  - 新增 `LICENSE`（源代码 MIT）与 `LICENSE-ASSETS`（内置 AI 娘二创美术与设定遵循 CC BY-NC-SA 4.0，完整署名 [ZipZipPipe](https://space.bilibili.com/4168597) / [上善无形](https://space.bilibili.com/4456176)，禁止商用，声明非官方同人）；
  - 新增 `PRIVACY.md`、刷新 `README.md`，并在 App「偏好设置」底部新增「关于与版权致谢」卡片。
- **安全签名与自动化发布管线**：
  - 重构 `scripts/android-build.ps1`，彻底移除脚本内硬编码证书密码，改为按优先级读取环境变量 / 本地不入库 `.cache/signing.local.json`（缺失时降级带警示的本机临时证书）；
  - 升级 `scripts/release.ps1` 自动在 `release/dist/` 生成带版本号的 Windows 便携 `.zip`、Android 签名 `.apk` 与 `SHA256SUMS.txt`；
  - 新增 `.github/workflows/release.yml`，支持推送 `v*` tag 自动构建双端产物并生成 Draft Release。

## v0.5.0 (2026-11-26) — Android Overlay + Accessibility + PROCESS_TEXT + Quick Tile
- 彻底移除旧软键盘方案（`Human2AiImeService`），告别切换输入法的割裂手感。
- 新增 Android 吸边悬浮球（默认聚焦输入框「智能显形」，支持「始终常驻」与「仅磁贴/选词」）、预热常驻底部 62% 圆角毛玻璃悬浮抽屉（`#/overlay`）。
- 新增 `Human2AiAccessibilityService`：强制拦截密码框、自动读框、按需「抓屏选句」回怼，以及有句首 `@昵称` 时优先 `ACTION_SET_SELECTION + ACTION_PASTE` 保真写回。
- 新增零权限系统选词菜单 `PROCESS_TEXT`（「Human2AI 嘴替」）与系统通知栏快捷磁贴（QS Tile）。
- 主工坊偏好设置新增三步权限体检卡（含 Android 13+ 受限设置直达解锁入口）。

## v0.4.2 (2026-11-26) — Android Release Startup Fix & Hardening
- 修复 `scripts/android-build.ps1` 遗漏 `--features tauri/custom-protocol` 导致 Android Release APK 错误请求 `http://localhost:1420/index.html` 的严重问题，并新增 `.so` 内嵌前端资产校验断言。
- 适配 Android 15/16 Edge-to-Edge 安全区、放通局域网 HTTP / 混合内容 API、补齐原生 `copyToClipboard` 桥接。

## v0.4.1 — Editorial Obsidian Minimalism & Built-in Art Assets
- 全局升级黑曜石毛玻璃设计系统与角色卡安全区全身立绘渲染。
- 六大内置角色全套配备极简平涂全身背景与透明底萌系头像（内置卡版本升至 `v5`）。

## v0.3.0 — Dual-Platform Foundation & Persona Card v3
- 建立 React 19 + TypeScript + Tailwind v4 + Zustand + Tauri v2 双端架构。
- 实现原生 `<think>` 静默剥离 vs 玩梗 `<os>` 内心戏气泡、句首 `@昵称` 保护、角色专属多彩蛋 `easterEggs[]`、PNG `tEXt(h2ai_card_v1)` 与 `.h2ai` 皮肤包编解码。
