/** Ключ приёма пищи (свои категории пользователя; у старых записей может быть 'snack'). */
export type MealType = string;

export interface MealDef {
  key: string;
  label: string;
  emoji?: string;
  /** начало интервала, минут от полуночи */
  from: number;
  /** конец интервала (не включая), минут от полуночи */
  to: number;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
}

/** Блюдо, распознанное ИИ или введённое вручную (значения — на 1 полную порцию). */
export interface FoodItem {
  name: string;
  /** Пустое значение = «не указано»: в итоги и статистику не входит и не считается нулём. */
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  sugar?: number;
  emoji?: string;
  grams?: number;
  note?: string;
  /** раздел меню: «Завтрак», «Супы», «Первое»… */
  section?: string;
  /** подсказка ИИ: какую долю порции съели */
  portion?: number;
}

export interface Menu {
  id: string;
  title: string;
  created: number;
  /** дни (YYYY-MM-DD), к которым привязано меню */
  dates: string[];
  items: FoodItem[];
  photo?: string;
  /** отмечено «съедено полностью» — не предлагается для переноса на новые дни */
  done?: boolean;
}

export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  time: number; // timestamp
  meal: MealType;
  item: FoodItem;
  portion: number; // 1, 0.5, 0.333, 0.25, ...
  photo?: string; // uri в папке приложения
  source: 'ai-text' | 'ai-photo' | 'manual' | 'repeat' | 'menu';
  menuId?: string;
}

export interface Favorite {
  id: string;
  item: FoodItem;
  uses: number;
}

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'keep' | 'gain';

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  height: number;
  weight: number;
  activity: number; // 1.2 ... 1.9
  goal: Goal;
}

export interface Targets {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  waterGlasses: number;
}

export type Provider = 'claude' | 'gemini';

export interface AISettings {
  provider: Provider;
  claudeModel: string;
  geminiModel: string;
  /** кэш списка моделей с последней проверки ключа */
  models?: { claude?: string[]; gemini?: string[] };
}

export interface WeightPoint {
  date: string;
  kg: number;
}

export interface AppData {
  version: 1;
  onboarded: boolean;
  profile: Profile;
  targets: Targets;
  ai: AISettings;
  entries: Entry[];
  favorites: Favorite[];
  menus: Menu[];
  weights: WeightPoint[];
  water: Record<string, number>; // date -> glasses
  /** звуки природы (по умолчанию включены) */
  sounds?: boolean;
  /** событие → имя встроенного звука, 'off' или 'file:<uri>' */
  soundMap?: Record<string, string>;
  /** свои категории дневника */
  meals?: MealDef[];
}

export interface AIResult {
  items: FoodItem[];
  title?: string;
  isMenu: boolean;
  comment?: string;
}
