/** Лёгкий разбор markdown для пузырей ответов ИИ: **жирный**, списки «- »/«* »/«1. », абзацы. Без зависимостей. */
export interface Span { text: string; bold?: boolean }
export type Block =
  | { kind: 'p'; spans: Span[] }
  | { kind: 'li'; marker: string; spans: Span[] }
  | { kind: 'gap' };

export const parseInline = (src: string): Span[] => {
  const out: Span[] = [];
  const re = /\*\*([^*]+?)\*\*|__([^_]+?)__/g;
  let i = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > i) out.push({ text: src.slice(i, m.index) });
    out.push({ text: m[1] ?? m[2], bold: true });
    i = m.index + m[0].length;
  }
  if (i < src.length) out.push({ text: src.slice(i) });
  // одиночные * и ` остаются как есть; убираем markdown-заголовки/цитаты ниже, на уровне строки
  return out.length ? out : [{ text: '' }];
};

export const parseMarkdown = (text: string): Block[] => {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { if (blocks.length && blocks[blocks.length - 1].kind !== 'gap') blocks.push({ kind: 'gap' }); continue; }
    const li = /^\s*(?:[-*•]\s+|(\d+)[.)]\s+)(.*)$/.exec(line);
    if (li) { blocks.push({ kind: 'li', marker: li[1] ? li[1] + '.' : '•', spans: parseInline(li[2]) }); continue; }
    blocks.push({ kind: 'p', spans: parseInline(line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*>\s?/, '')) });
  }
  while (blocks.length && blocks[blocks.length - 1].kind === 'gap') blocks.pop();
  return blocks;
};
