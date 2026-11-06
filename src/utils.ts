import { MealDef, Entry, FoodItem, MealType, Nutrients, Profile, Targets } from './types';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** Во сколько «кончается» день (настройка, часы): запись в 00:30 при значении 4 ещё относится к вчерашнему дню. */
let dayStartH = 4;
export const setDayStart = (h?: number) => { dayStartH = typeof h === 'number' && h >= 0 && h <= 11 ? Math.floor(h) : 4; };
export const getDayStart = () => dayStartH;
export const dayKeyAt = (ts: number | Date = Date.now(), startH = dayStartH) => toKey(new Date((typeof ts === 'number' ? ts : ts.getTime()) - startH * 3600000));
export const todayKey = () => dayKeyAt(Date.now());
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
};

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export const humanDate = (k: string) => {
  const t = todayKey();
  if (k === t) return 'Сегодня';
  if (k === addDays(t, -1)) return 'Вчера';
  if (k === addDays(t, 1)) return 'Завтра';
  const d = fromKey(k);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD[d.getDay()]}`;
};
export const shortDate = (k: string) => {
  const d = fromKey(k);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`;
};

export const DEFAULT_MEALS: MealDef[] = [
  { key: 'breakfast', label: 'Завтрак', emoji: '🌅', from: 6 * 60, to: 11 * 60 },
  { key: 'lunch', label: 'Обед', emoji: '🍲', from: 11 * 60, to: 17 * 60 },
  { key: 'dinner', label: 'Ужин', emoji: '🌙', from: 17 * 60, to: 24 * 60 },
];
let curMeals: MealDef[] = DEFAULT_MEALS;
export const setMealsConfig = (m?: MealDef[]) => { curMeals = m && m.length ? m : DEFAULT_MEALS; };
export const getMeals = () => curMeals;
/** Категория для записей, чей приём пищи удалён/неизвестен. */
export const OTHER_MEAL: MealDef = { key: '_other', label: 'Другое', emoji: '🍽', from: 0, to: 0 };
export const mealDef = (k: MealType): MealDef => curMeals.find((x) => x.key === k) || OTHER_MEAL;
export const mealLabel = (k: MealType) => mealDef(k).label;
export const minutesLabel = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Приём пищи по времени суток: интервал, в который попадает время; иначе ближайший. */
export const mealAtMinutes = (min: number, meals = curMeals): MealType => {
  const hit = meals.find((m) => (m.from <= m.to ? min >= m.from && min < m.to : min >= m.from || min < m.to));
  if (hit) return hit.key;
  let best = meals[0], bd = 1e9;
  for (const m of meals) {
    for (const e of [m.from, m.to]) {
      const d = Math.min(Math.abs(e - min), 1440 - Math.abs(e - min));
      if (d < bd) { bd = d; best = m; }
    }
  }
  return best.key;
};
export const mealByTime = (date = new Date()): MealType => mealAtMinutes(date.getHours() * 60 + date.getMinutes());

