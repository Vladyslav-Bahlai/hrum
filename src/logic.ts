import { AISettings, AppData, Entry, FoodItem, IconRef, IconSettings, MealDef, Menu, TargetRecord, WeightPoint } from './types';
import { chatSettings } from './chat';
import { normalizeIconSettings } from './iconify';
import { addDays, decimalOn, DEFAULT_MEALS, numLabel, fromKey, mealAtMinutes, minutesOf, pad, timestampAt, toKey, todayKey, uid } from './utils';

/** Чистые функции над данными приложения: store.tsx только вызывает их (так их можно тестировать без React). */

export const sameItem = (a: FoodItem, b: FoodItem) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

export const addEntries = (d: AppData, list: Omit<Entry, 'id'>[], genId: () => string = uid): AppData => {
  const added = list.map((e) => ({ ...e, id: genId() }));
  // учёт частоты для «Частых блюд»
  const favorites = d.favorites.map((f) => {
    const n = added.filter((a) => sameItem(a.item, f.item)).length;
    return n ? { ...f, uses: f.uses + n } : f;
  });
  return { ...d, entries: [...d.entries, ...added], favorites };
};
export const updateEntry = (d: AppData, id: string, patch: Partial<Entry>): AppData => ({ ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
export const removeEntry = (d: AppData, id: string): AppData => ({ ...d, entries: d.entries.filter((x) => x.id !== id) });
export const restoreEntry = (d: AppData, e: Entry): AppData => ({ ...d, entries: [...d.entries, e] });

export const toggleFavorite = (d: AppData, item: FoodItem, genId: () => string = uid): AppData => {
  const has = d.favorites.find((f) => sameItem(f.item, item));
  if (has) return { ...d, favorites: d.favorites.filter((f) => f !== has) };
  return { ...d, favorites: [...d.favorites, { id: genId(), item: { ...item }, uses: 1 }] };
};
export const savePreset = (d: AppData, item: FoodItem, id?: string, genId: () => string = uid): AppData => {
  const clean = { ...item, portion: undefined };
  if (id && d.favorites.some((f) => f.id === id)) return { ...d, favorites: d.favorites.map((f) => (f.id === id ? { ...f, item: clean } : f)) };
  const same = d.favorites.find((f) => sameItem(f.item, item));
  if (same) return { ...d, favorites: d.favorites.map((f) => (f === same ? { ...f, item: clean } : f)) };
  return { ...d, favorites: [{ id: genId(), item: clean, uses: 0 }, ...d.favorites] };
};
export const deletePreset = (d: AppData, id: string): AppData => ({ ...d, favorites: d.favorites.filter((f) => f.id !== id) });

/** Быстрые «пузырьки» над вводом: только блюда со звездой, самые используемые — первыми. */
export const favoriteBubbles = (d: Pick<AppData, 'favorites'>, limit = 20): FoodItem[] =>
  [...d.favorites].sort((a, b) => b.uses - a.uses).map((f) => f.item).slice(0, limit);

export const replaceMenuItem = (d: AppData, menuId: string, index: number, item: FoodItem): AppData => ({
  ...d,
  menus: d.menus.map((m) => (m.id === menuId ? { ...m, items: m.items.map((it, i) => (i === index ? { ...item, section: it.section, portion: undefined } : it)) } : m)),
});

export const setWater = (d: AppData, date: string, glasses: number): AppData => ({ ...d, water: { ...d.water, [date]: Math.max(0, glasses) } });
export const addWeight = (d: AppData, w: WeightPoint): AppData => ({
  ...d,
  weights: [...d.weights.filter((x) => x.date !== w.date), w].sort((a, b) => a.date.localeCompare(b.date)),
  profile: w.date >= todayKey() || !d.weights.some((x) => x.date > w.date) ? { ...d.profile, weight: w.kg } : d.profile,
});
export const removeWeight = (d: AppData, date: string): AppData => ({ ...d, weights: d.weights.filter((x) => x.date !== date) });

/** Закрытые блюда хранятся по названию: после правки меню забываем те, которых уже нет. */
const pruneClosed = (m: Menu): Menu => {
  if (!m.closed) return m;
  const names = new Set(m.items.map((i) => i.name));
  const closed = m.closed.filter((n) => names.has(n));
  return { ...m, closed: closed.length ? closed : undefined };
};
export const saveMenu = (d: AppData, m: Menu): AppData => {
  const menu = pruneClosed(m);
  return { ...d, menus: d.menus.some((x) => x.id === menu.id) ? d.menus.map((x) => (x.id === menu.id ? menu : x)) : [menu, ...d.menus] };
};
export const deleteMenu = (d: AppData, id: string): AppData => ({ ...d, menus: d.menus.filter((x) => x.id !== id) });
export const attachMenu = (d: AppData, id: string, date: string): AppData => ({ ...d, menus: d.menus.map((m) => (m.id === id && !m.dates.includes(date) ? { ...m, dates: [...m.dates, date].sort() } : m)) });
export const detachMenu = (d: AppData, id: string, date: string): AppData => ({ ...d, menus: d.menus.map((m) => (m.id === id ? { ...m, dates: m.dates.filter((x) => x !== date) } : m)) });
export const setMenuDone = (d: AppData, id: string, done: boolean): AppData => ({ ...d, menus: d.menus.map((m) => (m.id === id ? { ...m, done } : m)) });
/** Закрыть блюдо меню (съедено полностью / не буду) или снять закрытие. Записей в дневник не создаёт. */
export const setDishClosed = (d: AppData, menuId: string, name: string, closed: boolean): AppData => ({
  ...d,
  menus: d.menus.map((m) => {
    if (m.id !== menuId) return m;
    const rest = (m.closed || []).filter((n) => n !== name);
    const next = closed ? [...rest, name] : rest;
    return { ...m, closed: next.length ? next : undefined };
  }),
});

export const setMeals = (d: AppData, meals: MealDef[]): AppData => {
  const keys = new Set(meals.map((m) => m.key));
  const entries = d.entries.map((e) => (keys.has(e.meal) ? e : { ...e, meal: mealAtMinutes(minutesOf(e.time), meals) }));
  return { ...d, meals, entries };
};
export const setSoundMap = (d: AppData, m: Record<string, string>): AppData => ({ ...d, soundMap: m });
export const cacheModels = (d: AppData, p: 'claude' | 'gemini', list: string[]): AppData => ({ ...d, ai: { ...d.ai, models: { ...(d.ai.models || {}), [p]: list } } });

export const isCollapsed = (d: Pick<AppData, 'collapsed'>, key: string) => !!d.collapsed?.includes(key);
export const toggleCollapsed = (d: AppData, key: string): AppData => {
  const cur = d.collapsed || [];
  return { ...d, collapsed: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
};

export const toggleFavModel = (d: AppData, p: 'claude' | 'gemini', model: string): AppData => {
  const cur = d.ai.favModels?.[p] || [];
  const next = cur.includes(model) ? cur.filter((m) => m !== model) : [...cur, model];
  return { ...d, ai: { ...d.ai, favModels: { ...(d.ai.favModels || {}), [p]: next } } };
};

/**
 * Модели для выбора в дневнике. Если отмечены любимые (и они есть в списке) — только они;
 * иначе все. Текущая модель провайдера присутствует всегда. `filtered` — список урезан любимыми.
 */
export const modelChoices = (ai: AISettings, p: 'claude' | 'gemini'): { list: string[]; filtered: boolean } => {
  const cur = (p === 'claude' ? ai.claudeModel : ai.geminiModel) || '';
  const all = ai.models?.[p] || [];
  const base = all.length ? all : cur ? [cur] : [];
  const favs = (ai.favModels?.[p] || []).filter((m) => base.includes(m));
  if (!favs.length) return { list: base, filtered: false };
  const list = base.filter((m) => favs.includes(m) || m === cur);
  return { list, filtered: true };
};

/** Приводит сохранённые данные (в том числе старых версий) к текущему виду. */
export const migrate = (raw: Partial<AppData>, base: AppData): AppData => {
  const d: any = raw;
  const menus: Menu[] = (d.menus || []).map((m: any) => {
    const items = Array.isArray(m.items) ? m.items : [];
    const names = new Set(items.map((i: FoodItem) => i.name));
    const closed = Array.isArray(m.closed) ? m.closed.filter((n: unknown) => typeof n === 'string' && names.has(n)) : [];
    const { closed: _c, ...rest } = m;
    return { ...rest, items, dates: Array.isArray(m.dates) ? m.dates : [toKey(new Date(m.created || Date.now()))], ...(closed.length ? { closed } : {}) };
  });
  const meals: MealDef[] = d.meals && d.meals.length ? d.meals : DEFAULT_MEALS;
  // старые записи с «перекусом» раскладываем по времени суток
  const entries = (d.entries || []).map((e: any) => (meals.some((m) => m.key === e.meal) ? e : { ...e, meal: mealAtMinutes(minutesOf(e.time), meals) }));
  const soundVolume = ['low', 'mid', 'high'].includes(d.soundVolume) ? d.soundVolume : undefined;
  const chats = (Array.isArray(d.chats) ? d.chats : [])
    .filter((c: any) => c && typeof c.id === 'string' && Array.isArray(c.messages))
    .map((c: any) => ({
      id: c.id, updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : 0,
      ...(typeof c.title === 'string' && c.title.trim() ? { title: c.title.trim() } : {}),
      ...(c.pinned === true ? { pinned: true } : {}),
      messages: c.messages.filter((m: any) => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'ai')).map((m: any) => {
        const photos = Array.isArray(m.photos) ? m.photos.filter((u: unknown) => typeof u === 'string' && u) : [];
        const { photos: _p, ...rest } = m;
        return photos.length ? { ...rest, photos } : rest;
      }),
    }))
    .filter((c: any) => c.messages.length || c.title || c.pinned);
  const cs = d.chatSettings ? chatSettings(d) : undefined;
  const collapsed = Array.isArray(d.collapsed) ? Array.from(new Set(d.collapsed.filter((k: unknown) => typeof k === 'string' && k))) : undefined;
  const ai: any = { ...base.ai, ...(d.ai || {}) };
  const favOf = (x: unknown) => (Array.isArray(x) ? Array.from(new Set(x.filter((m) => typeof m === 'string' && m))) : []);
  if (ai.favModels && typeof ai.favModels === 'object') {
    const f = { claude: favOf(ai.favModels.claude), gemini: favOf(ai.favModels.gemini) };
    ai.favModels = f;
  } else delete ai.favModels;
  const targets = { ...base.targets, ...(d.targets || {}) };
  // история нормы: старые данные получают одну запись — текущую норму «с самого начала» (с первой записи дневника)
  const rawLog = Array.isArray(d.targetLog) ? d.targetLog.filter((r: any) => r && typeof r.at === 'number' && typeof r.kcal === 'number' && r.kcal > 0) : [];
  const firstTs = entries.reduce((a: number, e: any) => (typeof e.time === 'number' && e.time < a ? e.time : a), Date.now());
  const targetLog: TargetRecord[] = rawLog.length
    ? sortLog(rawLog.map((r: any) => ({ id: typeof r.id === 'string' && r.id ? r.id : uid(), at: r.at, kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs })))
    : [{ id: 'init', at: timestampAt(toKey(new Date(firstTs)), 0), kcal: targets.kcal, protein: targets.protein, fat: targets.fat, carbs: targets.carbs }];
  const statsMode = d.statsMode === 'latest' ? 'latest' : 'history';
  const autoMeal = d.autoMeal === false ? false : undefined;
  const icons = normalizeIconSettings(d.icons);
  const iconPacks = d.iconPacks && typeof d.iconPacks === 'object' && !Array.isArray(d.iconPacks)
    ? Object.fromEntries(Object.entries(d.iconPacks).filter(([, v]: any) => v && typeof v.bytes === 'number')) as Record<string, { bytes: number; at: number }>
    : {};
  const iconCache = d.iconCache && typeof d.iconCache === 'object' && !Array.isArray(d.iconCache)
    ? Object.fromEntries(Object.entries(d.iconCache).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')) as Record<string, string>
    : {};
  return { ...base, ...d, targets, targetLog, statsMode, autoMeal, icons, iconCache, iconPacks, meals, entries, menus, soundVolume, chats, chatSettings: cs, ai, collapsed: collapsed?.length ? collapsed : undefined } as AppData;
};

/** Панель ввода сворачивается в кнопку, только если в ней ничего не происходит. */
export const PANEL_IDLE_MS = 8000;
export const panelIsIdle = (s: { focus: boolean; text: string; photos: number; busy: boolean; sheetOpen: boolean; picking: boolean }) =>
  !s.focus && !s.text.trim() && s.photos === 0 && !s.busy && !s.sheetOpen && !s.picking;

/** Что показывать в раскрытой панели «+»: без фокуса — переключатель режимов, любимые и боковые кружки (только «Записать»); с фокусом — только чип модели, кнопка уходит внутрь инпута. */
export const panelParts = (o: { focus: boolean; ask: boolean; hasQuick: boolean }) => ({
  showSeg: true,
  showChip: o.focus,
  showQuick: !o.ask && !o.focus && o.hasQuick,
  showSide: !o.ask && !o.focus,
  buttonInside: o.focus,
});

/** Малая круглая кнопка справа внизу: есть текст/фото — «отправить», иначе — «свернуть». */
export const smallBtnMode = (o: { text: string; photos: number }): 'send' | 'collapse' => (o.text.trim() || o.photos > 0 ? 'send' : 'collapse');
/** Тап по ленте при раскрытой панели: пусто — свернуть в кнопку; есть текст/фото — только убрать фокус (ничего не теряется); в чате ничего не сворачиваем. */
export const outsideTapAction = (o: { text: string; photos: number; askMode: boolean }): 'collapse' | 'blur' =>
  o.askMode || o.text.trim() || o.photos > 0 ? 'blur' : 'collapse';

export const AD_MS = 3000;
/** Индекс следующего слайда рекламы блюд: по кругу, а при нескольких меню — случайный прыжок (но не на тот же слайд). */
export const nextSlide = (len: number, cur: number, random: boolean, rng: () => number = Math.random) => {
  if (len <= 1) return 0;
  if (!random) return (cur + 1) % len;
  let n = Math.floor(rng() * (len - 1));
  if (n >= cur) n++;
  return n;
};

/** Перемешанная копия (Фишер—Йетс). */
export const shuffle = <T,>(arr: readonly T[], rng: () => number = Math.random): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
/** Новая «колода»: порядок индексов 0..len-1; первый не равен `avoidFirst` (последнему блюду прошлого круга). */
export const newDeck = (len: number, avoidFirst = -1, rng: () => number = Math.random): number[] => {
  const d = shuffle(Array.from({ length: len }, (_, i) => i), rng);
  if (len > 1 && d[0] === avoidFirst) { const j = 1 + Math.floor(rng() * (len - 1)); [d[0], d[j]] = [d[j], d[0]]; }
  return d;
};
/** Шаг колоды: следующая карта; в конце круга колода тасуется заново (без повтора последней карты первой). */
export const deckStep = (deck: { order: number[]; pos: number }, rng: () => number = Math.random) => {
  const len = deck.order.length;
  if (deck.pos + 1 < len) return { order: deck.order, pos: deck.pos + 1 };
  return { order: newDeck(len, deck.order[len - 1], rng), pos: 0 };
};

/** Метка времени записи после правки времени: если минуты не менялись — прежняя (порядок записей внутри минуты не ломается). */
export const entryTimestamp = (prevTs: number, date: string, minutes: number) => (minutes === minutesOf(prevTs) ? prevTs : timestampAt(date, minutes));

/**
 * Может ли жест начать свайп по дню. Не начинается: во время анимации, при открытом полноэкранном чате,
 * при преимущественно вертикальном движении и если палец стартовал в зоне горизонтального списка (таблетки меню).
 * y0 — стартовая координата касания в окне; zone — вертикальный диапазон списка в окне.
 */
export const daySwipeAllowed = (o: { animating: boolean; chatOpen: boolean; dx: number; dy: number; y0: number; zone: { y: number; h: number } | null }): boolean => {
  if (o.animating || o.chatOpen) return false;
  if (!(Math.abs(o.dx) > 10 && Math.abs(o.dx) > Math.abs(o.dy) * 1.8)) return false;
  const z = o.zone;
  return !(z && o.y0 >= z.y - 6 && o.y0 <= z.y + z.h + 6);
};

// ---------- «руль» выбора доли порции ----------

/** Метка шкалы: значение, подпись, крупная ли (0…2 — крупные с широким шагом), позиция в px от начала шкалы. */
export interface PortionMark { v: number; label: string; big: boolean; x: number }
const FRAC: [number, string][] = [[0, '0'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '1'], [1.25, '1¼'], [1.5, '1½'], [1.75, '1¾'], [2, '2']];
/** Подпись доли: «¼», «1½», «2½», «7»… В режиме «десятичные» — 0.5, 1.25, 7 (без «7.00»). */
export const fracLabel = (v: number): string => {
  if (decimalOn()) return numLabel(v);
  const f = FRAC.find(([x]) => Math.abs(x - v) < 0.01);
  if (f) return f[1];
  const whole = Math.floor(v + 1e-6);
  const rest = v - whole;
  if (Math.abs(rest) < 0.01) return String(whole);
  if (Math.abs(rest - 0.5) < 0.01) return `${whole}½`;
  if (Math.abs(rest - 0.25) < 0.01) return `${whole}¼`;
  if (Math.abs(rest - 0.75) < 0.01) return `${whole}¾`;
  // восьмые: 1/8, 3/8, 5/8, 7/8 — для мелкого шага
  for (const e of [1, 3, 5, 7]) if (Math.abs(rest - e / 8) < 0.01) return `${whole ? whole + ' ' : ''}${e}/8`;
  return numLabel(v);
};
/** Мелкий шаг доли: в режиме дробей — 1/8, в десятичном — 0.1. Результат не отрицательный и без «хвостов» вроде 0.30000000004. */
export const stepPortion = (v: number, dir: 1 | -1): number => {
  if (decimalOn()) return Math.max(0, Math.round((v + dir * 0.1) * 10) / 10);
  const e = v * 8;
  const onGrid = Math.abs(e - Math.round(e)) < 0.02; // на трети (⅓, ⅔) сетки восьмых нет — идём к ближайшей восьмой в нужную сторону
  const next = onGrid ? Math.round(e) + dir : dir === 1 ? Math.ceil(e) : Math.floor(e);
  return Math.max(0, next / 8);
};
/** Шкала 0…10: до 2 — все дроби с шагом `bigGap`, дальше — каждые ½ с шагом `smallGap`. */
export const portionMarks = (bigGap = 60, smallGap = 34): PortionMark[] => {
  const out: PortionMark[] = FRAC.map(([v, label], i) => ({ v, label, big: true, x: i * bigGap }));
  let x = out[out.length - 1].x;
  for (let v = 2.5; v <= 10.0001; v += 0.5) { x += smallGap; out.push({ v, label: fracLabel(v), big: false, x }); }
  return out;
};
const GLYPH: Record<string, [string, string]> = { '¼': ['1', '4'], '½': ['1', '2'], '¾': ['3', '4'], '⅓': ['1', '3'], '⅔': ['2', '3'], '⅛': ['1', '8'], '⅜': ['3', '8'], '⅝': ['5', '8'], '⅞': ['7', '8'] };

/** Разбор подписи вроде «1½», «⅔», «3/8», «1 3/8» → целая часть и дробь (или null, если это обычное число). */
export function parseFrac(label: string): { whole: string; num: string; den: string } | null {
  const m = label.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (m) return { whole: m[1] || '', num: GLYPH[m[2]][0], den: GLYPH[m[2]][1] };
  const k = label.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (k) return { whole: k[1] || '', num: k[2], den: k[3] };
  return null;
}

/** Ближайшая метка к позиции прокрутки. */
export const markAtOffset = (marks: PortionMark[], x: number): PortionMark =>
  marks.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a), marks[0]);
/** Положение на шкале для любого значения (между метками — линейно): колесо плавно показывает и мелкие шаги. */
export const xForValue = (marks: PortionMark[], v: number): number => {
  if (v <= marks[0].v) return marks[0].x;
  for (let i = 1; i < marks.length; i++) {
    if (v <= marks[i].v + 1e-9) {
      const a = marks[i - 1], b = marks[i];
      return a.x + ((v - a.v) / (b.v - a.v)) * (b.x - a.x);
    }
  }
  return marks[marks.length - 1].x;
};
/** Обратно: значение под позицией прокрутки (линейно между метками). */
export const valueForX = (marks: PortionMark[], x: number): number => {
  if (x <= marks[0].x) return marks[0].v;
  for (let i = 1; i < marks.length; i++) {
    if (x <= marks[i].x) {
      const a = marks[i - 1], b = marks[i];
      return a.v + ((x - a.x) / (b.x - a.x)) * (b.v - a.v);
    }
  }
  return marks[marks.length - 1].v;
};
/** Ближайшая метка к значению (для начальной позиции). */
export const markForValue = (marks: PortionMark[], v: number): PortionMark =>
  marks.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a), marks[0]);

