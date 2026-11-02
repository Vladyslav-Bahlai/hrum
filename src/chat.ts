import { AppData, Chat, ChatContextOpts, ChatMsg, ChatSettings, Entry, FoodItem, Menu } from './types';
import { addDays, dishState, eatenByName, fmt, fromKey, getMeals, isClosed, kcalText, known, mealLabel, minutesLabel, nut, OTHER_MEAL, r0, sum, toKey, uid } from './utils';

/** Чат с ИИ: чистая логика (день чата, контекст, хранение). UI и сеть — отдельно. */

export const DEFAULT_CTX: ChatContextOpts = { today: true, menu: true, profile: true, favorites: false, summaryDays: 7, detailDays: 0, history: 20 };
export const DEFAULT_CHAT: ChatSettings = { ctx: DEFAULT_CTX, keepDays: 30, dayStartHour: 4 };

/** Готовые наборы контекста: маленький (быстро и дёшево), средний, большой (всё подробно). */
export const CTX_PRESETS: { key: 'small' | 'mid' | 'large'; label: string; ctx: ChatContextOpts }[] = [
  { key: 'small', label: 'Малый', ctx: { today: true, menu: true, profile: false, favorites: false, summaryDays: 0, detailDays: 0, history: 8 } },
  { key: 'mid', label: 'Средний', ctx: DEFAULT_CTX },
  { key: 'large', label: 'Большой', ctx: { today: true, menu: true, profile: true, favorites: true, summaryDays: 14, detailDays: 3, history: 40 } },
];
export const KEEP_OPTIONS: { v: number; label: string }[] = [
  { v: 7, label: '7 дней' }, { v: 30, label: '30 дней' }, { v: 90, label: '90 дней' }, { v: 0, label: 'Всегда' },
];

/** Подсказки в пустом инпуте режима «Спросить»: серый текст, меняется по кругу. */
export const ASK_HINTS = ['Спросить ИИ: что съесть сегодня?', 'Спросить ИИ: как прошла неделя?', 'Спросить ИИ: чем заменить…?'];
export const ASK_HINT_MS = 4000;
export const nextAskHint = (i: number, len = ASK_HINTS.length) => (len > 0 ? (i + 1) % len : 0);
/** Показывать ли крутящуюся подсказку: только в пустом инпуте без фокуса и без фото. */
export const askHintVisible = (o: { text: string; focus: boolean; photos: number }) => !o.focus && !o.text && o.photos === 0;

export const clampInt = (n: unknown, lo: number, hi: number, def: number) => {
  const v = typeof n === 'number' && isFinite(n) ? Math.round(n) : def;
  return Math.max(lo, Math.min(hi, v));
};

/** Настройки чата из сохранённых данных: недостающее и некорректное заменяется значениями по умолчанию. */
export const chatSettings = (d: Pick<AppData, 'chatSettings'> | { chatSettings?: any }): ChatSettings => {
  const s: any = d.chatSettings || {};
  const c: any = s.ctx || {};
  const b = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  return {
    ctx: {
      today: b(c.today, DEFAULT_CTX.today), menu: b(c.menu, DEFAULT_CTX.menu), profile: b(c.profile, DEFAULT_CTX.profile), favorites: b(c.favorites, DEFAULT_CTX.favorites),
      summaryDays: clampInt(c.summaryDays, 0, 30, DEFAULT_CTX.summaryDays),
      detailDays: clampInt(c.detailDays, 0, 14, DEFAULT_CTX.detailDays),
      history: clampInt(c.history, 0, 60, DEFAULT_CTX.history),
    },
    keepDays: [0, 7, 30, 90].includes(s.keepDays) ? s.keepDays : DEFAULT_CHAT.keepDays,
    dayStartHour: clampInt(s.dayStartHour, 0, 11, DEFAULT_CHAT.dayStartHour),
  };
};

/** Ключ дня чата: до «часа начала нового чата» (по умолчанию 04:00) всё ещё считается вчера. */
/** Выбранный вручную чат (из истории) действует только в тот «день», когда выбран; на следующий день снова активен чат нового дня. */
export interface ChatOverride { id: string; day: string }
export const activeChatId = (override: ChatOverride | null, dayId: string): string =>
  override && override.day === dayId ? override.id : dayId;

