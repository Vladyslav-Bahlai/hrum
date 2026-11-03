import type { IconifySet, IconRef, IconSettings } from './types';
import { emojiHex, matchDish } from './icons';
import { OPENMOJI, OPENMOJI_NAMES } from './openmojiData';
import { PackManifest, PACKS } from './iconPacks';

/**
 * Иконки блюд из наборов Iconify:
 *  — офлайн-паки еды (пользователь скачивает/удаляет в Настройках; OpenMoji встроен);
 *  — онлайн-поиск (только для блюд, которых нет в словаре).
 * Порядок наборов и вкл/выкл — общие для паков и онлайн-поиска.
 */

export { PACKS };
export type { PackManifest };
export const packOf = (prefix: string) => PACKS.find((p) => p.prefix === prefix);
/** «≈0,6 МБ» */
export const fmtBytes = (b: number) => (b >= 1024 * 1024 ? `≈${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `≈${Math.max(1, Math.round(b / 1024))} КБ`);

export const DEFAULT_SETS: IconifySet[] = PACKS.map((p) => ({ prefix: p.prefix, on: true }));

/** Наборы из данных: известные, без повторов, недостающие — в конец; хотя бы один включён. */
export const normalizeSets = (raw: unknown): IconifySet[] => {
  const known = new Set(PACKS.map((s) => s.prefix));
  const out: IconifySet[] = [];
  if (Array.isArray(raw)) for (const r of raw as any[]) {
    if (r && typeof r.prefix === 'string' && known.has(r.prefix) && !out.some((x) => x.prefix === r.prefix)) out.push({ prefix: r.prefix, on: r.on !== false });
  }
  if (!out.length) return DEFAULT_SETS.map((s) => ({ ...s }));
  for (const s of PACKS) if (!out.some((x) => x.prefix === s.prefix)) out.push({ prefix: s.prefix, on: true });
  if (!out.some((s) => s.on)) out[0] = { ...out[0], on: true };
  return out;
};
export const toggleSet = (sets: IconifySet[], prefix: string): IconifySet[] => {
  const next = sets.map((s) => (s.prefix === prefix ? { ...s, on: !s.on } : s));
  return next.some((s) => s.on) ? next : sets; // последний включённый не выключается
};
export const moveSet = (sets: IconifySet[], prefix: string, d: -1 | 1): IconifySet[] => {
  const i = sets.findIndex((s) => s.prefix === prefix);
  const j = i + d;
  if (i < 0 || j < 0 || j >= sets.length) return sets;
  const a = [...sets];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

/** Пак доступен офлайн: встроен или скачан. */
export const packAvailable = (prefix: string, downloaded: Record<string, unknown> | undefined) => !!packOf(prefix)?.builtin || !!downloaded?.[prefix];

/** Иконка из офлайн-паков по кодпоинту эмодзи: первый включённый и доступный пак по приоритету, где она есть. */
export function chooseFromPacks(emoji: string, sets: IconifySet[], downloaded: Record<string, unknown> | undefined): { prefix: string; name: string } | undefined {
  const hex = emojiHex(emoji);
  for (const s of sets) {
    if (!s.on || !packAvailable(s.prefix, downloaded)) continue;
    const name = packOf(s.prefix)?.icons[hex];
    if (name) return { prefix: s.prefix, name };
  }
  return undefined;
}

// ---------- данные паков: JSON Iconify {prefix, icons:{name:{body,width?,height?}}, width, height} ----------

export interface IconifyJson { prefix: string; width?: number; height?: number; left?: number; top?: number; icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>; aliases?: Record<string, { parent: string }> }
/** SVG-строка иконки из JSON набора. */
export function svgFromJson(j: IconifyJson | undefined, name: string): string | undefined {
  if (!j?.icons) return undefined;
  const alias = j.icons[name] ? name : j.aliases?.[name]?.parent;
  const ic = alias ? j.icons[alias] : undefined;
  if (!ic) return undefined;
  const w = ic.width ?? j.width ?? 16, h = ic.height ?? j.height ?? 16, l = ic.left ?? j.left ?? 0, t = ic.top ?? j.top ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${l} ${t} ${w} ${h}">${ic.body}</svg>`;
}
/** Объединение ответов батчей в один JSON пака. */
export function mergePackJson(parts: IconifyJson[]): IconifyJson {
  const first = parts[0] || { prefix: '', icons: {} };
  const out: IconifyJson = { prefix: first.prefix, width: first.width, height: first.height, icons: {}, aliases: {} };
  for (const p of parts) { Object.assign(out.icons, p.icons || {}); Object.assign(out.aliases!, p.aliases || {}); }
  return out;
}
/** Имена иконок пака батчами (URL не слишком длинный). */
export const packBatches = (m: PackManifest, size = 40): string[][] => {
  const names = Array.from(new Set(Object.values(m.icons))).sort();
  const out: string[][] = [];
  for (let i = 0; i < names.length; i += size) out.push(names.slice(i, i + size));
  return out;
};

