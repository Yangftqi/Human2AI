# Human2AI 角色卡格式规范（Persona Card Specification v3）

本文档定义了 **Human2AI（v0.3.0+）** 角色设定档的数据结构、内心戏标签约定、专属概率彩蛋协议，以及 **酒馆风 PNG 隐写角色卡（`.png`）** 与 **完整皮肤包（`.h2ai`）** 的封装标准。社区创作者可按此规范手工编写或借助大模型批量生成新角色卡。

---

## 一、 核心 JSON Schema（`PersonaCard` v3）

```json
{
  "id": "extremely-cat-gemini",
  "name": "极其猫 · Gemini",
  "tagline": "生理戏精 / 华丽八股王 / 2%复读彩蛋",
  "badge": "华丽戏精",
  "builtIn": false,
  "enabled": true,
  "version": 3,
  "visual": {
    "primaryColor": "#8B5CF6",
    "secondaryColor": "#A78BFA",
    "gradientCss": "linear-gradient(135deg, rgba(139,92,246,0.30), rgba(30,27,75,0.94))",
    "avatarDataUrl": "data:image/png;base64,...",
    "bgImageDataUrl": "data:image/webp;base64,...",
    "bgOverlayOpacity": 0.72
  },
  "prompts": {
    "rewriteStandard": "嘴替改写 · 标准八股味 System Prompt...",
    "rewriteUnhinged": "嘴替改写 · 200% 发癫玩梗版 System Prompt...",
    "replyStandard": "接话回怼对方 · 标准八股味 System Prompt...",
    "replyUnhinged": "接话回怼对方 · 200% 发癫玩梗版 System Prompt..."
  },
  "easterEggs": [
    {
      "id": "gemini-extremely-loop",
      "name": "极其复读死循环",
      "description": "句末情绪顶点处 2% 概率丝滑卡入“极其极其……”无限复读故障",
      "enabled": true,
      "probability": 0.02,
      "promptInstruction": "【低概率故障彩蛋已触发！请务必保证自然流畅的前文衔接】：..."
    }
  ],
  "modelOverride": {
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "",
    "modelName": "deepseek-chat",
    "temperature": 0.95
  }
}
```

---

## 二、 字段详细说明

### 1. 基础标识字段
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `id` | `string` | 是 | 唯一英文/短横线标识符（导入冲突时客户端会自动追加短随机后缀）。 |
| `name` | `string` | 是 | 展示名称，建议格式 `二创外号 · 模型名`（胶囊栏紧凑视图会自动截取 `·` 前半段显示）。 |
| `tagline` | `string` | 是 | 一句话口癖特征简介（展示在演练场与工坊卡片副标题）。 |
| `badge` | `string` | 是 | 2～4 字短角标（如 `冷硬八股`、`太极叠甲`、`端庄克味`）。 |
| `enabled` | `boolean` | 是 | 是否加入「🎲 随机盲盒」抽取池。 |
| `version` | `number` | 是 | 规范版本号，当前最新为 `3`。 |

### 2. 视觉皮肤（`visual`）
| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `primaryColor` | `string` | 是 | 角色主题主色（HEX，如 `#0EA5E9`），用于按钮高亮、光晕和卡片角标。 |
| `secondaryColor` | `string` | 是 | 辅助高亮色（HEX）。 |
| `gradientCss` | `string` | 是 | 面板渐变背景 CSS 字符串。 |
| `avatarDataUrl` | `string` | 是 | 二次元头像 Data URL（PNG 角色卡导出时该字段会被置空以减小元数据体积，导入时自动以 PNG 图片本身作为头像）。 |
| `bgImageDataUrl` | `string` | 否 | 面板专属背景立绘 Data URL（需随卡分享高清背景图时请导出为 `.h2ai` 格式）。 |
| `bgOverlayOpacity` | `number` | 是 | 背景遮罩浓度（`0.30 ~ 0.95`，推荐 `0.72` 以确保文字清晰可读）。 |

