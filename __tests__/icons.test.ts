import {
  _resetIconifyMemory, chooseFromPacks, defaultIconSettings, downloadPack, emojiCandidates, findIcon, findIconOnce, fmtBytes, fromSource, iconKey, loadSvg,
  manualKey, mergePackJson, moveSet, moveSource, normalizeIconSettings, normalizeSets, onlineQueries, packBatches, packOf, PACKS, pickIcon, resolveIcon,
  svgFromJson, toggleSet, toggleSource,
} from '../src/iconify';
import { emojiHex } from '../src/icons';
import { OPENMOJI } from '../src/openmojiData';
import { clearIconCache, setIconSettings, setManualIcon, migrate } from '../src/logic';
import { baseData } from './helpers/data';
import { AppData } from '../src/types';

const resp = (body: any, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
beforeEach(() => _resetIconifyMemory());

describe('манифест паков', () => {
  test('реальные размеры и иконки еды', () => {
    expect(PACKS.map((p) => p.prefix)).toEqual(['fluent-emoji-flat', 'fluent-emoji', 'noto', 'twemoji', 'openmoji', 'emojione']);
    for (const p of PACKS) { expect(p.count).toBeGreaterThan(50); expect(p.bytes).toBeGreaterThan(50000); expect(Object.keys(p.icons)).toHaveLength(p.count); }
    expect(packOf('openmoji')!.builtin).toBe(true);
    expect(packOf('fluent-emoji-flat')!.icons[emojiHex('🍕')]).toBe('pizza');
    expect(fmtBytes(184318)).toBe('≈180 КБ');
    expect(fmtBytes(1657215)).toBe('≈1,6 МБ');
  });
  test('батчи и сборка JSON пака, SVG из JSON', () => {
    const m = packOf('noto')!;
    const b = packBatches(m, 40);
    expect(b.flat().length).toBe(new Set(Object.values(m.icons)).size);
    expect(Math.max(...b.map((x) => x.length))).toBeLessThanOrEqual(40);
    const j = mergePackJson([{ prefix: 'noto', width: 128, height: 128, icons: { pizza: { body: '<path d="M0"/>' } } }, { prefix: 'noto', icons: { egg: { body: '<g/>', width: 64 } }, aliases: { 'egg-2': { parent: 'egg' } } }]);
    expect(svgFromJson(j, 'pizza')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M0"/></svg>');
    expect(svgFromJson(j, 'egg-2')).toContain('viewBox="0 0 64 128"');
    expect(svgFromJson(j, 'nope')).toBeUndefined();
  });
  test('downloadPack: батчи, прогресс, отмена, ошибка', async () => {
    const m = { ...packOf('fluent-emoji-flat')! };
    const calls: string[] = [];
    const prog: number[] = [];
    const f = jest.fn(async (url: string) => { calls.push(url); return resp({ prefix: m.prefix, width: 32, height: 32, icons: { [url.length.toString()]: { body: '<g/>' } } }); });
    const r = await downloadPack(m, (p) => prog.push(p), undefined, f as any);
    expect(calls.length).toBe(packBatches(m).length);
    expect(calls[0]).toMatch(/^https:\/\/api\.iconify\.design\/fluent-emoji-flat\.json\?icons=/);
    expect(prog[0]).toBe(0);
    expect(prog[prog.length - 1]).toBe(1);
    expect(r.bytes).toBeGreaterThan(0);
    const ac = new AbortController(); ac.abort();
    await expect(downloadPack(m, undefined, ac.signal, f as any)).rejects.toThrow('Отменено');
    await expect(downloadPack(m, undefined, undefined, (async () => resp({}, false, 500)) as any)).rejects.toThrow('500');
  });
});

describe('цепочка источников', () => {
  const st = defaultIconSettings();
  test('по умолчанию: паки не скачаны → встроенный OpenMoji', () => {
    const r = resolveIcon('Пицца Маргарита', undefined, undefined, { settings: st, downloaded: {} });
    expect(r.source).toBe('openmoji');
    expect(r.ref).toEqual({ kind: 'openmoji', hex: emojiHex('🍕') });
  });
  test('скачанный пак по приоритету; отсутствующий не используется', () => {
    const dl = { noto: { bytes: 1, at: 1 } };
    expect(resolveIcon('Пицца', undefined, undefined, { settings: st, downloaded: dl }).source).toBe('pack:noto');
    const dl2 = { noto: { bytes: 1, at: 1 }, 'fluent-emoji-flat': { bytes: 1, at: 1 } };
    expect(resolveIcon('Пицца', undefined, undefined, { settings: st, downloaded: dl2 }).source).toBe('pack:fluent-emoji-flat');
    // noto поднят выше fluent
    const st2 = moveSource(st, 'pack:noto', -1);
    const st3 = moveSource(st2, 'pack:noto', -1);
    expect(resolveIcon('Пицца', undefined, undefined, { settings: st3, downloaded: dl2 }).source).toBe('pack:noto');
    // выключенный пак пропускается
    const off = toggleSource(st, 'pack:fluent-emoji-flat');
    expect(resolveIcon('Пицца', undefined, undefined, { settings: off, downloaded: dl2 }).source).toBe('pack:noto');
    expect(chooseFromPacks('🍕', [{ prefix: 'twemoji', on: true }], {})).toBeUndefined();
    expect(chooseFromPacks('🍕', [{ prefix: 'openmoji', on: true }], {})).toEqual({ prefix: 'openmoji', name: expect.any(String) });
  });
  test('эмодзи / эмодзи от ИИ / тарелка; порядок «сначала ИИ»', () => {
    const only = (ids: string[]) => ({ ...st, sources: ids.map((id) => ({ id, on: true })) });
    expect(resolveIcon('Борщ', undefined, undefined, { settings: only(['emoji', 'plate']) }).ref).toEqual({ kind: 'emoji', emoji: '🍲' });
    expect(resolveIcon('Абракадабра', '🥨', undefined, { settings: only(['emoji', 'ai-emoji', 'plate']) }).ref).toEqual({ kind: 'emoji', emoji: '🥨' });
    expect(resolveIcon('Абракадабра', undefined, undefined, { settings: only(['emoji', 'ai-emoji', 'plate']) }).ref).toEqual({ kind: 'emoji', emoji: '🍽️' });
    expect(emojiCandidates('Борщ', '🥣', 'dict')).toEqual(['🍲', '🥣']);
    expect(emojiCandidates('Борщ', '🥣', 'ai')).toEqual(['🥣', '🍲']);
    expect(resolveIcon('Борщ', '🥣', undefined, { settings: { ...only(['openmoji']), first: 'ai' } }).ref).toEqual({ kind: 'openmoji', hex: emojiHex('🥣') });
    expect(OPENMOJI[emojiHex('🥣')]).toBeTruthy();
  });
  test('онлайн выше паков: пока не искали — показываем следующий и просим поиск; найдено — онлайн; не найдено — дальше', () => {
    const s1 = { ...st, sources: [{ id: 'online', on: true }, { id: 'openmoji', on: true }] };
    const r1 = resolveIcon('Шакшука по-новому', undefined, 'shakshuka', { settings: s1, onlineCache: {} });
    expect(r1.needOnline).toBe(iconKey('Шакшука по-новому', 'shakshuka'));
    expect(r1.source).toBe('openmoji');
    const key = iconKey('Шакшука по-новому', 'shakshuka');
    expect(resolveIcon('Шакшука по-новому', undefined, 'shakshuka', { settings: s1, onlineCache: { [key]: 'noto:shallow-pan-of-food' } }).ref).toEqual({ kind: 'online', icon: 'noto:shallow-pan-of-food' });
    const r3 = resolveIcon('Шакшука по-новому', undefined, 'shakshuka', { settings: s1, onlineCache: { [key]: '' } });
    expect(r3.source).toBe('openmoji');
    expect(r3.needOnline).toBeUndefined();
    expect(fromSource('online', '', undefined, undefined, { settings: s1 })).toBeUndefined();
  });
  test('ручная привязка важнее всего; сброс возвращает авто', () => {
    let d = baseData();
    d = setManualIcon(d, manualKey('  Борщ '), { kind: 'emoji', emoji: '🍕' });
    expect(resolveIcon('борщ', undefined, undefined, { settings: d.icons! }).ref).toEqual({ kind: 'emoji', emoji: '🍕' });
    expect(resolveIcon('борщ', undefined, undefined, { settings: d.icons! }).source).toBe('manual');
    d = setManualIcon(d, manualKey('Борщ'), null);
    expect(resolveIcon('борщ', undefined, undefined, { settings: d.icons! }).source).not.toBe('manual');
  });
  test('нельзя выключить все источники; порядок меняется', () => {
    let s = { ...st, sources: [{ id: 'plate', on: true }] };
    expect(toggleSource(s, 'plate')).toBe(s);
    expect(moveSource(st, st.sources[0].id, -1)).toBe(st);
    s = moveSource(st, 'plate', -1);
    expect(s.sources[s.sources.length - 2].id).toBe('plate');
  });
  test('нормализация и миграция', () => {
    expect(normalizeIconSettings(undefined)).toEqual(defaultIconSettings());
    const n = normalizeIconSettings({ sources: [{ id: 'emoji', on: true }, { id: 'bogus', on: true }, { id: 'emoji', on: false }], size: 'XL', first: 'ai', online: { limit: 7 }, manual: { a: { kind: 'emoji', emoji: '🍕' }, b: { kind: 'zzz' } } });
    expect(n.sources[0].id).toBe('emoji');
    expect(n.sources.filter((x) => x.id === 'emoji')).toHaveLength(1);
    expect(n.sources.some((x) => x.id === 'bogus')).toBe(false);
    expect(n.sources[n.sources.length - 1].id).toBe('plate');
    expect(n.size).toBe('M');
    expect(n.first).toBe('ai');
    expect(n.online.limit).toBe(64);
    expect(Object.keys(n.manual)).toEqual(['a']);
    const d = migrate({ ...baseData(), icons: undefined, iconCache: { x: 'a:b', y: 5 } } as any, baseData());
    expect(d.icons).toEqual(defaultIconSettings());
    expect(d.iconCache).toEqual({ x: 'a:b' });
  });
  test('смена онлайн-настроек или порядка запроса сбрасывает кэш; «Сбросить кэш»', () => {
    let d: AppData = { ...baseData(), icons: defaultIconSettings(), iconCache: { k: 'noto:pizza' } };
    d = setIconSettings(d, { ...d.icons!, size: 'L' });
    expect(d.iconCache).toEqual({ k: 'noto:pizza' });
    d = setIconSettings(d, { ...d.icons!, online: { ...d.icons!.online, sets: toggleSet(d.icons!.online.sets, 'noto') } });
    expect(d.iconCache).toEqual({});
    d = { ...d, iconCache: { k: 'x:y' } };
    d = setIconSettings(d, { ...d.icons!, first: 'ai' });
    expect(d.iconCache).toEqual({});
    expect(clearIconCache({ ...d, iconCache: { a: 'b' } }).iconCache).toEqual({});
  });
});

describe('онлайн-поиск Iconify', () => {
  const sets = normalizeSets([{ prefix: 'noto', on: true }, { prefix: 'fluent-emoji-flat', on: true }, { prefix: 'twemoji', on: false }]);
  test('наборы: порядок, выключение, нельзя выключить последний', () => {
    expect(sets.slice(0, 3).map((s) => s.prefix)).toEqual(['noto', 'fluent-emoji-flat', 'twemoji']);
    expect(moveSet(sets, 'fluent-emoji-flat', -1)[0].prefix).toBe('fluent-emoji-flat');
    const one = [{ prefix: 'noto', on: true }, { prefix: 'twemoji', on: false }];
    expect(toggleSet(one, 'noto')).toBe(one);
  });
  test('pickIcon: приоритет набора; без ограничения — только цветные', () => {
    const res = { icons: ['twemoji:pizza', 'fluent-emoji-flat:pizza', 'noto:pizza', 'mdi:pizza'], collections: { mdi: { palette: false }, twemoji: { palette: true } } };
    expect(pickIcon(res, sets)).toBe('noto:pizza');
    expect(pickIcon({ icons: ['twemoji:pizza'] }, sets)).toBeUndefined();
    expect(pickIcon({ icons: ['mdi:pizza', 'twemoji:pizza'], collections: res.collections }, sets, true)).toBe('twemoji:pizza');
  });
  test('findIcon: запросы по включённым наборам, потом без ограничений; лимит', async () => {
    const urls: string[] = [];
    const f = jest.fn(async (u: string) => { urls.push(u); return resp(u.includes('prefixes=') ? { icons: [] } : { icons: ['mdi:x', 'twemoji:pot-of-food'], collections: { mdi: { palette: false }, twemoji: { palette: true } } }); });
    const r = await findIcon(['borscht soup', 'pot of food'], sets, f as any, { limit: 32 });
    expect(r).toBe('twemoji:pot-of-food');
    expect(urls[0]).toContain('query=borscht%20soup');
    expect(urls[0]).toContain('prefixes=noto,fluent-emoji-flat');
    expect(urls[0]).toContain('limit=32');
    expect(urls[0]).not.toContain('twemoji');
    expect(urls.filter((u) => u.includes('prefixes=')).length).toBe(2);
    // «все», не только цветные
    const g = jest.fn(async () => resp({ icons: ['mdi:x'], collections: { mdi: { palette: false } } }));
    expect(await findIcon(['x'], sets, g as any, { coloredOnly: false })).toBe('mdi:x');
    expect(await findIcon(['x'], sets, g as any, { coloredOnly: true })).toBe('');
  });
  test('один запрос на название (параллельные вызовы ждут первый); ошибка — исключение', async () => {
    let n = 0;
    const f = jest.fn(async () => { n++; await new Promise((r) => setTimeout(r, 5)); return resp({ icons: ['noto:pizza'] }); });
    const [a, b] = await Promise.all([findIconOnce('pizza|', ['pizza'], sets, f as any), findIconOnce('pizza|', ['pizza'], sets, f as any)]);
    expect(a).toBe('noto:pizza'); expect(b).toBe('noto:pizza'); expect(n).toBe(1);
    await expect(findIcon(['x'], sets, (async () => resp({}, false, 503)) as any)).rejects.toThrow('503');
  });
  test('SVG: память → постоянный кэш → сеть, без повторной загрузки', async () => {
    const store: Record<string, string> = {};
    const svgStore = { get: async (k: string) => store[k], set: async (k: string, v: string) => { store[k] = v; } };
    const f = jest.fn(async () => resp('<svg viewBox="0 0 1 1"></svg>'));
    expect(await loadSvg('noto:pizza', svgStore, f as any)).toContain('<svg');
    expect(await loadSvg('noto:pizza', svgStore, f as any)).toContain('<svg');
    expect(f).toHaveBeenCalledTimes(1);
    expect(store['noto:pizza']).toContain('<svg');
    _resetIconifyMemory();
    const g = jest.fn();
    expect(await loadSvg('noto:pizza', svgStore, g as any)).toContain('<svg');
    expect(g).not.toHaveBeenCalled();
    await expect(loadSvg('noto:bad', undefined, (async () => resp('oops')) as any)).rejects.toThrow('не SVG');
  });
  test('запросы: словарь / ИИ первыми', () => {
    expect(onlineQueries('Борщ', 'beet soup', undefined, 'dict')[0]).toBe('borscht soup');
    expect(onlineQueries('Борщ', 'beet soup', undefined, 'ai')[0]).toBe('beet soup');
    expect(onlineQueries('Абракадабра', undefined, '🍕', 'dict')).toEqual(['pizza']);
  });
});
