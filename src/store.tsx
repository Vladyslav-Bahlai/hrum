import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppData, Entry, FoodItem, MealDef, Menu, Profile, Targets, WeightPoint } from './types';
import { calcTargets, DEFAULT_MEALS, mealAtMinutes, setMealsConfig, todayKey, toKey, uid } from './utils';
import { deletePhoto, loadData, saveData } from './storage';
import { DEFAULT_MODELS } from './ai';
import { setSoundMap, setSoundsEnabled } from './sound';

const defaultProfile: Profile = { name: '', sex: 'male', age: 30, height: 178, weight: 80, activity: 1.375, goal: 'lose' };

export const defaultData = (): AppData => ({
  version: 1,
  onboarded: false,
  profile: defaultProfile,
  targets: calcTargets(defaultProfile),
  ai: { provider: 'gemini', claudeModel: DEFAULT_MODELS.claude, geminiModel: DEFAULT_MODELS.gemini },
  entries: [],
  favorites: [],
  menus: [],
  weights: [],
  water: {},
  meals: DEFAULT_MEALS,
  soundMap: {},
});

interface Store {
  data: AppData;
  ready: boolean;
  update: (fn: (d: AppData) => AppData) => void;
  addEntries: (e: Omit<Entry, 'id'>[]) => void;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  removeEntry: (id: string) => void;
  restoreEntry: (e: Entry) => void;
  toggleFavorite: (item: FoodItem) => void;
  savePreset: (item: FoodItem, id?: string) => void;
  deletePreset: (id: string) => void;
  replaceMenuItem: (menuId: string, index: number, item: FoodItem) => void;
  isFavorite: (item: FoodItem) => boolean;
  setWater: (date: string, glasses: number) => void;
  addWeight: (w: WeightPoint) => void;
  removeWeight: (date: string) => void;
  setTargets: (t: Targets) => void;
  setProfile: (p: Profile) => void;
  replaceAll: (d: AppData) => void;
  saveMenu: (m: Menu) => void;
  deleteMenu: (id: string) => void;
  attachMenu: (id: string, date: string) => void;
  detachMenu: (id: string, date: string) => void;
  setMenuDone: (id: string, done: boolean) => void;
  setMeals: (m: MealDef[]) => void;
  setSoundMap: (m: Record<string, string>) => void;
  cacheModels: (p: 'claude' | 'gemini', list: string[]) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

const sameItem = (a: FoodItem, b: FoodItem) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const first = useRef(true);