// ---------- история нормы ----------

const sameTargets = (r: { kcal: number; protein?: number; fat?: number; carbs?: number }, t: { kcal: number; protein?: number; fat?: number; carbs?: number }) =>
  r.kcal === t.kcal && (r.protein ?? null) === (t.protein ?? null) && (r.fat ?? null) === (t.fat ?? null) && (r.carbs ?? null) === (t.carbs ?? null);
export const sortLog = (log: TargetRecord[]) => [...log].sort((a, b) => a.at - b.at);
/** Записать изменение нормы (если норма действительно изменилась). */
export const recordTargets = (log: TargetRecord[] | undefined, t: { kcal: number; protein?: number; fat?: number; carbs?: number }, at = Date.now(), genId: () => string = uid, mergeMs = 120000): TargetRecord[] => {
  const cur = sortLog(log || []);
  const last = cur[cur.length - 1];
  if (last && sameTargets(last, t)) return cur;
  const rec = { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs };
  // правка поля по цифрам («1» → «18» → «1800») — одна запись: недавнюю запись заменяем, а не плодим
  if (last && at >= last.at && at - last.at < mergeMs && cur.length > 1) return [...cur.slice(0, -1), { ...last, ...rec, at }];
  return [...cur, { id: genId(), at, ...rec }];
};
/** Норма, действовавшая в день `dateKey` (на конец дня). До первой записи — первая запись. */
export const targetAt = (dateKey: string, log: TargetRecord[] | undefined, fallback: { kcal: number; protein?: number; fat?: number; carbs?: number }) => {
  const list = sortLog(log || []);
  if (!list.length) return fallback;
  const end = timestampAt(dateKey, 24 * 60 - 1) + 59999;
  let cur = list[0];
  for (const r of list) if (r.at <= end) cur = r;
  return { kcal: cur.kcal, protein: cur.protein ?? fallback.protein, fat: cur.fat ?? fallback.fat, carbs: cur.carbs ?? fallback.carbs };
};
/** Норма дня с учётом режима статистики. */
export const dayTarget = (d: Pick<AppData, 'targets' | 'targetLog' | 'statsMode'>, dateKey: string) =>
  d.statsMode === 'latest' ? d.targets : { ...d.targets, ...targetAt(dateKey, d.targetLog, d.targets) };
