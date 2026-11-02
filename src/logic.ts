import { AISettings, AppData, Entry, FoodItem, MealDef, Menu, WeightPoint } from './types';
import { chatSettings } from './chat';
import { DEFAULT_MEALS, mealAtMinutes, minutesOf, timestampAt, toKey, todayKey, uid } from './utils';

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
  return { ...base, ...d, meals, entries, menus, soundVolume, chats, chatSettings: cs, ai, collapsed: collapsed?.length ? collapsed : undefined } as AppData;
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
