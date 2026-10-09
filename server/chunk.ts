
export interface Chunk {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

const TARGET = 1400;
const OVERLAP = 200;

export function splitIntoChunks(fullText: string): Chunk[] {
  const paragraphs = fullText.split(/\n{2,}/);
  const chunks: Chunk[] = [];
  let buf = '';
  let bufStart = 0;
  let offset = 0;

  const flush = (endOffset: number) => {
    const text = buf.trim();
    if (text) {
      chunks.push({
        index: chunks.length,
        text,
        startOffset: bufStart,
        endOffset,
      });
    }
  };

  for (const para of paragraphs) {
    const paraStart = fullText.indexOf(para, offset);
    offset = paraStart + para.length;

    if (buf.length + para.length + 2 <= TARGET) {
      if (!buf) bufStart = paraStart;
      buf += (buf ? '\n\n' : '') + para;
      continue;
    }

    flush(paraStart);

    const tail = buf.slice(Math.max(0, buf.length - OVERLAP));
    if (para.length > TARGET) {
      let pos = 0;
      while (pos < para.length) {
        const slice = para.slice(pos, pos + TARGET);
        chunks.push({
          index: chunks.length,
          text: (pos === 0 ? tail : '') + slice,
          startOffset: paraStart + pos,
          endOffset: paraStart + Math.min(pos + TARGET, para.length),
        });
        pos += TARGET - OVERLAP;
      }
      buf = '';
      bufStart = paraStart + para.length;
    } else {
      buf = tail ? tail + '\n\n' + para : para;
      bufStart = paraStart + para.length - buf.length;
    }
  }

  flush(fullText.length);
  return chunks;
}
