import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { PersonaCard } from '../types';
import { normalizePersonaEasterEggs } from '../llm/orchestrator';

function upgradeImportedCard(parsed: PersonaCard): PersonaCard {
  const eggs = normalizePersonaEasterEggs(parsed);
  const cleaned: PersonaCard = {
    ...parsed,
    builtIn: false,
    easterEggs: eggs.length > 0 ? eggs : undefined,
  };
  delete cleaned.easterEgg;
  return cleaned;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const PNG_CARD_KEYWORD = 'h2ai_card_v1';

// Standard IEEE 802.3 CRC32 lookup table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function bytesToDataUrl(bytes: Uint8Array, mime = 'image/png'): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('无效的 Data URL');
  }
  const meta = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  if (meta.includes(';base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) |
      (buf[offset + 1] << 16) |
      (buf[offset + 2] << 8) |
      buf[offset + 3]) >>>
    0
  );
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeU32BE(chunk, 0, data.length);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  writeU32BE(chunk, 8 + data.length, crc32(crcInput));
  return chunk;
}

/**
 * Strip heavy base64 images when embedding inside PNG tEXt to keep card compact,
 * since the PNG itself carries the avatar artwork.
 */
function serializeCardForPng(card: PersonaCard): string {
  const slim: PersonaCard = {
    ...card,
    builtIn: false,
    visual: {
      ...card.visual,
      avatarDataUrl: '',
      bgImageDataUrl: undefined,
    },
  };
  return utf8ToBase64(JSON.stringify(slim));
}

export function embedPersonaInPngBytes(pngBytes: Uint8Array, card: PersonaCard): Uint8Array {
  if (!isPng(pngBytes)) {
    throw new Error('输入文件不是合法的 PNG 图片');
  }

  const chunks: Uint8Array[] = [PNG_SIGNATURE];
  let offset = 8;

  const keywordBytes = new TextEncoder().encode(PNG_CARD_KEYWORD);
  const payloadBytes = new TextEncoder().encode(serializeCardForPng(card));
  const textData = new Uint8Array(keywordBytes.length + 1 + payloadBytes.length);
  textData.set(keywordBytes, 0);
  textData[keywordBytes.length] = 0; // null separator
  textData.set(payloadBytes, keywordBytes.length + 1);
  const injectedChunk = makeChunk('tEXt', textData);

  let injected = false;
  while (offset + 12 <= pngBytes.length) {
    const length = readU32BE(pngBytes, offset);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    );
    const totalLen = 12 + length;
    if (offset + totalLen > pngBytes.length) {
      throw new Error('PNG Chunk 长度越界，文件可能已损坏');
    }

    const rawChunk = pngBytes.subarray(offset, offset + totalLen);

    if (type === 'tEXt') {
      const dataSlice = pngBytes.subarray(offset + 8, offset + 8 + length);
      const nulIdx = dataSlice.indexOf(0);
      const kw =
        nulIdx >= 0 ? new TextDecoder().decode(dataSlice.subarray(0, nulIdx)) : '';
      if (kw === PNG_CARD_KEYWORD) {
        // Skip older h2ai metadata chunk to avoid duplicates
        offset += totalLen;
        continue;
      }
    }

    if (type === 'IEND' && !injected) {
      chunks.push(injectedChunk);
      injected = true;
    }

    chunks.push(rawChunk);
    offset += totalLen;
  }

  if (!injected) {
    chunks.push(injectedChunk);
  }

  const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(totalSize);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}

