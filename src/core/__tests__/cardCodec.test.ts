import { describe, expect, it } from 'vitest';
import {
  embedPersonaInPngBytes,
  exportPersonaAsH2aiBytes,
  extractPersonaFromPngBytes,
  importPersonaFromH2aiBytes,
} from '../persona/cardCodec';
import { BUILTIN_PERSONAS } from '../../presets/builtinPersonas';
import { PersonaCard } from '../types';

const MINIMAL_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 10, 73, 68, 65, 84,
  120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe('cardCodec', () => {
  it('embeds and extracts v3 PersonaCard with easterEggs[] inside PNG tEXt chunk losslessly', () => {
    const sample = BUILTIN_PERSONAS.find((p) => p.id === 'gemini')!;
    const embedded = embedPersonaInPngBytes(MINIMAL_PNG, sample);
    const extracted = extractPersonaFromPngBytes(embedded);

    expect(extracted.id).toBe(sample.id);
    expect(extracted.name).toBe(sample.name);
    expect(extracted.prompts.rewriteStandard).toBe(sample.prompts.rewriteStandard);
    expect(extracted.easterEggs?.length).toBe(1);
    expect(extracted.easterEggs?.[0].name).toBe('极其复读死循环');
    expect(extracted.easterEggs?.[0].probability).toBe(0.02);
    expect(extracted.visual.avatarDataUrl.startsWith('data:image/png;base64,')).toBe(
      true
    );
  });

  it('migrates legacy v1/v2 single easterEgg field to easterEggs[] on import', () => {
    const legacyCard: PersonaCard = {
      ...BUILTIN_PERSONAS[0],
      easterEggs: undefined,
      easterEgg: {
        enabled: true,
        probability: 0.1,
        appendInstruction: 'legacy instruction',
      },
    };
    const embedded = embedPersonaInPngBytes(MINIMAL_PNG, legacyCard);
    const extracted = extractPersonaFromPngBytes(embedded);

    expect(extracted.easterEgg).toBeUndefined();
    expect(extracted.easterEggs?.length).toBe(1);
    expect(extracted.easterEggs?.[0].promptInstruction).toBe('legacy instruction');
  });

  it('roundtrips full PersonaCard without easterEggs cleanly via .h2ai zip archive', () => {
    const sample = {
      ...BUILTIN_PERSONAS[0],
      visual: {
        ...BUILTIN_PERSONAS[0].visual,
        bgImageDataUrl: 'data:image/png;base64,AAAA',
      },
    };
    const zipBytes = exportPersonaAsH2aiBytes(sample);
    const restored = importPersonaFromH2aiBytes(zipBytes);

    expect(restored.name).toBe(sample.name);
    expect(restored.easterEggs).toBeUndefined();
    expect(restored.visual.bgImageDataUrl).toBe('data:image/png;base64,AAAA');
  });
});
