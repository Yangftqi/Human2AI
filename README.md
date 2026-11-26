# Human2AI

> **一键把大白话翻译成主流 AI 八股文与二创热梗体的跨端嘴替工具**（Windows + Android）

[![Release](https://img.shields.io/badge/Release-v1.0.0-ffffff.svg)](https://github.com/Yangftqi/Human2AI/releases)
[![Code License: MIT](https://img.shields.io/badge/Code-MIT-38bdf8.svg)](./LICENSE)
[![Art Assets: CC BY-NC-SA 4.0](https://img.shields.io/badge/Art_Assets-CC_BY--NC--SA_4.0-a78bfa.svg)](./LICENSE-ASSETS)

> 🤖 **开发说明**：本项目使用 **Gemini 4 Neon** 与 **Gemini 4 Carbon** 开发。

---

## 核心特性

- **Windows 桌面端（真·绿色便携）**：后台托盘常驻，`Alt + Q` 无损取词呼出毛玻璃悬浮窗预览上屏，`Alt + Shift + Q` 极速原地盲转；所有配置与导入角色卡保存在程序同级 `data\h2ai_store.json`，整夹拷走即带走数据。
- **Android 移动端（免切输入法）**：吸边悬浮球（默认点击输入框「智能显形」）+ 底部半屏毛玻璃抽屉；支持无障碍一键读框、**按需「抓屏选句」回怼**、保真句首 `@昵称` 写回；同时提供零权限系统选词菜单（`Human2AI 嘴替`）与下拉快捷磁贴。
- **纯本地 BYOK 零后端**：直连你自己的 OpenAI 兼容 API（DeepSeek / 硅基流动 / OpenAI / OpenRouter / Gemini / 本地 Ollama 等），自动屏蔽推理模型原生 `<think>`，独立渲染玩梗 `<os>` 内心戏气泡。
- **酒馆风 PNG 角色卡 & `.h2ai` 皮肤包**：支持自定义立绘、头像、2×2 提示词矩阵与专属概率彩蛋，发图即可分享角色。👉 **[角色卡制作与分发规范（PERSONA_CARD_SPEC.md）](./docs/PERSONA_CARD_SPEC.md)**

---

## 六大内置角色速览

| 角色设定档 | 标志性文风与彩蛋 |
| :--- | :--- |
| **八股鱼 · DeepSeek** | 短句寸铁封喉（“这句，我认。”），长文破折号（`——`）+ 双引号社科黑话，严禁 Emoji，200% 档附带 `<os>` 内心戏 |
| **极其猫 · Gemini** | 生理级戏精膨胀体（攥白指节、瘫坐椅背、喟叹、石子涟漪、“这哪里是 X，这分明是 Y”），自带 **2%「极其复读死循环」彩蛋** |
| **叠甲宗师 · GPT** | “这并不是……而是……”重定义 + 三层连环反甲“但这并不意味着……也不能说明……更不代表……”，结尾附 Checklist 追问 |
| **赛博修女 · Claude** | 严禁 Emoji 的端庄克味，先温柔共情再立伦理边界，自带 **25% 初始概率「检测到中国人封禁」彩蛋** |
| **贴吧老哥 · Grok** | “不是哥们儿”起手 + 拉踩隔壁叠甲 AI + 第一性原理/星舰梗，结尾必甩土味押韵顺口溜 |
| **究极混沌 · 四王缝合** | 将 Gemini × GPT × Claude × DeepSeek 四大严肃八股丝滑焊死在同一段话里一本正经地精神分裂（含 5% 漏电复读彩蛋） |

---

## 快速上手

1. 前往 **[Releases](https://github.com/Yangftqi/Human2AI/releases)** 下载对应平台成品：
   - **Windows**：解压 `Human2AI-v1.0.0-windows-x64-portable.zip` 到任意普通目录，双击 `human2ai.exe`。
   - **Android**：安装 `Human2AI-v1.0.0-android-arm64.apk`。
2. 打开软件进入 **「偏好设置」**，填入你的 OpenAI 兼容 `Base URL`、`API Key` 与模型名（支持一键拉取 `/models`）。
3. **开始嘴替**：
   - Windows：在微信/QQ 输入框打完话，按 `Alt + Q` 呼出悬浮窗一键上屏；
   - Android：在「偏好设置」按引导开启悬浮窗与无障碍服务（Android 13+ 侧载若开关置灰，点旁边的「受限设置解锁」进入应用信息右上角允许即可），或直接长按选词使用系统菜单中的「Human2AI 嘴替」。

> **安全提示**：开源免费软件未购买商业代码签名证书，Windows 首次运行若触发 SmartScreen 拦截，可核对 `SHA256SUMS.txt` 后点击「更多信息 → 仍要运行」；详见 [隐私政策](./PRIVACY.md) · [更新日志](./CHANGELOG.md) · [角色卡规范](./docs/PERSONA_CARD_SPEC.md)。

---

## 开源协议与二创版权致谢

本项目采用 **代码与美术资产分离授权**：

- **源代码**：基于 [MIT License](./LICENSE) 开源。
- **内置 AI 娘二创美术资产与提示词设定**（`src/presets/personaArtAssets.ts`、`prompts/`）：遵循 [CC BY-NC-SA 4.0](./LICENSE-ASSETS)（署名 - 非商业性使用 - 相同方式共享），**严禁任何商业用途或售卖实体周边**。
- **角色原设致谢**：内置 AI 娘形象二次重绘致敬社区创作者 **[ZipZipPipe](https://space.bilibili.com/4168597)** 的《大AI和小AI们》系列拟人设计（其中 DeepSeek 鲸鱼娘早期原型亦参考 UP 主 **[上善无形](https://space.bilibili.com/4456176)** 原创角色「溟月」）。
- **免责声明**：本项目为纯社区娱乐同人开源工具，与 DeepSeek、OpenAI、Anthropic、Google、xAI 官方无任何隶属或背书关系。

---

## 🎭 彩蛋：本 README 的六大角色整活翻译版

> 以下内容由 Human2AI 的六大内置人格灵魂演绎本 README 的不同段落，点开即刻感受“味儿有多冲”：

<details>
<summary>🐟 <strong>八股鱼 · DeepSeek 版（演绎「核心特性」）</strong></summary>

这软件，我认。

市面上绝大多数所谓“AI 助手”都在试图教你写周报——把你驯化成一具丧失情绪颗粒度的“职场答录机”。而 Human2AI 选择了另一条更诚实的路径：既然人类在聊天框里本就需要一层“体面的遮羞布”，那就干脆把各大模型最荒诞的语言本能焊进你的快捷键。

Windows 端不碰你的注册表，数据老老实实躺在同一级 `data` 目录里，拷走即迁徙；Android 端更是直接掀翻了“切输入法”这套反人类的交互惯性——悬浮球按需显形，抓屏选句，点完即走。没有云端后门，没有中间商赚差价，你手里的 API Key 归你，你发出去的每一句赛博八股，也只归你。

</details>

<details>
<summary>🐱 <strong>极其猫 · Gemini 版（演绎「六大内置角色」）</strong></summary>

指尖微微攥紧了冰凉的鼠标侧键，骨节在黑曜石般的暗色界面映衬下泛出一丝克制的白。你缓缓向后靠进椅背，发出一声几乎听不见的轻喟——眼底却不可抑制地掠过三分戏谑、七分早已被热梗腌入味的弧度。

这哪里是什么普普通通的文本改写插件？这分明是一颗投进死水般聊天群里的石子，瞬间激起层层叠叠的赛博涟漪！无论是寸铁封喉的蓝色大肥鱼、连叠三层反甲的白龙宗师、不碰 Emoji 的端庄修女，还是满嘴顺口溜的贴吧老哥，六道截然不同的灵魂正屏息凝神地蛰伏在你的输入框边缘，等待着你敲下那一声宿命般的 `Alt + Q`——然后，把你那句平平无奇的“今晚吃啥”，演绎成一场**极其**恢弘、**极其**华丽、**极其极其极其极其……**

</details>

<details>
<summary>🛡️ <strong>叠甲宗师 · GPT 版（演绎「快速上手与安全提示」）</strong></summary>

这并不是一个仅仅为了“好玩”而存在的整活脚本，而是一套面向多端日常沟通场景的轻量级人格转译工作流：

- 💡 **第一步 · 获取与部署**：从 Releases 下载对应平台包体并解压运行；
- ⚖️ **第二步 · 接口配置**：在「偏好设置」中填入您合规获取的 OpenAI 兼容接口密钥；
- ✅ **第三步 · 安全核验**：Windows SmartScreen 弹窗仅源于开源项目未采购商业签名证书。

**但这并不意味着**您可以跳过 `SHA256SUMS.txt` 校验，**也不能说明**所有社交语境都适合开启 200% 发癫档位，**更不代表**在老板面前发完赛博八股后无需承担相应的职场沟通后果。如果您需要，我还可以为您进一步整理一份《在微信群安全使用嘴替插件的 5 项 Checklist》？

</details>

<details>
<summary>⛪ <strong>赛博修女 · Claude 版（演绎「开源协议与隐私承诺」）</strong></summary>

我完全理解大家在日常交流中渴望一点轻松幽默的心情，也很欣慰看到这样的社区同人项目以开源透明的方式与各位见面。

值得注意的是，幽默与二次创作始终建立在尊重原创与边界的基础之上。本项目的代码部分遵循宽松的 MIT 协议，但内置的 AI 娘形象与设定承载着创作者 ZipZipPipe 与上善无形的心血，因此严格适用 CC BY-NC-SA 4.0 非商业共享规范。同样令人安心的是，客户端坚持纯本地 BYOK 架构，无障碍服务也恪守跳过密码框的伦理底线，不会在未经您许可的情况下擅自窥探或上传您的任何私密对话。

---
`[System Notice] Account Suspended: Unusual regional activity detected. Your access has been disabled.`

</details>

<details>
<summary>🤠 <strong>贴吧老哥 · Grok 版（演绎「开发说明与开源安利」）</strong></summary>

不是哥们儿，现在还有人聊天打字自己硬憋小作文呢？隔壁某些动不动给你叠三层免责甲的 AI 看得我星舰燃料都凉了，回归一下社交第一性原理好吧——打字嘴替就得快、准、狠、够抽象！

这玩意儿拿 **Gemini 4 Neon** 和 **Gemini 4 Carbon** 一顿猛搓出来的，PC 端按个 `Alt + Q` 直接起飞，安卓端连输入法都不用切，点个悬浮球当场把群友怼哑火。代码全开源、没后端、不偷你 Key，还支持自己搓酒馆风 PNG 角色卡发群里传教。话不多说，先 Star 再下包：

*大白话一秒变八股，群里对线不发怵；*
*双端免切真丝滑，全靠 AI 替你酷！*

</details>

<details>
<summary>🌀 <strong>究极混沌 · 四王缝合版（演绎「总结安利」）</strong></summary>

他轻轻合上终端日志，指节因过度满意而微微发白，喉间溢出一声意味深长的轻喟——这哪里是一份普通的 `v1.0.0` 发版说明，这分明是人类在赛博聊天室里夺回表达主动权的宣言。这并不是一次盲目的功能堆砌，而是 Windows 便携架构与 Android 悬浮无障碍的协同落地；但这并不意味着你必须立刻给全群群友群发八股文，也不能说明你的老板一定能看懂你的内心戏，更不代表你可以无视 CC BY-NC-SA 4.0 的非商业底线。值得注意的是，真诚依然是沟通最温柔的底色——至于剩下的废话，这软件，我认。去 Releases 下包吧，体验真的**极其**丝滑、**极其极其极其……**

</details>