export const upsertTargetRecord = (log: TargetRecord[] | undefined, r: TargetRecord) => sortLog([...(log || []).filter((x) => x.id !== r.id), r]);
export const deleteTargetRecord = (log: TargetRecord[] | undefined, id: string) => (log || []).filter((x) => x.id !== id);
/** Текущая норма = последняя запись истории (после ручной правки истории). */
export const targetsFromLog = (targets: AppData['targets'], log: TargetRecord[] | undefined) => {
  const l = sortLog(log || []);
  const last = l[l.length - 1];
  if (!last) return targets;
  return { ...targets, kcal: last.kcal, protein: last.protein ?? targets.protein, fat: last.fat ?? targets.fat, carbs: last.carbs ?? targets.carbs };
};

// ---------- навигация по дням ----------

/** Можно ли перейти на день `date + n` (в будущее — нельзя). */
export const canGo = (date: string, n: number, today: string) => n < 0 || addDays(date, n) <= today;
/** День не позже сегодняшнего. */
export const clampDay = (date: string, today: string) => (date > today ? today : date);

// ---------- название меню по дате на фото ----------

const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const W = (alts: string) => new RegExp(`(^|[^а-яёіїєґa-z])(${alts})(?=$|[^а-яёіїєґa-z])`, 'i');
const WD_WORDS: [RegExp, number][] = [
  [W('пн|понедельник\\S*|пон|monday|mon|понеділ\\S*'), 1], [W('вт|вторник\\S*|tuesday|tue|вівтор\\S*'), 2], [W('ср|сред[аеуы]|среда|wednesday|wed|серед[аиу]'), 3],
  [W('чт|четверг\\S*|thursday|thu|четвер\\S*'), 4], [W('пт|пятниц\\S*|friday|fri|п.ятниц\\S*'), 5], [W('сб|суббот\\S*|saturday|sat|субот\\S*'), 6], [W('вс|воскресень\\S*|sunday|sun|неділ\\S*'), 0],
];
const MONTH_WORDS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
/**
 * Приводит название меню к виду «Сб (01.01.2026)», если в нём есть дата (и/или день недели).
 * Год, если его нет, берётся из `refDate` (ближайший к нему). Без даты — название без изменений.
 */