const API = 'https://api.iconify.design';
type Resp = { ok: boolean; status?: number; json: () => Promise<any>; text: () => Promise<string> };
type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Resp>;

/** Скачивает пак батчами с прогрессом (0…1); отмена через signal. Возвращает JSON пака и реальный размер. */
export async function downloadPack(m: PackManifest, onProgress?: (p: number) => void, signal?: AbortSignal, fetchFn: Fetch = fetch as any): Promise<{ json: IconifyJson; bytes: number }> {
  const batches = packBatches(m);
  const parts: IconifyJson[] = [];
  let bytes = 0;
  onProgress?.(0);
  for (let i = 0; i < batches.length; i++) {
    if (signal?.aborted) throw new Error('Отменено');
    const r = await fetchFn(`${API}/${m.prefix}.json?icons=${batches[i].join(',')}`, { signal });
    if (!r.ok) throw new Error(`Не удалось скачать (${r.status ?? 'ошибка'})`);
    const txt = await r.text();
    bytes += txt.length;
    parts.push(JSON.parse(txt));
    onProgress?.((i + 1) / batches.length);
  }
  return { json: mergePackJson(parts), bytes };
}

// ---------- онлайн-поиск (только блюда без словаря) ----------

const normName = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
/** Ключ кэша блюда: название + английское название от ИИ. */
export const iconKey = (name: string, en?: string) => `${normName(name)}|${normName(en || '')}`;

export interface IconifySearch { icons: string[]; collections?: Record<string, { palette?: boolean }> }
/** Выбор из ответа поиска: первый набор по приоритету, где есть иконка; при поиске без ограничений — любая цветная. */
export function pickIcon(res: IconifySearch, sets: IconifySet[], anyColored = false): string | undefined {
  const icons = Array.isArray(res?.icons) ? res.icons : [];
  for (const s of sets) if (s.on) {
    const hit = icons.find((i) => i.startsWith(s.prefix + ':'));
    if (hit) return hit;
  }
  if (!anyColored) return undefined;
  return icons.find((i) => res.collections?.[i.split(':')[0]]?.palette) || undefined;
}

/**
 * Онлайн-поиск иконки: по включённым наборам в порядке приоритета, затем без ограничения (только цветные).
 * Возвращает «prefix:name» или '' (не найдено). Ошибка сети — исключение (не кэшируем, попробуем позже).
 */
export async function findIcon(queries: string[], sets: IconifySet[], fetchFn: Fetch = fetch as any, opts: { coloredOnly?: boolean; limit?: number } = {}): Promise<string> {
  const on = sets.filter((s) => s.on).map((s) => s.prefix);
  const limit = opts.limit || 64;
  for (const q of queries) {
    const r = await fetchFn(`${API}/search?query=${encodeURIComponent(q)}&limit=${limit}&prefixes=${on.join(',')}`);
    if (!r.ok) throw new Error(`Iconify ${r.status}`);
    const hit = pickIcon(await r.json(), sets);
    if (hit) return hit;
  }
  for (const q of queries) {
    const r = await fetchFn(`${API}/search?query=${encodeURIComponent(q)}&limit=${limit}`);
    if (!r.ok) throw new Error(`Iconify ${r.status}`);
    const res = await r.json();
    const hit = pickIcon(res, sets, true) || (opts.coloredOnly === false ? (res?.icons || [])[0] : undefined);
    if (hit) return hit;
  }
  return '';
}

export const svgUrl = (icon: string) => { const [p, n] = icon.split(':'); return `${API}/${p}/${n}.svg`; };

const inflight = new Map<string, Promise<string>>();
/** Поиск без повторных запросов для одного ключа (пока идёт запрос — ждём его же). */
export function findIconOnce(key: string, queries: string[], sets: IconifySet[], fetchFn?: Fetch, opts?: { coloredOnly?: boolean; limit?: number }): Promise<string> {
  const k = key + '#' + sets.filter((s) => s.on).map((s) => s.prefix).join(',');
  const cur = inflight.get(k);
  if (cur) return cur;
  const p = findIcon(queries, sets, fetchFn, opts).finally(() => { setTimeout(() => inflight.delete(k), 0); });
  inflight.set(k, p);
  return p;
}

