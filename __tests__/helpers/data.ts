import { AppData, Entry, FoodItem, Menu } from '../../src/types';
import { calcTargets, DEFAULT_MEALS } from '../../src/utils';

export const profile = { name: 'Тест', sex: 'male' as const, age: 30, height: 178, weight: 80, activity: 1.375, goal: 'lose' as const };

export const baseData = (): AppData => ({
  version: 1, onboarded: true, profile, targets: calcTargets(profile),
  ai: { provider: 'gemini', claudeModel: 'claude-x', geminiModel: 'gemini-x' },
  entries: [], favorites: [], menus: [], weights: [], water: {}, meals: DEFAULT_MEALS, soundMap: {},
});

export const item = (name: string, kcal = 100, extra: Partial<FoodItem> = {}): FoodItem => ({ name, kcal, protein: 10, fat: 5, carbs: 12, ...extra });

/** Метка времени «дата + ЧЧ:ММ» по местному времени. */
export const at = (date: string, h: number, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };

export const entry = (id: string, date: string, h: number, it: FoodItem, extra: Partial<Entry> = {}): Entry =>
  ({ id, date, time: at(date, h), meal: 'lunch', item: it, portion: 1, source: 'manual', ...extra });

export const menu = (id: string, dates: string[], items: FoodItem[], extra: Partial<Menu> = {}): Menu =>
  ({ id, title: 'Меню ' + id, created: 1, dates, items, ...extra });