  useEffect(() => { setSoundsEnabled(data.sounds !== false); }, [data.sounds]);
  useEffect(() => { setSoundMap(data.soundMap || {}); }, [data.soundMap]);
  useEffect(() => { setMealsConfig(data.meals); }, [data.meals]);
  useEffect(() => {
    loadData().then((d) => {
      if (d) {
        const menus = (d.menus || []).map((m: any) => ({ ...m, dates: Array.isArray(m.dates) ? m.dates : [toKey(new Date(m.created || Date.now()))] }));
        const meals: MealDef[] = d.meals && d.meals.length ? d.meals : DEFAULT_MEALS;
        setMealsConfig(meals);
        // старые записи с «перекусом» раскладываем по времени суток
        const entries = (d.entries || []).map((e: any) => (meals.some((m) => m.key === e.meal) ? e : { ...e, meal: mealAtMinutes(new Date(e.time).getHours() * 60 + new Date(e.time).getMinutes(), meals) }));
        setData({ ...defaultData(), ...d, meals, entries, menus, ai: { ...defaultData().ai, ...(d.ai || {}) } } as AppData);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (first.current) {
      first.current = false;
      return;
    }
    saveData(data);
  }, [data, ready]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);

  const store = useMemo<Store>(
    () => ({
      data,
      ready,
      update,
      addEntries: (list) =>
        update((d) => {
          const added = list.map((e) => ({ ...e, id: uid() }));
          // учёт частоты для «Частых блюд»
          const favs = d.favorites.map((f) => {
            const n = added.filter((a) => sameItem(a.item, f.item)).length;
            return n ? { ...f, uses: f.uses + n } : f;
          });
          return { ...d, entries: [...d.entries, ...added], favorites: favs };
        }),
      updateEntry: (id, patch) =>
        update((d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      removeEntry: (id) =>
        update((d) => {
          return { ...d, entries: d.entries.filter((x) => x.id !== id) };
        }),
      restoreEntry: (e) => update((d) => ({ ...d, entries: [...d.entries, e] })),
      toggleFavorite: (item) =>
        update((d) => {
          const has = d.favorites.find((f) => sameItem(f.item, item));
          if (has) return { ...d, favorites: d.favorites.filter((f) => f !== has) };
          return { ...d, favorites: [...d.favorites, { id: uid(), item: { ...item }, uses: 1 }] };
        }),
      savePreset: (item, id) =>
        update((d) => {
          const clean = { ...item, portion: undefined };
          if (id && d.favorites.some((f) => f.id === id)) return { ...d, favorites: d.favorites.map((f) => (f.id === id ? { ...f, item: clean } : f)) };
          const same = d.favorites.find((f) => sameItem(f.item, item));
          if (same) return { ...d, favorites: d.favorites.map((f) => (f === same ? { ...f, item: clean } : f)) };
          return { ...d, favorites: [{ id: uid(), item: clean, uses: 0 }, ...d.favorites] };
        }),
      deletePreset: (id) => update((d) => ({ ...d, favorites: d.favorites.filter((f) => f.id !== id) })),
      replaceMenuItem: (menuId, index, item) =>
        update((d) => ({ ...d, menus: d.menus.map((m) => (m.id === menuId ? { ...m, items: m.items.map((it, i) => (i === index ? { ...item, section: it.section, portion: undefined } : it)) } : m)) })),
      isFavorite: (item) => !!data.favorites.find((f) => sameItem(f.item, item)),
      setWater: (date, glasses) => update((d) => ({ ...d, water: { ...d.water, [date]: Math.max(0, glasses) } })),
      addWeight: (w) =>
        update((d) => ({
          ...d,
          weights: [...d.weights.filter((x) => x.date !== w.date), w].sort((a, b) => a.date.localeCompare(b.date)),
          profile: w.date >= todayKey() || !d.weights.some((x) => x.date > w.date) ? { ...d.profile, weight: w.kg } : d.profile,
        })),
      removeWeight: (date) => update((d) => ({ ...d, weights: d.weights.filter((x) => x.date !== date) })),
      setTargets: (t) => update((d) => ({ ...d, targets: t })),
      setProfile: (p) => update((d) => ({ ...d, profile: p })),
      saveMenu: (m) => update((d) => ({ ...d, menus: d.menus.some((x) => x.id === m.id) ? d.menus.map((x) => (x.id === m.id ? m : x)) : [m, ...d.menus] })),
      attachMenu: (id, date) => update((d) => ({ ...d, menus: d.menus.map((m) => (m.id === id && !m.dates.includes(date) ? { ...m, dates: [...m.dates, date].sort() } : m)) })),
      detachMenu: (id, date) => update((d) => ({ ...d, menus: d.menus.map((m) => (m.id === id ? { ...m, dates: m.dates.filter((x) => x !== date) } : m)) })),
      setMenuDone: (id, done) => update((d) => ({ ...d, menus: d.menus.map((m) => (m.id === id ? { ...m, done } : m)) })),
      setMeals: (meals) =>
        update((d) => {
          const keys = new Set(meals.map((m) => m.key));
          const entries = d.entries.map((e) => (keys.has(e.meal) ? e : { ...e, meal: mealAtMinutes(new Date(e.time).getHours() * 60 + new Date(e.time).getMinutes(), meals) }));
          return { ...d, meals, entries };
        }),
      setSoundMap: (m) => update((d) => ({ ...d, soundMap: m })),
      cacheModels: (p, list) => update((d) => ({ ...d, ai: { ...d.ai, models: { ...(d.ai.models || {}), [p]: list } } })),
      deleteMenu: (id) => update((d) => ({ ...d, menus: d.menus.filter((x) => x.id !== id) })),
      replaceAll: (nd) => setData({ ...defaultData(), ...nd, onboarded: true }),
    }),
    [data, ready, update],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Окончательно удалить фото записи (после того как «Отменить» уже недоступно). */
export const purgePhoto = (e: Entry) => deletePhoto(e.photo);