export const chatDayKey = (now: Date | number = new Date(), startHour = DEFAULT_CHAT.dayStartHour): string => {
  const t = typeof now === 'number' ? now : now.getTime();
  return toKey(new Date(t - clampInt(startHour, 0, 11, 4) * 3600 * 1000));
};

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayWord = (k: string) => { const d = fromKey(k); return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
/** Название чата в списке: «Сегодня», «Вчера» или «2 ноября, понедельник». */
export const chatTitle = (id: string, now: Date | number = new Date(), startHour = DEFAULT_CHAT.dayStartHour) => {
  const today = chatDayKey(now, startHour);
  if (id === today) return 'Сегодня';
  if (id === addDays(today, -1)) return 'Вчера';
  const d = fromKey(id);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD[d.getDay()]}`;
};

const macros = (n: { protein: number; fat: number; carbs: number }) => `Б ${r0(n.protein)} Ж ${r0(n.fat)} У ${r0(n.carbs)}`;

const entryLine = (e: Entry) => {
  const k = known(e.item);
  const n = nut(e.item, e.portion);
  const part = e.portion !== 1 ? ` ×${Math.round(e.portion * 100) / 100}` : '';
  return `${minutesLabel(new Date(e.time).getHours() * 60 + new Date(e.time).getMinutes())} ${e.item.name}${part} — ${k.kcal ? fmt(n.kcal) + ' ккал' : 'ккал не указаны'}${known(e.item).protein ? ', ' + macros(n) : ''}`;
};

const dayEntries = (entries: Entry[], date: string) => entries.filter((e) => e.date === date).sort((a, b) => a.time - b.time);

const menuBlock = (menus: Menu[], entries: Entry[], date: string) => {
  const out: string[] = [];
  for (const m of menus) {
    const eaten = eatenByName(entries, date, m.id);
    // закрытые блюда ИИ не отправляем вовсе (нечего советовать); съеденные полностью и остатки остаются
    const lines = m.items.filter((it) => !isClosed(m, it.name)).map((it, i) => {
      const ds = dishState(eaten[it.name] || 0, false);
      return `  ${i + 1}. ${it.section ? `[${it.section}] ` : ''}${it.name} — ${kcalText(it)}${known(it).protein ? ', ' + macros(nut(it)) : ''} · ${ds.kind === 'none' ? 'не тронуто' : ds.label}`;
    });
    out.push(`«${m.title}»:\n${lines.length ? lines.join('\n') : '  (все блюда закрыты)'}`);
  }
  return out.join('\n');
};

/**
 * Текст контекста для ИИ. `now` — текущий момент; «сегодня» — календарная дата, как в дневнике.
 * Только чтение данных: ничего не изменяет.
 */
export const buildChatContext = (data: AppData, now: Date, opts: ChatContextOpts): string => {
  const today = toKey(now);
  const parts: string[] = [`Сейчас: ${dayWord(today)}, ${minutesLabel(now.getHours() * 60 + now.getMinutes())}.`];
  const tg = data.targets;

  if (opts.profile) {
    const p = data.profile;
    const goal = p.goal === 'lose' ? 'похудение' : p.goal === 'gain' ? 'набор массы' : 'поддержание веса';
    parts.push(`ПРОФИЛЬ: ${p.sex === 'male' ? 'мужчина' : 'женщина'}, ${p.age} лет, рост ${p.height} см, вес ${p.weight} кг, цель — ${goal}.\nНОРМА В ДЕНЬ: ${fmt(tg.kcal)} ккал, Б ${tg.protein} Ж ${tg.fat} У ${tg.carbs} г, вода ${tg.waterGlasses} стаканов.`);
  }

  if (opts.today) {
    const list = dayEntries(data.entries, today);
    const s = sum(list);
    const water = data.water[today] || 0;
    const left = tg.kcal - s.kcal;
    let t = `ДНЕВНИК СЕГОДНЯ: съедено ${fmt(s.kcal)} из ${fmt(tg.kcal)} ккал (${left >= 0 ? 'осталось ' + fmt(left) : 'сверх нормы ' + fmt(-left)}), Б ${r0(s.protein)} Ж ${r0(s.fat)} У ${r0(s.carbs)}; вода ${water} ст.`;
    if (!list.length) t += '\nЗаписей пока нет.';
    for (const m of [...getMeals(), OTHER_MEAL]) {
      const part = list.filter((e) => e.meal === m.key || (m.key === OTHER_MEAL.key && !getMeals().some((x) => x.key === e.meal)));
      if (part.length) t += `\n${mealLabel(m.key)}:\n` + part.map((e) => '  ' + entryLine(e)).join('\n');
    }
    parts.push(t);
  }

  if (opts.menu) {
    const menus = data.menus.filter((m) => m.dates.includes(today));
    parts.push(menus.length ? `МЕНЮ НА СЕГОДНЯ (с отметками, что уже съедено):\n${menuBlock(menus, data.entries, today)}` : 'МЕНЮ НА СЕГОДНЯ: не добавлено.');
  }

  if (opts.favorites && data.favorites.length) {
    parts.push('ИЗБРАННЫЕ БЛЮДА:\n' + data.favorites.slice(0, 40).map((f) => `  ${f.item.name} — ${kcalText(f.item)}${known(f.item).protein ? ', ' + macros(nut(f.item)) : ''}`).join('\n'));
  }

  if (opts.detailDays > 0) {
    let t = 'ПОДРОБНО ЗА ПРОШЛЫЕ ДНИ:';
    for (let i = 1; i <= opts.detailDays; i++) {
      const k = addDays(today, -i);
      const list = dayEntries(data.entries, k);
      t += `\n${dayWord(k)}: ` + (list.length ? `${fmt(sum(list).kcal)} ккал\n` + list.map((e) => '  ' + entryLine(e)).join('\n') : 'записей нет');
    }
    parts.push(t);
  }

  if (opts.summaryDays > 0) {
    const rows: string[] = [];
    let total = 0, days = 0;
    for (let i = 1; i <= opts.summaryDays; i++) {
      const k = addDays(today, -i);
      const list = dayEntries(data.entries, k);
      if (!list.length) { rows.push(`  ${dayWord(k)}: записей нет`); continue; }
      const s = sum(list);
      total += s.kcal; days++;
      rows.push(`  ${dayWord(k)}: ${fmt(s.kcal)} ккал, ${macros(s)}, записей ${list.length}`);
    }
    parts.push(`ИТОГИ ПРОШЛЫХ ДНЕЙ (${opts.summaryDays}):\n${rows.join('\n')}${days ? `\nВ среднем за дни с записями: ${fmt(total / days)} ккал.` : ''}`);
  }

  return parts.join('\n\n');
};

/** Грубая оценка числа токенов (для русского текста ≈ 1 токен на 3 символа). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3);
export const tokensLabel = (t: number) => (t < 1000 ? `~${Math.max(10, Math.round(t / 10) * 10)} токенов` : `~${(Math.round(t / 100) / 10).toString().replace('.', ',')} тыс. токенов`);

/** Ссылки на локальные фото чатов (для удаления файлов вместе с чатом). */
export const chatPhotos = (chats: Chat[] | undefined): string[] => (chats || []).flatMap((c) => c.messages.flatMap((m) => m.photos || []));

/** Последние K сообщений для отправки (ответы с ошибкой и пустые не берём; K=0 — без истории). */
export const historyForRequest = (messages: ChatMsg[], k: number): ChatMsg[] =>
  k <= 0 ? [] : messages.filter((m) => !m.error && m.text.trim()).slice(-k);

/** Что отправить ИИ: последние k сообщений до вопроса + сам вопрос (он идёт последним всегда, даже при k=0). */
export const requestTurns = (prev: ChatMsg[], question: ChatMsg, k: number): { role: 'user' | 'ai'; text: string }[] =>
  [...historyForRequest(prev, k), question].map((m) => ({ role: m.role, text: m.text }));

export const sameCtx = (a: ChatContextOpts, b: ChatContextOpts) => (Object.keys(a) as (keyof ChatContextOpts)[]).every((k) => a[k] === b[k]);

// ---------- хранение чатов (чистые функции над AppData) ----------

export const newMsg = (role: ChatMsg['role'], text: string, at = Date.now(), error?: boolean, genId: () => string = uid): ChatMsg =>
  ({ id: genId(), role, text, at, ...(error ? { error: true } : {}) });

export const appendChatMsg = (d: AppData, chatId: string, msg: ChatMsg): AppData => {
  const chats = d.chats || [];
  const has = chats.some((c) => c.id === chatId);
  const next: Chat[] = has
    ? chats.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, msg], updatedAt: msg.at } : c))
    : [...chats, { id: chatId, messages: [msg], updatedAt: msg.at }];
  return { ...d, chats: next };
};
export const deleteChat = (d: AppData, chatId: string): AppData => ({ ...d, chats: (d.chats || []).filter((c) => c.id !== chatId) });
/** Очистить все чаты; закреплённые остаются. */
export const clearChats = (d: AppData): AppData => ({ ...d, chats: (d.chats || []).filter((c) => c.pinned) });
export const removeChatMsg = (d: AppData, chatId: string, msgId: string): AppData => ({
  ...d, chats: (d.chats || []).map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== msgId) } : c)).filter((c) => c.messages.length || c.title || c.pinned),
});

/** Автоочистка: чаты старше keepDays удаляются (чат дня — по ключу дня, созданные вручную — по последнему сообщению); закреплённые и сегодняшний остаются; 0 — не чистить. */
export const pruneChats = (d: AppData, now: Date | number = new Date(), keepDays = 30, startHour = 4): AppData => {
  if (!d.chats?.length || keepDays <= 0) return d;
  const limit = addDays(chatDayKey(now, startHour), -keepDays);
  const chats = d.chats.filter((c) => c.pinned || (isDayId(c.id) ? c.id : chatDayKey(c.updatedAt, startHour)) >= limit);
  return chats.length === d.chats.length ? d : { ...d, chats };
};

/** Список чатов для экрана: закреплённые сверху, дальше новые сверху (по последнему сообщению, при равенстве — по ключу). */
export const sortedChats = (chats: Chat[] | undefined): Chat[] =>
  [...(chats || [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));

// ---------- управление чатами (вкладка «Чаты») ----------

export const isDayId = (id: string) => /^\d{4}-\d{2}-\d{2}$/.test(id);
export const newChatId = (genId: () => string = uid) => `c_${genId()}`;
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

/** Название чата в списках: своё, иначе «Сегодня»/дата (чат дня), иначе начало первого вопроса. */
export const chatName = (chat: Chat | undefined, id: string, now: Date | number = new Date(), startHour = DEFAULT_CHAT.dayStartHour): string => {
  const own = chat?.title?.trim();
  if (own) return own;
  if (isDayId(id)) return chatTitle(id, now, startHour);
  const first = chat?.messages.find((m) => m.role === 'user')?.text;
  return first ? clip(first, 34) : 'Новый чат';
};

/** Новый пустой чат (если такого id ещё нет). */
export const createChat = (d: AppData, id: string, now = Date.now()): AppData =>
  (d.chats || []).some((c) => c.id === id) ? d : { ...d, chats: [...(d.chats || []), { id, messages: [], updatedAt: now }] };

/** Переименовать; пустое имя возвращает название по умолчанию. */
export const renameChat = (d: AppData, id: string, title: string): AppData => {
  const t = clip(title, 60);
  return { ...d, chats: (d.chats || []).map((c) => { if (c.id !== id) return c; const { title: _t, ...rest } = c; return t ? { ...rest, title: t } : rest; }) };
};

export const togglePinChat = (d: AppData, id: string): AppData => ({
  ...d, chats: (d.chats || []).map((c) => { if (c.id !== id) return c; const { pinned: _p, ...rest } = c; return c.pinned ? rest : { ...rest, pinned: true }; }),
});

/** Вернуть удалённый чат (отмена удаления). */
export const upsertChat = (d: AppData, chat: Chat): AppData => {
  const list = d.chats || [];
  return { ...d, chats: list.some((c) => c.id === chat.id) ? list.map((c) => (c.id === chat.id ? chat : c)) : [...list, chat] };
};

export interface ChatHit { chat: Chat; snippet?: string }
/** Поиск по названию и тексту сообщений (без учёта регистра); пустой запрос — все чаты. Сниппет — кусок первого найденного сообщения. */
export const searchChats = (chats: Chat[] | undefined, query: string, now: Date | number = new Date(), startHour = DEFAULT_CHAT.dayStartHour): ChatHit[] => {
  const q = query.trim().toLowerCase();
  const list = sortedChats(chats);
  if (!q) return list.map((chat) => ({ chat }));
  const out: ChatHit[] = [];
  for (const chat of list) {
    const msg = chat.messages.find((m) => m.text.toLowerCase().includes(q));
    const nameHit = chatName(chat, chat.id, now, startHour).toLowerCase().includes(q);
    if (!msg && !nameHit) continue;
    let snippet: string | undefined;
    if (msg) {
      const i = msg.text.toLowerCase().indexOf(q);
      const from = Math.max(0, i - 24);
      snippet = (from > 0 ? '…' : '') + clip(msg.text.slice(from, from + 90), 90);
    }
    out.push({ chat, snippet });
  }
  return out;
};
