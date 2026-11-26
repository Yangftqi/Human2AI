import { describe, expect, it } from 'vitest';
import {
  buildUserMessage,
  normalizeChatCompletionsUrl,
  normalizeModelsUrl,
  parseRoleplayOsAndStripNativeThink,
  resolvePersonasForDispatch,
  splitLeadingMentions,
} from '../llm/orchestrator';
import { BUILTIN_PERSONAS, DEFAULT_CONFIG } from '../../presets/builtinPersonas';

describe('orchestrator v0.3.0', () => {
  it('normalizes OpenAI-compatible chat and models URLs safely', () => {
    expect(normalizeChatCompletionsUrl('https://api.deepseek.com/v1/')).toBe(
      'https://api.deepseek.com/v1/chat/completions'
    );
    expect(
      normalizeModelsUrl('https://api.openai.com/v1/chat/completions')
    ).toBe('https://api.openai.com/v1/models');
  });

  it('strips native <think> CoT while preserving prompt-requested <os> inner drama', () => {
    // Mid-stream native <think> should be hidden completely
    const midNative = parseRoleplayOsAndStripNativeThink(
      '<think>The user wants me to act like Claude...'
    );
    expect(midNative.thinkText).toBe('');
    expect(midNative.outputText).toBe('');
    expect(midNative.isFilteringNativeThink).toBe(true);

    // Relay returns native <think> AND roleplay <os> + final output
    const relayCombined = parseRoleplayOsAndStripNativeThink(
      '<think>Native R1 reasoning here</think>\n<os>嗯，这句必须装个冷酷的逼</os>\n这句，我认。'
    );
    expect(relayCombined.thinkText).toBe('嗯，这句必须装个冷酷的逼');
    expect(relayCombined.outputText).toBe('这句，我认。');
  });

  it('splits leading QQ/WeChat @mentions while keeping mid-sentence @mentions intact', () => {
    const qqCase = splitLeadingMentions('@阴暗哥布林 柔情猫娘这一块');
    expect(qqCase.prefix).toBe('@阴暗哥布林 ');
    expect(qqCase.body).toBe('柔情猫娘这一块');

    // WeChat \u2005 separator + body @mention preserved
    const wechatCase = splitLeadingMentions(
      '@张三\u2005@李四 今晚八点记得叫上 @王五 一起开黑'
    );
    expect(wechatCase.prefix).toBe('@张三\u2005@李四 ');
    expect(wechatCase.body).toBe('今晚八点记得叫上 @王五 一起开黑');

    // Only @ inside body, none at head -> prefix empty
    const bodyOnly = splitLeadingMentions('我觉得 @阴暗哥布林 说得很有道理');
    expect(bodyOnly.prefix).toBe('');
    expect(bodyOnly.body).toBe('我觉得 @阴暗哥布林 说得很有道理');
  });

  it('triggers named easterEggs[] at exact probability and skips cards without easterEggs', () => {
    const gemini = BUILTIN_PERSONAS.find((p) => p.id === 'gemini')!;
    const hit = buildUserMessage('你好', 'rewrite', gemini, 'standard', () => 0.01);
    expect(hit.triggeredEasterEggs).toEqual(['极其复读死循环']);

    const miss = buildUserMessage('你好', 'rewrite', gemini, 'unhinged', () => 0.05);
    expect(miss.triggeredEasterEggs).toEqual([]);

    const deepseek = BUILTIN_PERSONAS.find((p) => p.id === 'deepseek')!;
    expect(deepseek.easterEggs).toBeUndefined();
    const dsRes = buildUserMessage('你好', 'rewrite', deepseek, 'unhinged', () => 0.0);
    expect(dsRes.triggeredEasterEggs).toEqual([]);

    // Claude v0.4.0: no Account Suspended in non-easter-egg prompts, 25% CN ban easter egg appends suspension instruction
    const claude = BUILTIN_PERSONAS.find((p) => p.id === 'claude')!;
    expect(claude.easterEggs?.[0]?.probability).toBe(0.25);
    expect(claude.prompts.rewriteUnhinged).not.toContain('触发 Account Suspended');
    expect(claude.prompts.replyUnhinged).not.toContain('触发 Account Suspended');

    const claudeMiss = buildUserMessage('你好', 'rewrite', claude, 'unhinged', () => 0.26);
    expect(claudeMiss.triggeredEasterEggs).toEqual([]);
    expect(claudeMiss.userContent).not.toContain('Account Suspended');

    const claudeHit = buildUserMessage('你好', 'rewrite', claude, 'standard', () => 0.24);
    expect(claudeHit.triggeredEasterEggs).toEqual(['检测到中国人封禁']);
    expect(claudeHit.userContent).toContain('先按照你的角色设定完整、自然、正常地说完');
    expect(claudeHit.userContent).toContain('Account Suspended');
  });

  it('dispatches single, random, and multi personas accurately', () => {
    const multi = resolvePersonasForDispatch(BUILTIN_PERSONAS, {
      ...DEFAULT_CONFIG,
      dispatchMode: 'multi',
      multiPersonaIds: ['deepseek', 'gemini'],
    });
    expect(multi.map((p) => p.id)).toEqual(['deepseek', 'gemini']);
  });
});
