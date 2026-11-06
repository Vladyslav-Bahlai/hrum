import { Platform, TextStyle } from 'react-native';

// Спокойная «бумажная» палитра в зелёных тонах: тонкие линии, мало цвета, акцент — глубокий зелёный.
export const C = {
  paper: '#F4F5F0',
  surface: '#FFFFFF',
  ink: '#18201B',
  inkSoft: '#47524B',
  muted: '#7F8A83',
  line: '#E2E5DC',
  lineStrong: '#CDD2C6',
  accent: '#2F6249',
  accentDark: '#1F4533',
  accentSoft: '#E5EEE7',
  accentTint: '#F0F5F1',
  // макросы — приглушённые
  protein: '#3F7F5F',
  fat: '#C79A3A',
  carbs: '#6E9AB5',
  over: '#B5523F',
  overSoft: '#F6E7E2',
  water: '#4F8FB8',
  white: '#FFFFFF',
};

/** Палитры вкладок: общая нейтральная основа и один приглушённый акцент на вкладку (без пестроты). */
export type TabKey = 'day' | 'menu' | 'fill' | 'stats' | 'chats' | 'settings';
export interface TabTone { accent: string; soft: string; tint: string; paper: string }
export const TABS: Record<TabKey, TabTone> = {
  day: { accent: '#2F6249', soft: '#E5EEE7', tint: '#F0F5F1', paper: '#F4F5F0' },
  menu: { accent: '#8A6A24', soft: '#F0E8D2', tint: '#F8F3E4', paper: '#F7F4EA' },
  fill: { accent: '#8A5240', soft: '#F1E3DD', tint: '#F8F0EC', paper: '#F7F2EF' },
  stats: { accent: '#3E627F', soft: '#E1E9F0', tint: '#EDF2F6', paper: '#F1F4F6' },
  chats: { accent: '#5E5A82', soft: '#E7E5F0', tint: '#F1F0F6', paper: '#F4F3F7' },
  settings: { accent: '#56615B', soft: '#E4E7E5', tint: '#EFF1F0', paper: '#F3F4F3' },
};
/** Чуть темнее — фон «не сегодняшних» дней, чтобы сегодня отличалось от вчера/завтра. */
export const shade = (hex: string, k = 0.955): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, '0');
  return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
};

export const serif = 'Lora_600SemiBold';
export const serifReg = 'Lora_400Regular';

const sans = Platform.select({ ios: 'System', android: undefined, default: undefined });

export const T: Record<string, TextStyle> = {
  h1: { fontFamily: serif, fontSize: 26, lineHeight: 31, color: C.ink, letterSpacing: -0.2 },
  h2: { fontFamily: serif, fontSize: 20, lineHeight: 25, color: C.ink },
  h3: { fontFamily: serif, fontSize: 16.5, lineHeight: 22, color: C.ink },
  big: { fontFamily: serif, fontSize: 40, lineHeight: 46, color: C.ink, letterSpacing: -0.5 },
  body: { fontFamily: sans, fontSize: 15, lineHeight: 21, color: C.ink },
  bodySoft: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.inkSoft },
  small: { fontFamily: sans, fontSize: 12.5, lineHeight: 17, color: C.muted },
  label: { fontFamily: sans, fontSize: 12, lineHeight: 16, color: C.muted, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600' },
  num: { fontFamily: sans, fontVariant: ['tabular-nums'], color: C.ink },
  link: { fontFamily: sans, fontSize: 13.5, color: C.accent, textDecorationLine: 'underline' },
};

export const RADIUS = 10;

/** На web у поля ввода убираем чёрный контур фокуса браузера (на телефоне его нет). */
export const noOutline: any = Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {};
