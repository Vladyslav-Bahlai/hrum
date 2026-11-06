import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppData, Chat, ChatMsg, ChatSettings, Entry, FoodItem, IconRef, IconSettings, MealDef, Menu, Profile, TargetRecord, Targets, WeightPoint } from './types';
import { calcTargets, DEFAULT_MEALS, setDayStart, setDecimalMode, setMealsConfig } from './utils';
import * as L from './logic';
import * as CH from './chat';
import { deletePhoto, loadData, resolveSoundUri, saveData } from './storage';
import { DEFAULT_MODELS } from './ai';
import { defaultIconSettings } from './iconify';
import { setSoundMap, setSoundResolver, setSoundsEnabled, setSoundVolume } from './sound';

const defaultProfile: Profile = { name: '', sex: 'male', age: 30, height: 178, weight: 80, activity: 1.375, goal: 'lose' };

export const defaultData = (): AppData => {
  const targets = calcTargets(defaultProfile);
  return {
  version: 1,
  onboarded: false,
  profile: defaultProfile,
  targets,
  targetLog: [{ id: 'init', at: Date.now(), kcal: targets.kcal, protein: targets.protein, fat: targets.fat, carbs: targets.carbs }],
  ai: { provider: 'gemini', claudeModel: DEFAULT_MODELS.claude, geminiModel: DEFAULT_MODELS.gemini },
  entries: [],
  favorites: [],
  menus: [],
  weights: [],
  water: {},
  meals: DEFAULT_MEALS,
  soundMap: {},
  icons: defaultIconSettings(),
  iconPacks: {},
  iconCache: {},
  };
};

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
  saveTargetRecord: (r: TargetRecord) => void;
  /** последнюю оставшуюся запись удалить нельзя */
  deleteTargetRecord: (id: string) => void;
  setProfile: (p: Profile) => void;
  replaceAll: (d: AppData) => void;
  saveMenu: (m: Menu) => void;
  deleteMenu: (id: string) => void;
  attachMenu: (id: string, date: string) => void;
  detachMenu: (id: string, date: string) => void;
  setMenuDone: (id: string, done: boolean) => void;
  setDishClosed: (menuId: string, name: string, closed: boolean) => void;
  setMeals: (m: MealDef[]) => void;
  setSoundMap: (m: Record<string, string>) => void;
  cacheModels: (p: 'claude' | 'gemini', list: string[]) => void;
  toggleCollapsed: (key: string) => void;
  toggleFavModel: (p: 'claude' | 'gemini', model: string) => void;
  appendChatMsg: (chatId: string, msg: ChatMsg) => void;
  deleteChat: (id: string) => void;
  clearChats: () => void;
  createChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  togglePinChat: (id: string) => void;
  restoreChat: (chat: Chat) => void;
  setChatSettings: (s: ChatSettings) => void;
  setIconSettings: (s: IconSettings) => void;
  clearIconCache: () => void;
  setManualIcon: (key: string, ref: IconRef | null) => void;
  cacheIcon: (key: string, icon: string) => void;
  setPackDownloaded: (prefix: string, info: { bytes: number; at: number } | null) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const first = useRef(true);

  useEffect(() => { setSoundsEnabled(data.sounds !== false); }, [data.sounds]);
  useEffect(() => { setSoundMap(data.soundMap || {}); }, [data.soundMap]);
  useEffect(() => { setSoundVolume(data.soundVolume); }, [data.soundVolume]);
  useEffect(() => { setMealsConfig(data.meals); }, [data.meals]);
  useEffect(() => { setDecimalMode(data.decimals); }, [data.decimals]);
  useEffect(() => { setDayStart(data.dayStart); }, [data.dayStart]);
  useEffect(() => { setSoundResolver(resolveSoundUri); }, []);
  useEffect(() => {
    loadData().then((d) => {
      if (d) {
        const base = L.migrate(d, defaultData());
        // автоочистка старых чатов при запуске
        const cs = CH.chatSettings(base);
        const next = CH.pruneChats(base, new Date(), cs.keepDays, cs.dayStartHour);
        if (next !== base) purgeChatPhotos((base.chats || []).filter((c) => !(next.chats || []).some((n) => n.id === c.id)));
        setMealsConfig(next.meals);
        setData(next);
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
      addEntries: (list) => update((d) => L.addEntries(d, list)),
      updateEntry: (id, patch) => update((d) => L.updateEntry(d, id, patch)),
      removeEntry: (id) => update((d) => L.removeEntry(d, id)),
      restoreEntry: (e) => update((d) => L.restoreEntry(d, e)),
      toggleFavorite: (item) => update((d) => L.toggleFavorite(d, item)),
      savePreset: (item, id) => update((d) => L.savePreset(d, item, id)),
      deletePreset: (id) => update((d) => L.deletePreset(d, id)),
      replaceMenuItem: (menuId, index, item) => update((d) => L.replaceMenuItem(d, menuId, index, item)),
      isFavorite: (item) => !!data.favorites.find((f) => L.sameItem(f.item, item)),
      setWater: (date, glasses) => update((d) => L.setWater(d, date, glasses)),
      addWeight: (w) => update((d) => L.addWeight(d, w)),
      removeWeight: (date) => update((d) => L.removeWeight(d, date)),
      setTargets: (t) => update((d) => ({ ...d, targets: t, targetLog: L.recordTargets(d.targetLog, t) })),
      saveTargetRecord: (r) => update((d) => { const targetLog = L.upsertTargetRecord(d.targetLog, r); return { ...d, targetLog, targets: L.targetsFromLog(d.targets, targetLog) }; }),
      deleteTargetRecord: (id) => update((d) => { const left = L.deleteTargetRecord(d.targetLog, id); const targetLog = left.length ? left : d.targetLog; return { ...d, targetLog, targets: L.targetsFromLog(d.targets, targetLog) }; }),
      setProfile: (p) => update((d) => ({ ...d, profile: p })),
      saveMenu: (m) => update((d) => L.saveMenu(d, m)),
      attachMenu: (id, date) => update((d) => L.attachMenu(d, id, date)),
      detachMenu: (id, date) => update((d) => L.detachMenu(d, id, date)),
      setMenuDone: (id, done) => update((d) => L.setMenuDone(d, id, done)),
      setDishClosed: (menuId, name, closed) => update((d) => L.setDishClosed(d, menuId, name, closed)),
      setMeals: (meals) => update((d) => L.setMeals(d, meals)),
      setSoundMap: (m) => update((d) => L.setSoundMap(d, m)),
      cacheModels: (p, list) => update((d) => L.cacheModels(d, p, list)),
      toggleCollapsed: (key) => update((d) => L.toggleCollapsed(d, key)),
      toggleFavModel: (p, model) => update((d) => L.toggleFavModel(d, p, model)),
      appendChatMsg: (chatId, msg) => update((d) => CH.appendChatMsg(d, chatId, msg)),
      deleteChat: (id) => update((d) => CH.deleteChat(d, id)),
      clearChats: () => update((d) => CH.clearChats(d)),
      createChat: (id) => update((d) => CH.createChat(d, id)),
      renameChat: (id, title) => update((d) => CH.renameChat(d, id, title)),
      togglePinChat: (id) => update((d) => CH.togglePinChat(d, id)),
      restoreChat: (chat) => update((d) => CH.upsertChat(d, chat)),
      setChatSettings: (cs) => update((d) => ({ ...d, chatSettings: cs })),
      setIconSettings: (st) => update((d) => L.setIconSettings(d, st)),
      clearIconCache: () => update((d) => L.clearIconCache(d)),
      setManualIcon: (key, ref) => update((d) => L.setManualIcon(d, key, ref)),
      cacheIcon: (key, icon) => update((d) => L.cacheIcon(d, key, icon)),
      setPackDownloaded: (prefix, info) => update((d) => L.setPackDownloaded(d, prefix, info)),
      deleteMenu: (id) => update((d) => L.deleteMenu(d, id)),
      replaceAll: (nd) => setData({ ...defaultData(), ...nd, onboarded: true }),
    }),
    [data, ready, update],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Окончательно удалить фото записи (после того как «Отменить» уже недоступно). */
export const purgePhoto = (e: Entry) => deletePhoto(e.photo);

/** Удалить файлы фото из чатов (когда чаты удалены окончательно). */
export const purgeChatPhotos = (chats: Chat[]) => { for (const u of CH.chatPhotos(chats)) deletePhoto(u); };