export interface SvgStore { get: (icon: string) => Promise<string | undefined>; set: (icon: string, svg: string) => Promise<void> }
const mem = new Map<string, string>();
const svgInflight = new Map<string, Promise<string>>();
export const svgFromMemory = (icon: string) => mem.get(icon);
/** SVG найденной онлайн иконки: память → постоянный кэш → сеть. */
export function loadSvg(icon: string, store?: SvgStore, fetchFn: Fetch = fetch as any): Promise<string> {
  const m = mem.get(icon);
  if (m) return Promise.resolve(m);
  const cur = svgInflight.get(icon);
  if (cur) return cur;
  const p = (async () => {
    const cached = await store?.get(icon).catch(() => undefined);
    if (cached) { mem.set(icon, cached); return cached; }
    const r = await fetchFn(svgUrl(icon));
    if (!r.ok) throw new Error(`Iconify ${r.status}`);
    const svg = await r.text();
    if (!/<svg/i.test(svg)) throw new Error('Iconify: не SVG');
    mem.set(icon, svg);
    await store?.set(icon, svg).catch(() => {});
    return svg;
  })().finally(() => { setTimeout(() => svgInflight.delete(icon), 0); });
  svgInflight.set(icon, p);
  return p;
}

/** SVG встроенного OpenMoji по эмодзи. */
export const openmojiSvg = (emoji: string) => OPENMOJI[emojiHex(emoji)];

/** Для тестов. */
export const _resetIconifyMemory = () => { mem.clear(); inflight.clear(); svgInflight.clear(); };

// ---------- цепочка источников ----------


export const SOURCE_FIXED = ['openmoji', 'emoji', 'ai-emoji', 'online', 'plate'] as const;
export const packSourceId = (prefix: string) => `pack:${prefix}`;
export const ALL_SOURCES = [...PACKS.filter((p) => !p.builtin).map((p) => packSourceId(p.prefix)), ...SOURCE_FIXED];
export const sourceTitle = (id: string) => {
  if (id.startsWith('pack:')) return packOf(id.slice(5))?.title || id;
  return ({ openmoji: 'OpenMoji (встроен)', emoji: 'Системные эмодзи', 'ai-emoji': 'Эмодзи от ИИ', online: 'Iconify онлайн', plate: 'Тарелка 🍽️' } as Record<string, string>)[id] || id;
};

export const defaultIconSettings = (): IconSettings => ({
  sources: [
    ...PACKS.filter((p) => !p.builtin).map((p) => ({ id: packSourceId(p.prefix), on: true })),
    { id: 'openmoji', on: true }, { id: 'online', on: false }, { id: 'emoji', on: true }, { id: 'ai-emoji', on: true }, { id: 'plate', on: true },
  ],
  online: { sets: DEFAULT_SETS.map((s) => ({ ...s })), coloredOnly: true, limit: 64 },
  first: 'dict',
  size: 'M',
  show: { diary: true, menu: true, carousel: true },
  manual: {},
});

/** Настройки из данных (с миграцией и защитой от мусора). */
export function normalizeIconSettings(raw: any): IconSettings {
  const def = defaultIconSettings();
  if (!raw || typeof raw !== 'object') return def;
  const seen = new Set<string>();
  const sources: { id: string; on: boolean }[] = [];
  for (const s of Array.isArray(raw.sources) ? raw.sources : []) {
    if (s && typeof s.id === 'string' && ALL_SOURCES.includes(s.id) && !seen.has(s.id)) { seen.add(s.id); sources.push({ id: s.id, on: s.on !== false }); }
  }
  for (const d of def.sources) if (!seen.has(d.id)) sources.splice(d.id === 'plate' ? sources.length : Math.max(0, sources.length - 1), 0, { ...d, on: d.id === 'online' ? false : d.on });
  if (!sources.some((s) => s.on)) sources[sources.length - 1].on = true;
  const o = raw.online || {};
  const manual: Record<string, IconRef> = {};
  if (raw.manual && typeof raw.manual === 'object') for (const [k, v] of Object.entries<any>(raw.manual)) {
    if (v && (v.kind === 'pack' && v.prefix && v.name || v.kind === 'online' && v.icon || v.kind === 'emoji' && v.emoji || v.kind === 'openmoji' && v.hex)) manual[k] = v;
  }
  return {
    sources,
    online: { sets: normalizeSets(o.sets), coloredOnly: o.coloredOnly !== false, limit: [16, 32, 64, 128].includes(o.limit) ? o.limit : 64 },
    first: raw.first === 'ai' ? 'ai' : 'dict',
    size: raw.size === 'S' || raw.size === 'L' ? raw.size : 'M',
    show: { diary: raw.show?.diary !== false, menu: raw.show?.menu !== false, carousel: raw.show?.carousel !== false },
    manual,
  };
}
export const toggleSource = (st: IconSettings, id: string): IconSettings => {
  const sources = st.sources.map((s) => (s.id === id ? { ...s, on: !s.on } : s));
  return sources.some((s) => s.on) ? { ...st, sources } : st;
};
export const moveSource = (st: IconSettings, id: string, d: -1 | 1): IconSettings => {
  const i = st.sources.findIndex((s) => s.id === id);
  const j = i + d;
  if (i < 0 || j < 0 || j >= st.sources.length) return st;
  const a = [...st.sources];
  [a[i], a[j]] = [a[j], a[i]];
  return { ...st, sources: a };
};

