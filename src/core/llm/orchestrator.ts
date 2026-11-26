import {
  AppConfig,
  IntensityMode,
  PersonaCard,
  PersonaEasterEgg,
  SceneMode,
  TranslationResultItem,
} from '../types';

export function normalizeChatCompletionsUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('请先在设置中填写兼容 OpenAI 的 API Base URL');
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export function normalizeModelsUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('请先填写 API Base URL');
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed.slice(0, -'/chat/completions'.length) + '/models';
  }
  if (trimmed.endsWith('/models')) {
    return trimmed;
  }
  return `${trimmed}/models`;
}

export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  if (!apiKey.trim()) {
    throw new Error('请先填写 API Key 再拉取模型列表');
  }
  const endpoint = normalizeModelsUrl(baseUrl);
  const resp = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(
      `拉取模型列表失败 (HTTP ${resp.status})${errText ? `: ${errText.slice(0, 140)}` : ''}`
    );
  }
  const json = (await resp.json()) as {
    data?: Array<{ id?: string }>;
    models?: Array<{ id?: string; name?: string }>;
  };
  const rawList = Array.isArray(json.data)
    ? json.data.map((m) => m.id ?? '')
    : Array.isArray(json.models)
    ? json.models.map((m) => m.id ?? m.name ?? '')
    : [];

  const unique = Array.from(
    new Set(rawList.map((s) => s.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  if (unique.length === 0) {
    throw new Error('接口返回成功，但未解析到可用模型 ID');
  }
  return unique;
}

/**
 * Splits leading @mention prefixes (e.g. "@阴暗哥布林 柔情猫娘这一块" or WeChat "\u2005")
 * while keeping any @mentions inside the main body intact.
 */
export function splitLeadingMentions(rawInput: string): {
  prefix: string;
  body: string;
} {
  const match = rawInput.match(/^(\s*(?:@[^\s\u2005\u00a0]+[\u2005\u00a0 ]+)+)([\s\S]+)$/);
  if (!match) {
    return { prefix: '', body: rawInput };
  }
  const [, prefix, body] = match;
  if (!body.trim()) {
    return { prefix: '', body: rawInput };
  }
  return { prefix, body };
}

/**
 * Strips native reasoning CoT (<think>...</think>) emitted by reasoning models/relays,
 * while extracting roleplay inner monologue wrapped in <os>...</os>.
 */
export function parseRoleplayOsAndStripNativeThink(rawContent: string): {
  thinkText: string;
  outputText: string;
  isFilteringNativeThink: boolean;
} {
  // 1. Remove completed native <think>...</think> blocks
  let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. If currently streaming inside an unclosed native <think>, hide it until </think>
  const unclosedThinkIdx = cleaned.search(/<think>/i);
  let isFilteringNativeThink = false;
  if (unclosedThinkIdx !== -1) {
    cleaned = cleaned.slice(0, unclosedThinkIdx);
    isFilteringNativeThink = true;
  }

  cleaned = cleaned.trimStart();

  // 3. Parse prompt-requested roleplay inner drama <os>...</os>
  const openOsIdx = cleaned.indexOf('<os>');
  if (openOsIdx === -1) {
    return {
      thinkText: '',
      outputText: cleaned.trim(),
      isFilteringNativeThink,
    };
  }

  const closeOsIdx = cleaned.indexOf('</os>', openOsIdx);
  if (closeOsIdx === -1) {
    return {
      thinkText: cleaned.slice(openOsIdx + 4).trim(),
      outputText: cleaned.slice(0, openOsIdx).trim(),
      isFilteringNativeThink,
    };
  }

  const thinkText = cleaned.slice(openOsIdx + 4, closeOsIdx).trim();
  const outputText = (
    cleaned.slice(0, openOsIdx) + cleaned.slice(closeOsIdx + 5)
  ).trim();

  return { thinkText, outputText, isFilteringNativeThink };
}

export function normalizePersonaEasterEggs(card: PersonaCard): PersonaEasterEgg[] {
  if (Array.isArray(card.easterEggs)) {
    return card.easterEggs;
  }
  if (card.easterEgg && card.easterEgg.appendInstruction) {
    return [
      {
        id: `${card.id}-legacy-egg`,
        name: '专属概率彩蛋',
        enabled: card.easterEgg.enabled,
        probability: card.easterEgg.probability,
        promptInstruction: card.easterEgg.appendInstruction,
      },
    ];
  }
  return [];
}

export function selectSystemPrompt(
  persona: PersonaCard,
  sceneMode: SceneMode,
  intensity: IntensityMode
): string {
  if (sceneMode === 'rewrite') {
    return intensity === 'standard'
      ? persona.prompts.rewriteStandard
      : persona.prompts.rewriteUnhinged;
  }
  return intensity === 'standard'
    ? persona.prompts.replyStandard
    : persona.prompts.replyUnhinged;
}

export function buildUserMessage(
  bodyText: string,
  sceneMode: SceneMode,
  persona: PersonaCard,
  _intensity: IntensityMode,
  rng: () => number = Math.random
): { userContent: string; triggeredEasterEggs: string[] } {
  const basePrompt =
    sceneMode === 'rewrite'
      ? `【当前任务：同义风格转译（嘴替改写，严禁对话回复！）】\n请把 <source_text> 中“我”原本想说的话，完全站在“我”的立场、保留“我”的真实意思（包括正文中的任何 @提及），用你的专属八股风格重新表达一遍，代“我”发给聊天对象。\n⚠️ 严禁对 <source_text> 本身发表评论、吐槽、反问或对话回复！你就是“我”本人。只输出改写后的成品发言：\n<source_text>\n${bodyText}\n</source_text>`
      : `【当前任务：接话/回怼对方（对话回复模式）】\n下面 <incoming_message> 是聊天对象刚刚发给“我”的一句话。请你以“我”的第一人称立场，用你的专属八股风格直接回复、接话或回怼对方，只输出回复正文：\n<incoming_message>\n${bodyText}\n</incoming_message>`;

  const triggeredEasterEggs: string[] = [];
  let userContent = basePrompt;

  const eggs = normalizePersonaEasterEggs(persona);
  for (const egg of eggs) {
    if (!egg.enabled || !egg.promptInstruction.trim()) continue;
    const prob = Math.max(0, Math.min(1, egg.probability));
    if (rng() < prob) {
      triggeredEasterEggs.push(egg.name);
      userContent += `\n\n${egg.promptInstruction.trim()}`;
    }
  }

  return { userContent, triggeredEasterEggs };
}

export function resolvePersonasForDispatch(
  personas: PersonaCard[],
  config: AppConfig,
  rng: () => number = Math.random
): PersonaCard[] {
  const enabledList = personas.filter((p) => p.enabled);
  const pool = enabledList.length > 0 ? enabledList : personas;
  if (pool.length === 0) return [];

  if (config.dispatchMode === 'random') {
    const idx = Math.floor(rng() * pool.length);
    return [pool[idx]];
  }

  if (config.dispatchMode === 'multi') {
    const selected = pool.filter((p) => config.multiPersonaIds.includes(p.id));
    if (selected.length > 0) return selected;
  }

  const active =
    pool.find((p) => p.id === config.activePersonaId) ?? pool[0];
  return [active];
}

export interface StreamPersonaParams {
  persona: PersonaCard;
  inputText: string;
  config: AppConfig;
  signal?: AbortSignal;
  onUpdate: (item: TranslationResultItem) => void;
}

export async function streamPersonaTranslation({
  persona,
  inputText,
  config,
  signal,
  onUpdate,
}: StreamPersonaParams): Promise<TranslationResultItem> {
  const baseUrl = persona.modelOverride?.baseUrl?.trim() || config.api.baseUrl;
  const apiKey = persona.modelOverride?.apiKey?.trim() || config.api.apiKey;
  const modelName =
    persona.modelOverride?.modelName?.trim() || config.api.modelName;
  const temperature =
    persona.modelOverride?.temperature ?? config.api.temperature ?? 0.9;

  // Strip leading @mention only in rewrite mode when enabled
  const shouldSplitMention =
    config.sceneMode === 'rewrite' && (config.stripLeadingMention ?? true);
  const { prefix: leadingMentionPrefix, body: effectiveBody } = shouldSplitMention
    ? splitLeadingMentions(inputText)
    : { prefix: '', body: inputText };

  const systemPrompt = selectSystemPrompt(
    persona,
    config.sceneMode,
    config.intensity
  );
  const { userContent, triggeredEasterEggs } = buildUserMessage(
    effectiveBody,
    config.sceneMode,
    persona,
    config.intensity
  );

  const result: TranslationResultItem = {
    persona,
    status: 'streaming',
    rawText: '',
    thinkText: '',
    outputText: '',
    leadingMentionPrefix,
    triggeredEasterEggs,
  };
  onUpdate({ ...result });

  try {
    if (!apiKey.trim()) {
      throw new Error('尚未填写 API Key，请先在设置页配置');
    }

    const endpoint = normalizeChatCompletionsUrl(baseUrl);
    const resp = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: modelName.trim(),
        temperature,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(
        `API 返回 ${resp.status}${errBody ? `: ${errBody.slice(0, 180)}` : ''}`
      );
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!resp.body || contentType.includes('application/json')) {
      // Intentionally ignore native message.reasoning_content
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? '';
      const parsed = parseRoleplayOsAndStripNativeThink(content);
      const doneItem: TranslationResultItem = {
        ...result,
        status: 'done',
        rawText: content,
        thinkText: parsed.thinkText,
        outputText: parsed.outputText,
      };
      onUpdate(doneItem);
      return doneItem;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let contentAccum = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsedChunk = JSON.parse(dataStr) as {
            choices?: Array<{
              delta?: { content?: string };
              message?: { content?: string };
            }>;
          };
          // Native delta.reasoning_content is intentionally discarded
          const delta = parsedChunk.choices?.[0]?.delta;
          const msg = parsedChunk.choices?.[0]?.message;
          if (delta?.content) {
            contentAccum += delta.content;
          } else if (msg?.content && !contentAccum) {
            contentAccum = msg.content;
          }
        } catch {
          // Ignore partial or keepalive frames
        }
      }

      const parsed = parseRoleplayOsAndStripNativeThink(contentAccum);
      result.rawText = contentAccum;
      result.thinkText = parsed.thinkText;
      result.outputText = parsed.outputText;
      onUpdate({ ...result });
    }

    result.status = 'done';
    onUpdate({ ...result });
    return { ...result };
  } catch (err) {
    if (signal?.aborted) {
      return result;
    }
    const message = err instanceof Error ? err.message : String(err);
    const errItem: TranslationResultItem = {
      ...result,
      status: 'error',
      errorMessage: message,
    };
    onUpdate(errItem);
    return errItem;
  }
}

export async function testApiConnection(config: AppConfig): Promise<string> {
  const endpoint = normalizeChatCompletionsUrl(config.api.baseUrl);
  if (!config.api.apiKey.trim()) {
    throw new Error('请先输入 API Key');
  }
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.api.modelName.trim(),
      max_tokens: 32,
      stream: false,
      messages: [{ role: 'user', content: '回复“OK”即可' }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 160)}`);
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? '';
  const cleaned = parseRoleplayOsAndStripNativeThink(raw).outputText;
  return cleaned || '连接成功';
}
