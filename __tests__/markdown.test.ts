import { parseMarkdown, parseInline } from '../src/markdown';

describe('markdown в пузырях', () => {
  test('жирный', () => {
    expect(parseInline('Блюдо **Polpette** — вкусно')).toEqual([{ text: 'Блюдо ' }, { text: 'Polpette', bold: true }, { text: ' — вкусно' }]);
  });
  test('нумерованные и маркированные списки', () => {
    const b = parseMarkdown('1. **Борщ** — 300\n2. Рыба\n- гарнир\n* салат');
    expect(b.map((x: any) => x.kind === 'li' ? x.marker : x.kind)).toEqual(['1.', '2.', '•', '•']);
    expect((b[0] as any).spans[0]).toEqual({ text: 'Борщ', bold: true });
  });
  test('абзацы: пустая строка — отступ, хвостовые пустые отбрасываются', () => {
    const b = parseMarkdown('Привет\n\n\nПока\n\n');
    expect(b.map((x) => x.kind)).toEqual(['p', 'gap', 'p']);
  });
  test('заголовки и цитаты без решёток, одиночные * не ломают', () => {
    expect((parseMarkdown('## Итог')[0] as any).spans[0].text).toBe('Итог');
    expect((parseMarkdown('2 * 3 = 6')[0] as any).spans[0].text).toBe('2 * 3 = 6');
  });
});