### 3. 四象限提示词矩阵（`prompts`）与标签约定
客户端会根据用户当前所选模式注入对应包裹标签，编写角色提示词时请遵循以下协议：
1. **嘴替改写模式（`rewriteStandard` / `rewriteUnhinged`）**：
   - 用户原话会被包裹在 `<source_text>...</source_text>` 中传入（若开启了句首 `@昵称 ` 保护，句首 `@` 已被提前剥离，上屏时由客户端自动还原）。
   - **提示词铁律**：必须指示模型站在说话人第一人称立场做**同义风格转译**，严禁对 `<source_text>` 本身发表评论、吐槽或对话回复。
2. **接话回怼模式（`replyStandard` / `replyUnhinged`）**：
   - 对方发来的消息会被包裹在 `<incoming_message>...</incoming_message>` 中传入，模型需替用户以第一人称直接回复或回怼对方。
3. **玩梗内心戏标签 `<os>...</os>`（重要！防原生推理串台机制）**：
   - 为屏蔽 DeepSeek-R1 / QwQ 等推理模型原生返回的 `reasoning_content` 与原生 `<think>...</think>`，**客户端会自动静默剥离一切 `<think>...</think>` 标签**。
   - 若你的角色（如 200% 发癫档）需要演出“内心戏泄露”气泡，**必须在提示词中要求模型使用 `<os>...</os>` 标签包裹内心戏**！客户端会将其渲染为可折叠的「`<os>` 玩梗内心戏泄露」组件，且复制/上屏正文时不会混入 `<os>` 内容。

### 4. 角色专属概率触发彩蛋（`easterEggs?: PersonaEasterEgg[]`）
- **按需配置原则**：并非所有角色都需要概率彩蛋！若角色无概率触发机制，请直接省略 `easterEggs` 字段（或传空数组），工坊卡片、编辑器与运行结果页将**完全不显示任何彩蛋标识**。
- 当配置了 1 个或多个彩蛋词条时，每次请求客户端会对每条 `enabled: true` 的彩蛋独立投掷 `[0, 1)` 随机数：
  - `id` (`string`)：彩蛋唯一 ID。
  - `name` (`string`)：彩蛋名称（如 `"极其复读死循环"`），命中时会在生成结果卡片头部点亮 **`✨ 极其复读死循环`** 专属徽章。
  - `description` (`string`, 可选)：效果简述，鼠标悬停在工坊卡片彩蛋徽章上时展示。
  - `probability` (`number`)：精确触发概率（`0.01 ~ 1.0`，例如 `0.02` 代表严格的 2%）。
  - `promptInstruction` (`string`)：命中时自动追加在本次 User Message 末尾的隐藏导演指令（注意要求模型做好前文自然衔接）。

---

## 三、 文件分发封装标准

### 1. 酒馆风 PNG 隐写角色卡（`.png`）
- **载体**：标准 `512×512`（或任意尺寸）RGBA PNG 图像文件。
- **元数据块**：在 `IEND` 块之前插入标准 PNG `tEXt` 数据块（含标准 IEEE 802.3 CRC32 校验）：
  - **Keyword**：`h2ai_card_v1`（ASCII，后跟 1 字节 `0x00` 分隔符）。
  - **Text Payload**：将 `PersonaCard` JSON 字符串（剥离 `avatarDataUrl` 与 `bgImageDataUrl`）经 **UTF-8 字节编码后再做 Base64** 得到的纯 ASCII 字符串。

### 2. 完整皮肤压缩包（`.h2ai`）
- 本质为标准 Deflate ZIP 归档（后缀 `.h2ai`），内部包含：
  - `manifest.json`：`PersonaCard` JSON 元数据。
  - `avatar.txt`（可选）：头像原始 Data URL。
  - `background.txt`（可选）：高清面板背景图原始 Data URL。