export const normalizeMenuTitle = (title: string, refDate: string): string => {
  const t = (title || '').trim();
  if (!t) return t;
  const ref = fromKey(refDate);
  let day: number | undefined, mon: number | undefined, year: number | undefined;
  const m1 = t.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (m1) { day = +m1[1]; mon = +m1[2] - 1; if (m1[3]) year = +m1[3] < 100 ? 2000 + +m1[3] : +m1[3]; }
  else {
    const m2 = t.toLowerCase().replace(/ё/g, 'е').match(/(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?/);
    if (m2) {
      const mi = MONTH_WORDS.findIndex((w, i) => (i === 4 ? /^ма[йя]/.test(m2[2]) : m2[2].startsWith(w)));
      if (mi >= 0) { day = +m2[1]; mon = mi; if (m2[3]) year = +m2[3]; }
    }
  }
  if (day === undefined || mon === undefined || mon < 0 || mon > 11 || day < 1 || day > 31) return t;
  if (year === undefined) {
    // год не указан: ближайшая к дню меню дата
    const cands = [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1].map((y) => new Date(y, mon!, day!));
    year = cands.reduce((a, b) => (Math.abs(b.getTime() - ref.getTime()) < Math.abs(a.getTime() - ref.getTime()) ? b : a)).getFullYear();
  }
  const d = new Date(year, mon, day);
  if (d.getMonth() !== mon) return t;
  return `${WD_SHORT[d.getDay()]} (${pad(day)}.${pad(mon + 1)}.${year})`;
};
/** Есть ли в названии день недели (без даты) — для подсказки. */
export const weekdayIn = (title: string): number | undefined => { for (const [re, n] of WD_WORDS) if (re.test(title)) return n; return undefined; };

// ---------- слияние блюд в одно ----------

const addOpt = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a || 0) + (b || 0));
/** Объединяет блюда (с долями порций) в одно целое: значения суммируются, название — сводка, состав — в заметке. */
export const mergeItems = (parts: { item: FoodItem; portion: number }[]): FoodItem => {
  const list = parts.filter((p) => p.item.name.trim());
  if (!list.length) return { name: '' };
  if (list.length === 1 && list[0].portion === 1) return { ...list[0].item };
  const sc = (v: number | undefined, p: number) => (v === undefined ? undefined : v * p);
  // неизвестное значение у части блюд — итог неизвестен (не делаем вид, что там ноль)
  const sumKey = (k: 'kcal' | 'protein' | 'fat' | 'carbs') => (list.every((p) => typeof p.item[k] === 'number') ? list.reduce((a, p) => a + (p.item[k] as number) * p.portion, 0) : undefined);
  const r1 = (v?: number) => (v === undefined ? undefined : Math.round(v * 10) / 10);
  const names = list.map((p) => (p.portion !== 1 ? `${p.item.name} (${fracLabel(p.portion)})` : p.item.name));
  const title = list.length <= 3 ? list.map((p) => p.item.name).join(' + ') : `${list[0].item.name} и ещё ${list.length - 1}`;
  const grams = list.every((p) => p.item.grams) ? list.reduce((a, p) => a + p.item.grams! * p.portion, 0) : undefined;
  const fiber = list.reduce<number | undefined>((a, p) => addOpt(a, sc(p.item.fiber, p.portion)), undefined);
  const sugar = list.reduce<number | undefined>((a, p) => addOpt(a, sc(p.item.sugar, p.portion)), undefined);
  const kcal = sumKey('kcal');
  return {
    name: title.slice(0, 80),
    kcal: kcal === undefined ? undefined : Math.round(kcal),
    protein: r1(sumKey('protein')), fat: r1(sumKey('fat')), carbs: r1(sumKey('carbs')),
    fiber: r1(fiber), sugar: r1(sugar),
    grams: grams ? Math.round(grams) : undefined,
    emoji: list[0].item.emoji,
    note: `Состав: ${names.join(', ')}`.slice(0, 160),
    section: list[0].item.section,
  };
};