export function extractPersonaFromPngBytes(pngBytes: Uint8Array): PersonaCard {
  if (!isPng(pngBytes)) {
    throw new Error('不是合法的 PNG 角色卡图片');
  }

  let offset = 8;
  while (offset + 12 <= pngBytes.length) {
    const length = readU32BE(pngBytes, offset);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    );
    const totalLen = 12 + length;
    if (offset + totalLen > pngBytes.length) {
      throw new Error('PNG 文件结构异常');
    }

    if (type === 'tEXt') {
      const dataSlice = pngBytes.subarray(offset + 8, offset + 8 + length);
      const nulIdx = dataSlice.indexOf(0);
      if (nulIdx > 0) {
        const kw = new TextDecoder().decode(dataSlice.subarray(0, nulIdx));
        if (kw === PNG_CARD_KEYWORD) {
          const b64 = new TextDecoder().decode(dataSlice.subarray(nulIdx + 1));
          const parsed = upgradeImportedCard(
            JSON.parse(base64ToUtf8(b64)) as PersonaCard
          );
          return {
            ...parsed,
            visual: {
              ...parsed.visual,
              avatarDataUrl: bytesToDataUrl(pngBytes, 'image/png'),
            },
          };
        }
      }
    }
    offset += totalLen;
  }

  throw new Error('该 PNG 图片中未找到 Human2AI 角色卡元数据 (h2ai_card_v1)');
}

/**
 * Browser-only helper: rasterizes SVG/WebP/DataURL avatar into a crisp 512x512 PNG
 * with theme badge fallback before injecting tEXt metadata.
 */
export async function exportPersonaAsPngBlob(card: PersonaCard): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法初始化 Canvas 渲染上下文');

  // Paint minimalist dark obsidian backdrop with subtle persona radial glow (ideal for transparent chibi avatars)
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, 512, 512);
  const glow = ctx.createRadialGradient(256, 236, 24, 256, 256, 260);
  glow.addColorStop(0, `${card.visual.primaryColor || '#38bdf8'}38`);
  glow.addColorStop(1, 'rgba(9, 9, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);

  if (card.visual.avatarDataUrl) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 36, 36, 440, 440);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = card.visual.avatarDataUrl;
    });
  }

  // Subtle card watermark ribbon at bottom
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(0, 448, 512, 64);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(card.name.slice(0, 22), 24, 488);
  ctx.fillStyle = card.visual.secondaryColor || '#38bdf8';
  ctx.font = '16px monospace';
  ctx.fillText('Human2AI Card', 356, 487);

  const rawPngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 编码失败'));
    }, 'image/png');
  });

  const rawBytes = new Uint8Array(await rawPngBlob.arrayBuffer());
  const injected = embedPersonaInPngBytes(rawBytes, card);
  return new Blob([injected.slice().buffer], { type: 'image/png' });
}

export function exportPersonaAsH2aiBytes(card: PersonaCard): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const manifest: PersonaCard = {
    ...card,
    builtIn: false,
    visual: {
      ...card.visual,
      avatarDataUrl: card.visual.avatarDataUrl ? '__asset_avatar__' : '',
      bgImageDataUrl: card.visual.bgImageDataUrl ? '__asset_bg__' : undefined,
    },
  };

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  if (card.visual.avatarDataUrl) {
    files['avatar.txt'] = strToU8(card.visual.avatarDataUrl);
  }
  if (card.visual.bgImageDataUrl) {
    files['background.txt'] = strToU8(card.visual.bgImageDataUrl);
  }

  return zipSync(files, { level: 6 });
}

export function importPersonaFromH2aiBytes(archiveBytes: Uint8Array): PersonaCard {
  const entries = unzipSync(archiveBytes);
  const manifestRaw = entries['manifest.json'];
  if (!manifestRaw) {
    throw new Error('无效的 .h2ai 皮肤包：缺少 manifest.json');
  }
  const card = upgradeImportedCard(
    JSON.parse(strFromU8(manifestRaw)) as PersonaCard
  );
  const avatarDataUrl = entries['avatar.txt'] ? strFromU8(entries['avatar.txt']) : '';
  const bgImageDataUrl = entries['background.txt']
    ? strFromU8(entries['background.txt'])
    : undefined;

  return {
    ...card,
    visual: {
      ...card.visual,
      avatarDataUrl,
      bgImageDataUrl,
    },
  };
}