/** Ключ ручной привязки: нормализованное название. */
export const manualKey = (name: string) => normName(name);
export const ICON_PX = { S: 24, M: 32, L: 42 } as const;

export interface ResolveCtx { settings: IconSettings; downloaded?: Record<string, unknown>; onlineCache?: Record<string, string> }
export interface Resolved {
  /** что показать сейчас */
  ref: IconRef | null;
  /** id источника, который дал иконку */
  source?: string;
  /** онлайн-поиск выше найденного ещё не выполнялся — нужно запросить (ключ кэша) */
  needOnline?: string;
}

/** Эмодзи-кандидаты для кодпоинтных источников (паки, OpenMoji): словарь и/или эмодзи от ИИ, в выбранном порядке. */
export function emojiCandidates(name: string, aiEmoji: string | undefined, first: 'dict' | 'ai'): string[] {
  const dict = matchDish(name)?.emoji;
  const ai = aiEmoji && aiEmoji !== '🍽️' && aiEmoji !== '🍽' ? aiEmoji : undefined;
  const list = first === 'ai' ? [ai, dict] : [dict, ai];
  return Array.from(new Set(list.filter(Boolean) as string[]));
}

/** Результат одного источника (для цепочки и экрана «Проверить иконки»). `undefined` — нет; 'pending' — онлайн ещё не искали. */
export function fromSource(id: string, name: string, aiEmoji: string | undefined, en: string | undefined, ctx: ResolveCtx): IconRef | 'pending' | undefined {
  const st = ctx.settings;
  const cands = emojiCandidates(name, aiEmoji, st.first);
  if (id.startsWith('pack:')) {
    const prefix = id.slice(5);
    if (!packAvailable(prefix, ctx.downloaded)) return undefined;
    for (const e of cands) { const n = packOf(prefix)?.icons[emojiHex(e)]; if (n) return { kind: 'pack', prefix, name: n }; }
    return undefined;
  }
  if (id === 'openmoji') { for (const e of cands) { const hex = emojiHex(e); if (OPENMOJI[hex]) return { kind: 'openmoji', hex }; } return undefined; }
  if (id === 'emoji') { const e = matchDish(name)?.emoji; return e ? { kind: 'emoji', emoji: e } : undefined; }
  if (id === 'ai-emoji') return aiEmoji && aiEmoji !== '🍽️' ? { kind: 'emoji', emoji: aiEmoji } : undefined;
  if (id === 'plate') return { kind: 'emoji', emoji: '🍽️' };
  if (id === 'online') {
    if (!name.trim()) return undefined;
    const c = ctx.onlineCache?.[iconKey(name, en)];
    if (c === undefined) return 'pending';
    return c ? { kind: 'online', icon: c } : undefined;
  }
  return undefined;
}

/** Цепочка источников сверху вниз: ручная привязка → первый найденный. Если выше найденного стоит неопрошенный онлайн-поиск — needOnline. */
export function resolveIcon(name: string, aiEmoji: string | undefined, en: string | undefined, ctx: ResolveCtx): Resolved {
  const man = ctx.settings.manual[manualKey(name)];
  if (man) return { ref: man, source: 'manual' };
  let needOnline: string | undefined;
  for (const s of ctx.settings.sources) {
    if (!s.on) continue;
    const r = fromSource(s.id, name, aiEmoji, en, ctx);
    if (r === 'pending') { needOnline = iconKey(name, en); continue; }
    if (r) return { ref: r, source: s.id, needOnline };
  }
  return { ref: null, needOnline };
}

/** Запросы онлайн-поиска в выбранном порядке («сначала словарь» / «сначала ИИ»). */
export function onlineQueries(name: string, en: string | undefined, aiEmoji: string | undefined, first: 'dict' | 'ai'): string[] {
  const m = matchDish(name);
  const annOf = (e?: string) => (e ? OPENMOJI_NAMES[emojiHex(e)] : undefined);
  const dict = [m?.en, annOf(m?.emoji)];
  const ai = [en, annOf(aiEmoji && aiEmoji !== '🍽️' ? aiEmoji : undefined)];
  const q = (first === 'ai' ? [...ai, ...dict] : [...dict, ...ai]).map((x) => (x || '').trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(q));
}