// ---------- настройки иконок ----------

/** Меняет настройки иконок. Если поменялись источники онлайн-поиска или порядок запроса — кэш онлайн-поиска сбрасывается, чтобы изменения были видны сразу. */
export const setIconSettings = (d: AppData, next: IconSettings): AppData => {
  const cur = d.icons;
  const reset = !cur || JSON.stringify(cur.online) !== JSON.stringify(next.online) || cur.first !== next.first;
  return reset ? { ...d, icons: next, iconCache: {} } : { ...d, icons: next };
};
export const clearIconCache = (d: AppData): AppData => ({ ...d, iconCache: {} });
/** Ручная привязка иконки к названию блюда (null — снова автоматически). */
export const setManualIcon = (d: AppData, key: string, ref: IconRef | null): AppData => {
  const st = d.icons || normalizeIconSettings(undefined);
  const manual = { ...st.manual };
  if (ref) manual[key] = ref; else delete manual[key];
  return { ...d, icons: { ...st, manual } };
};
export const cacheIcon = (d: AppData, key: string, icon: string): AppData => (d.iconCache?.[key] === icon ? d : { ...d, iconCache: { ...(d.iconCache || {}), [key]: icon } });
export const setPackDownloaded = (d: AppData, prefix: string, info: { bytes: number; at: number } | null): AppData => {
  const cur = { ...(d.iconPacks || {}) };
  if (info) cur[prefix] = info; else delete cur[prefix];
  return { ...d, iconPacks: cur };
};

/** Название меню из ответа ИИ: с датой → «Сб (01.01.2026)»; только день недели → ближайший к дню загрузки такой день; иначе — undefined (название по дню). */
export const menuTitleFromAI = (title: string | undefined, refDate: string): string | undefined => {
  const t = (title || '').trim();
  if (!t) return undefined;
  const norm = normalizeMenuTitle(t, refDate);
  if (norm !== t || /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс) \(\d{2}\.\d{2}\.\d{4}\)$/.test(t)) return norm;
  const wd = weekdayIn(t);
  if (wd === undefined) return undefined;
  // только день недели: ближайшая к дню загрузки дата с этим днём (±3 дня)
  for (const off of [0, 1, -1, 2, -2, 3, -3]) {
    const k = addDays(refDate, off);
    if (fromKey(k).getDay() === wd) { const d = fromKey(k); return `${WD_SHORT[wd]} (${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()})`; }
  }
  return undefined;
};
