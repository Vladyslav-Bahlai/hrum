import { dayKeyAt, getDayStart, logicalAt, setDayStart, todayKey } from '../src/utils';
import { dropIndex, hiddenOnlineSets, moveSourceTo, normalizeIconSettings } from '../src/iconify';
import { entryTimestamp } from '../src/logic';

describe('граница дня', () => {
  beforeEach(() => setDayStart(4));
  it('ночь до начала нового дня относится к вчерашнему дню', () => {
    expect(dayKeyAt(new Date(2026, 10, 7, 0, 30).getTime())).toBe('2026-11-06');
    expect(dayKeyAt(new Date(2026, 10, 7, 3, 59).getTime())).toBe('2026-11-06');
    expect(dayKeyAt(new Date(2026, 10, 7, 4, 0).getTime())).toBe('2026-11-07');
  });
  it('настройка применяется и ограничена 0…11', () => {
    setDayStart(0);
    expect(dayKeyAt(new Date(2026, 10, 7, 0, 30).getTime())).toBe('2026-11-07');
    setDayStart(99);
    expect(getDayStart()).toBe(4);
    expect(typeof todayKey()).toBe('string');
  });
  it('запись в 00:30 дня 6 ноября идёт после вечерней, а не первой', () => {
    const night = logicalAt('2026-11-06', 30);
    const evening = logicalAt('2026-11-06', 20 * 60);
    expect(night).toBeGreaterThan(evening);
    expect(new Date(night).getDate()).toBe(7);
    expect(logicalAt('2026-11-06', 5 * 60)).toBeLessThan(evening);
  });
  it('правка времени записи сохраняет точную метку, если минуты не менялись', () => {
    const ts = new Date(2026, 10, 7, 0, 30, 15).getTime();
    expect(entryTimestamp(ts, '2026-11-06', 30)).toBe(ts);
    expect(entryTimestamp(ts, '2026-11-06', 45)).toBe(logicalAt('2026-11-06', 45));
  });
});

describe('источники иконок: перетаскивание и онлайн-наборы', () => {
  it('dropIndex определяет новое место по сдвигу пальца', () => {
    const h = [60, 60, 60, 60];
    expect(dropIndex(h, 0, 0, 10)).toBe(0);
    expect(dropIndex(h, 0, 75, 10)).toBe(1);
    expect(dropIndex(h, 0, 160, 10)).toBe(2);
    expect(dropIndex(h, 3, -200, 10)).toBe(0);
    expect(dropIndex(h, 1, 9999, 10)).toBe(3);
  });
  it('moveSourceTo переставляет источник', () => {
    const st = normalizeIconSettings(undefined);
    const ids = st.sources.map((s) => s.id);
    const r = moveSourceTo(st, 0, 2);
    expect(r.sources.map((s) => s.id)).toEqual([ids[1], ids[2], ids[0], ...ids.slice(3)]);
    expect(moveSourceTo(st, 1, 1)).toBe(st);
    expect(moveSourceTo(st, 0, 99)).toBe(st);
  });
  it('hiddenOnlineSets скрывает скачанные и стоящие выше Iconify паки', () => {
    const st = normalizeIconSettings(undefined);
    const packs = st.sources.filter((s) => s.id.startsWith('pack:')).map((s) => s.id.slice(5));
    const oi = st.sources.findIndex((s) => s.id === 'online');
    const above = st.sources.slice(0, oi).filter((s) => s.id.startsWith('pack:')).map((s) => s.id.slice(5));
    const hidden = hiddenOnlineSets(st, { [packs[packs.length - 1]]: { bytes: 1 } });
    for (const a of above) expect(hidden.has(a)).toBe(true);
    expect(hidden.has(packs[packs.length - 1])).toBe(true);
  });
});