/** «Понедельник, 2 ноября» — название меню по умолчанию. */
export const menuTitleFor = (k: string) => {
  const d = fromKey(k);
  const wd = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][d.getDay()];
  return `${wd}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};

export const PORTIONS: { v: number; label: string }[] = [
  { v: 0.25, label: '¼' },
  { v: 1 / 3, label: '⅓' },
  { v: 0.5, label: '½' },
  { v: 2 / 3, label: '⅔' },
  { v: 0.75, label: '¾' },
  { v: 1, label: '1' },
  { v: 1.25, label: '1¼' },
  { v: 1.5, label: '1½' },
  { v: 1.75, label: '1¾' },
  { v: 2, label: '2' },
];
/** Режим «десятичные числа вместо дробей» (настройка): 0.5 вместо ½, целые остаются целыми. */
let decimalMode = false;
export const setDecimalMode = (v?: boolean) => { decimalMode = !!v; };
export const decimalOn = () => decimalMode;
/** Число без лишних нулей: 1 → «1», 0.5 → «0.5», 0.333 → «0.33» (никаких «3.00»). */
export const numLabel = (v: number): string => String(Math.round(v * 100) / 100);
/** ⅓/⅔ в разных шрифтах выглядят по-разному — в тексте пишем «1/3», «2/3»; ¼ ½ ¾ везде рисуются одинаково. */
export const plainFrac = (l: string) => l.replace('⅓', '1/3').replace('⅔', '2/3');
export const portionLabel = (p: number) => {
  if (decimalMode) return numLabel(p);
  const f = PORTIONS.find((x) => Math.abs(x.v - p) < 0.01);
  return f ? plainFrac(f.label) : (Math.round(p * 100) / 100).toString();
};

const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

/** Что в блюде указано, а что нет. Пустое поле — «неизвестно», а не ноль. */
export function known(item: FoodItem): { kcal: boolean; protein: boolean; fat: boolean; carbs: boolean } {
  const p = isNum(item.protein), f = isNum(item.fat), c = isNum(item.carbs);
  // Ноль везде — это «не заполнено» (так выглядят старые записи и пустые формы), а не «в блюде ничего нет».
  const anyPositive = (item.kcal || 0) > 0 || (item.protein || 0) > 0 || (item.fat || 0) > 0 || (item.carbs || 0) > 0;
  if (!anyPositive) return { kcal: false, protein: false, fat: false, carbs: false };
  // Б, Ж и У одновременно «0» при ненулевых калориях — тоже «не заполнено», а не «БЖУ нет».
  const blank = p && f && c && !item.protein && !item.fat && !item.carbs && (item.kcal || 0) > 0;
  return { kcal: isNum(item.kcal), protein: p && !blank, fat: f && !blank, carbs: c && !blank };
}
export const hasAllMacros = (item: FoodItem) => { const k = known(item); return k.protein && k.fat && k.carbs; };
export const hasAnyMacros = (item: FoodItem) => { const k = known(item); return k.protein || k.fat || k.carbs; };

/** КБЖУ блюда на порцию (неизвестное → 0, для арифметики); информацию о пропусках даёт known(). */
export const nut = (item: FoodItem, mult = 1): Required<Nutrients> => {
  const k = known(item);
  return {
    kcal: (k.kcal ? item.kcal! : 0) * mult,
    protein: (k.protein ? item.protein! : 0) * mult,
    fat: (k.fat ? item.fat! : 0) * mult,
    carbs: (k.carbs ? item.carbs! : 0) * mult,
    fiber: (item.fiber || 0) * mult,
    sugar: (item.sugar || 0) * mult,
  };
};
export const kcalOf = (item: FoodItem, mult = 1) => nut(item, mult).kcal;

export const scaled = (e: Entry): Required<Nutrients> => nut(e.item, e.portion);

/** «Б 12 · Ж 5 · У 30»; неуказанное — «—», если ничего нет — «БЖУ не указаны». */
export const macroText = (item: FoodItem, mult = 1, long = false) => {
  const k = known(item);
  if (!k.protein && !k.fat && !k.carbs) return 'БЖУ не указаны';
  const v = (on: boolean, n?: number) => (on ? String(r1((n || 0) * mult)) : '—');
  return long
    ? `Б ${v(k.protein, item.protein)} · Ж ${v(k.fat, item.fat)} · У ${v(k.carbs, item.carbs)}`
    : `Б ${v(k.protein, item.protein)} Ж ${v(k.fat, item.fat)} У ${v(k.carbs, item.carbs)}`;
};
export const kcalText = (item: FoodItem, mult = 1) => (known(item).kcal ? `${fmt(item.kcal! * mult)} ккал` : 'ккал не указаны');

export interface Sum extends Required<Nutrients> {
  /** сколько записей не содержат данных (по каждому показателю) */
  unk: { kcal: number; protein: number; fat: number; carbs: number; anyMacro: number; any: number };
  count: number;
}

export const sum = (entries: Entry[]): Sum => {
  const s: Sum = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, count: entries.length,
    unk: { kcal: 0, protein: 0, fat: 0, carbs: 0, anyMacro: 0, any: 0 } };
  for (const e of entries) {
    const n = scaled(e);
    const k = known(e.item);
    s.kcal += n.kcal; s.protein += n.protein; s.fat += n.fat; s.carbs += n.carbs;
    s.fiber += n.fiber; s.sugar += n.sugar;
    if (!k.kcal) s.unk.kcal++;
    if (!k.protein) s.unk.protein++;
    if (!k.fat) s.unk.fat++;
    if (!k.carbs) s.unk.carbs++;
    if (!k.protein || !k.fat || !k.carbs) s.unk.anyMacro++;
    if (!k.kcal || !k.protein || !k.fat || !k.carbs) s.unk.any++;
  }
  return s;
};

export const r0 = (n: number) => Math.round(n);
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmt = (n: number) => r0(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Миффлин — Сан-Жеор + коэффициент активности + цель. */
export function calcTargets(p: Profile, waterGlasses = 8): Targets {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  let kcal = bmr * p.activity;
  if (p.goal === 'lose') kcal *= 0.83;
  if (p.goal === 'gain') kcal *= 1.12;
  kcal = Math.round(kcal / 10) * 10;
  const protein = Math.round(p.weight * (p.goal === 'keep' ? 1.4 : 1.7));
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs, waterGlasses };
}

export const ACTIVITY = [
  { v: 1.2, label: 'Сидячий', hint: 'офис, почти без спорта' },
  { v: 1.375, label: 'Лёгкий', hint: '1–3 тренировки в неделю' },
  { v: 1.55, label: 'Средний', hint: '3–5 тренировок' },
  { v: 1.725, label: 'Высокий', hint: '6–7 тренировок' },
  { v: 1.9, label: 'Атлет', hint: 'физическая работа + спорт' },
];

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

/** «Завтрак», «Обед», «2-й завтрак», «Полдник»… → приём пищи из текущих категорий */
export const mealFromSection = (section?: string): MealType | undefined => {
  if (!section) return undefined;
  const t = section.toLowerCase();
  let hour: number | undefined;
  if (/ужин/.test(t)) hour = /(2|втор)/.test(t) ? 20.5 : 19;
  else if (/полдник|перекус|снек|десерт/.test(t)) hour = 16;
  else if (/завтрак/.test(t)) hour = /(2|втор)/.test(t) ? 10 : 8;
  else if (/обед|суп|салат|перв|втор|горяч/.test(t)) hour = 13.5;
  if (hour === undefined) return undefined;
  const byLabel = curMeals.find((m) => /ужин/.test(t) ? /ужин/i.test(m.label) : /завтрак/.test(t) && !/(2|втор)/.test(t) ? /завтрак/i.test(m.label) : /обед/.test(t) ? /обед/i.test(m.label) : false);
  return byLabel ? byLabel.key : mealAtMinutes(Math.round(hour * 60));
};

/** «½ порции», «200 г» или «×0.7» — как понятнее. */
export const amountLabel = (portion: number, grams?: number) => {
  const f = PORTIONS.find((x) => Math.abs(x.v - portion) < 0.01);
  if (f) return f.v === 1 ? '1 порция' : `${decimalMode ? numLabel(f.v) : plainFrac(f.label)} порции`;
  if (grams) return `${Math.round(grams * portion)} г`;
  return `×${Math.round(portion * 100) / 100}`;
};

// ---------- время записи ----------

/** Минуты от полуночи из метки времени. */
export const minutesOf = (ts: number) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };

/** Метка времени «дата + минуты от полуночи». */
export const timestampAt = (dateKey: string, minutes: number) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).getTime();
};

/**
 * Метка времени для записи дня `dateKey`: часы до начала нового дня (по настройке) принадлежат ЭТОМУ дню, но идут после вечера —
 * запись в 00:30 попадает в конец вчерашнего дня, а не становится первой в сегодняшнем.
 */
export const logicalAt = (dateKey: string, minutes: number, startH = dayStartH) =>
  timestampAt(dateKey, minutes < startH * 60 ? minutes + 1440 : minutes);

/** «1930» → «19:30», «9» → «9», «093» → «09:3»: подстановка двоеточия при вводе цифр. */
export const formatTimeInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

/** «19:30» / «9:05» / «930» → минуты от полуночи; некорректное → null. */
export const parseTime = (text: string): number | null => {
  const t = text.trim();
  let h: number, m: number;
  const c = /^(\d{1,2})[:.](\d{1,2})$/.exec(t);
  if (c) { h = +c[1]; m = +c[2]; if (c[2].length < 2) return null; }
  else if (/^\d{3,4}$/.test(t)) { h = +t.slice(0, -2); m = +t.slice(-2); }
  else return null;
  return h < 24 && m < 60 ? h * 60 + m : null;
};

/** Сдвиг времени на шаг с переходом через полночь не делаем — упираемся в границы суток. */
export const shiftMinutes = (min: number, delta: number) => Math.max(0, Math.min(1439, min + delta));

// ---------- меню: остатки и закрытые блюда ----------

/** Сколько порций каждого блюда меню отмечено в дневнике за день. */
export const eatenByName = (entries: Entry[], date: string, menuId: string): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const e of entries) if (e.date === date && e.menuId === menuId) map[e.item.name] = (map[e.item.name] || 0) + e.portion;
  return map;
};

export const isClosed = (menu: { closed?: string[] }, name: string) => !!menu.closed?.includes(name);

/** «осталась ½» / «осталась ¼» / «осталась ⅓» / «осталось 30%»; null — если съедено целиком. */
export const remainLabel = (eaten: number): string | null => {
  if (eaten >= 0.99) return null;
  const rest = 1 - eaten;
  const near = (v: number) => Math.abs(rest - v) < 0.02;
  if (near(0.5)) return 'осталась ½';
  if (near(0.25)) return 'осталась ¼';
  if (near(1 / 3)) return 'осталась ⅓';
  if (near(2 / 3)) return 'осталось ⅔';
  if (near(0.75)) return 'осталось ¾';
  return `осталось ${Math.max(1, Math.round(rest * 100))}%`;
};

export type DishState = { kind: 'none' | 'part' | 'done' | 'closed'; label: string };
/** Состояние блюда меню в выбранный день. */
export const dishState = (eaten: number, closed: boolean): DishState => {
  if (closed) return { kind: 'closed', label: 'закрыто' };
  if (eaten <= 0.001) return { kind: 'none', label: '' };
  const rest = remainLabel(eaten);
  if (rest) return { kind: 'part', label: rest };
  const f = PORTIONS.find((p) => Math.abs(p.v - eaten) < 0.01);
  return { kind: 'done', label: eaten > 1.01 ? `съедено ${f ? f.label : r1(eaten)}` : 'съедено' };
};

/** Блюда, которые ещё предстоит отметить: не тронутые и не закрытые. */
export const restItems = (menu: { items: FoodItem[]; closed?: string[] }, eaten: Record<string, number>) =>
  menu.items.filter((it) => !eaten[it.name] && !isClosed(menu, it.name));

/** Сколько блюд осталось в меню(ах) дня. */
export const menuLeftCount = (menus: { id: string; items: FoodItem[]; closed?: string[] }[], entries: Entry[], date: string) =>
  menus.reduce((n, m) => n + restItems(m, eatenByName(entries, date, m.id)).length, 0);

export interface AdSlide { menuId: string; menuTitle: string; item: FoodItem }
/** Блюда для «рекламной» карусели: несъеденные и незакрытые; из всех меню дня (порядок исходный; «колоду» тасует карусель). */
export const carouselSlides = (menus: { id: string; title: string; items: FoodItem[]; closed?: string[] }[], entries: Entry[], date: string): AdSlide[] => {
  const out: AdSlide[] = [];
  for (const m of menus) for (const item of restItems(m, eatenByName(entries, date, m.id))) out.push({ menuId: m.id, menuTitle: m.title, item });
  return out;
};
