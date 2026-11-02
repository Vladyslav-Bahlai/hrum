import { AIResult, AISettings, FoodItem, Menu } from './types';
import { kcalText, macroText } from './utils';

export interface AIImage {
  base64: string;
  mime: string;
}

export const DEFAULT_MODELS: Record<'claude' | 'gemini', string> = {
  claude: 'claude-sonnet-5-5',
  gemini: 'gemini-flash-latest',
};

const RULES = `Правила оценки:
- Если указан вес/количество — считай именно его. Если нет — оцени реалистичную стандартную порцию и укажи grams.
- Если на фото этикетка с КБЖУ на 100 г — пересчитай на указанный вес или на всю упаковку.
- Названия — коротко и по-русски, с маленьким уточнением (например «Борщ со сметаной», «Капучино 300 мл»).
- emoji — один подходящий эмодзи.
- note — короткое уточнение, из чего состоит порция (до 80 символов).
- comment — короткий нейтральный комментарий по сути (до 140 символов), без нравоучений.
- Числа: kcal — целое, белки/жиры/углеводы/клетчатка/сахар — граммы с точностью до 0.1.
- Если значение НЕВОЗМОЖНО определить (в меню или на этикетке его нет, а оценить честно нельзя) — НЕ выдумывай и НЕ ставь 0: просто пропусти поле kcal/protein/fat/carbs. Ноль пиши только тогда, когда в продукте действительно нет этого вещества (вода, чёрный кофе).`;

const SYSTEM_EAT = `Ты — опытный диетолог-нутрициолог. Пользователь ведёт дневник питания и сообщает, что он СЪЕЛ: текстом и/или фото (блюдо, продукт, тарелка, упаковка с этикеткой).
Распознай каждое отдельное блюдо/продукт и оцени пищевую ценность ОДНОЙ ПОЛНОЙ ПОРЦИИ.
${RULES}
- Поле section оставь пустым, title — пустым.
- Если пользователь прислал целое меню с множеством позиций — верни все позиции и поставь isMenu=true.
- Если на входе нет еды — верни пустой список items и объясни в comment.`;

const SYSTEM_MENU = `Ты — опытный диетолог-нутрициолог. Пользователь присылает своё МЕНЮ (на день, на неделю, из доставки или ресторана) текстом и/или фото. Его сохранят и потом будут отмечать съеденные блюда.
Распознай ВСЕ позиции меню строго в исходном порядке (если блюда пронумерованы — сохрани их порядок по номерам; номер в название не включай). Для каждой оцени пищевую ценность ОДНОЙ ПОРЦИИ (если в меню указан выход/вес — используй его).
${RULES}
- section — раздел меню, к которому относится блюдо, как в оригинале («Завтрак», «Обед», «Ужин», «Перекус», «Супы», «Первое», «Напитки»…); если разделов нет — пустая строка.
- title — короткое название всего меню (до 30 символов), например «Меню на понедельник» или «Доставка Grow Food, 1500 ккал».
- isMenu=true.`;

const menuContext = (menus: Menu[]) => {
  if (!menus.length) return '';
  const lines = menus.slice(0, 6).map((m) => {
    let sec = '';
    const items = m.items.map((i, n) => {
      const head = i.section && i.section !== sec ? `  [${(sec = i.section)}]\n` : '';
      return `${head}  ${n + 1}. ${i.name} — ${kcalText(i)}, ${macroText(i)}${i.grams ? `, ${i.grams} г` : ''}`;
    }).join('\n');
    return `Меню «${m.title}»:\n${items}`;
  }).join('\n\n');
  return `\n\nСОХРАНЁННЫЕ МЕНЮ ПОЛЬЗОВАТЕЛЯ (первое — самое свежее):\n${lines}\n\nБлюда в меню пронумерованы. Если пользователь ссылается на блюдо из меню («первое блюдо», «№3», «третье», «суп из обеда», «второй ужин», «половину салата из меню») — верни это блюдо с ТОЧНО такими же названием и КБЖУ на полную порцию, как в меню. Если он съел часть («половину», «треть») — всё равно верни КБЖУ полной порции, а долю укажи в поле portion. Если меню несколько и непонятно, о каком речь, — бери самое свежее.`;
};

const presetContext = (list: FoodItem[]) => {
  if (!list.length) return '';
  const lines = list.slice(0, 60).map((i) => `- ${i.name} — ${kcalText(i)}, ${macroText(i)}${i.grams ? `, ${i.grams} г` : ''}`).join('\n');
  return `\n\nСОХРАНЁННЫЕ БЛЮДА ПОЛЬЗОВАТЕЛЯ (пресеты с проверенными КБЖУ):\n${lines}\nЕсли пользователь называет одно из этих блюд — используй именно эти название и КБЖУ.`;
};

const itemProps = {
  name: { type: 'string' },
  emoji: { type: 'string' },
  grams: { type: 'number' },
  kcal: { type: 'number' },
  protein: { type: 'number' },
  fat: { type: 'number' },
  carbs: { type: 'number' },
  fiber: { type: 'number' },
  sugar: { type: 'number' },
  note: { type: 'string' },
  section: { type: 'string' },
  portion: { type: 'number' },
};
// kcal/protein/fat/carbs необязательны: пропуск = «неизвестно»
const required = ['name', 'emoji', 'grams', 'fiber', 'sugar', 'note', 'section', 'portion'];

export const jsonSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'object', properties: itemProps, required } },
    isMenu: { type: 'boolean' },
    title: { type: 'string' },
    comment: { type: 'string' },
  },
  required: ['items', 'isMenu', 'title', 'comment'],
};

// Gemini использует подмножество OpenAPI-схемы с типами в верхнем регистре
export function toGemini(s: any): any {
  if (Array.isArray(s)) return s.map(toGemini);
  if (s && typeof s === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'type') o.type = String(v).toUpperCase();
      else o[k] = toGemini(v);
    }
    return o;
  }
  return s;
}

export const num = (v: any) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return isFinite(n) && n >= 0 ? n : 0;
};

/** null/пусто/нет поля → «неизвестно», а не 0 */
export const opt = (v: any): number | undefined => (v === undefined || v === null || v === '' ? undefined : num(v));

export function normalize(raw: any): AIResult {
  const items: FoodItem[] = (Array.isArray(raw?.items) ? raw.items : []).map((i: any) => ({
    name: String(i.name || 'Блюдо').slice(0, 80),
    emoji: i.emoji ? String(i.emoji).slice(0, 4) : '🍽️',
    grams: num(i.grams) || undefined,
    kcal: opt(i.kcal) === undefined ? undefined : Math.round(opt(i.kcal)!),
    protein: opt(i.protein),
    fat: opt(i.fat),
    carbs: opt(i.carbs),
    fiber: num(i.fiber),
    sugar: num(i.sugar),
    note: i.note ? String(i.note).slice(0, 120) : undefined,
    section: i.section ? String(i.section).slice(0, 40) : undefined,
    portion: num(i.portion) > 0 && num(i.portion) <= 5 ? num(i.portion) : undefined,
  }));
  return { items, isMenu: !!raw?.isMenu, title: raw?.title ? String(raw.title).slice(0, 40) : undefined, comment: raw?.comment ? String(raw.comment) : undefined };
}

export function extractJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('ИИ вернул ответ не в формате JSON');
  return JSON.parse(m[0]);
}

export async function readError(res: Response) {
  let msg = `HTTP ${res.status}`;
  try {
    const j = await res.json();
    msg = j?.error?.message || j?.message || msg;
  } catch {}
  if (res.status === 401 || res.status === 403) msg = 'Ключ не подошёл (' + msg + ')';
  if (res.status === 429) msg = 'Лимит запросов исчерпан, попробуйте через минуту (' + msg + ')';
  if (res.status === 503 || res.status === 529) msg = OVERLOADED_MSG;
  if (res.status === 404) msg = 'Модель не найдена — выберите другую в настройках (' + msg + ')';
  return new Error(msg);
}

/** Наш собственный тайм-аут: expo-fetch при abort() выдаёт «Fetch request has been canceled». */
export class AITimeout extends Error {}
const TIMEOUT_MS = 180000; // модели с «размышлением» + фото могут отвечать больше полутора минут

function withTimeout(ms: number) {
  const c = new AbortController();
  let fired = false;
  const t = setTimeout(() => { fired = true; c.abort(); }, ms);
  return { signal: c.signal, done: () => clearTimeout(t), fired: () => fired, ms };
}
const timeoutError = (t: { ms: number }) =>
  new AITimeout(`ИИ не ответил за ${Math.round(t.ms / 1000)} с. Запрос мог дойти, но ответ не успел вернуться — попробуйте ещё раз или снимите меню покороче.`);

async function callClaude(key: string, model: string, system: string, text: string, images: AIImage[]): Promise<AIResult> {
  const content: any[] = images.map((im) => ({
    type: 'image',
    source: { type: 'base64', media_type: im.mime, data: im.base64 },
  }));
  content.push({ type: 'text', text: text || 'Распознай еду на фото.' });
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: t.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        tools: [{ name: 'report_food', description: 'Вернуть распознанные блюда и их КБЖУ', input_schema: jsonSchema }],
        tool_choice: { type: 'tool', name: 'report_food' },
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) throw await readError(res);
    const j = await res.json();
    const tool = (j.content || []).find((c: any) => c.type === 'tool_use');
    if (tool?.input) return normalize(tool.input);
    const txt = (j.content || []).map((c: any) => c.text || '').join('');
    return normalize(extractJson(txt));
  } catch (e) {
    if (t.fired()) throw timeoutError(t);
    throw e;
  } finally {
    t.done();
  }
}

async function callGemini(key: string, model: string, system: string, text: string, images: AIImage[]): Promise<AIResult> {
  const parts: any[] = images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.base64 } }));
  parts.push({ text: text || 'Распознай еду на фото.' });
  const t = withTimeout(TIMEOUT_MS);
  const send = (think: boolean) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      signal: t.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: toGemini(jsonSchema),
          // умеренное «размышление»: для разбора таблицы меню хватает, а ответ приходит в разы быстрее
          ...(think ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }),
    },
  );
  try {
    let res = await send(true);
    if (!res.ok) {
      const err = await readError(res);
      // старые модели не знают thinkingLevel — повторяем без него
      if (res.status === 400 && /think/i.test(err.message)) {
        res = await send(false);
        if (!res.ok) throw await readError(res);
      } else throw err;
    }
    const j = await res.json();
    const txt = (j.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('');
    if (!txt) throw new Error(j.promptFeedback?.blockReason ? 'Запрос отклонён: ' + j.promptFeedback.blockReason : 'Пустой ответ от Gemini');
    return normalize(extractJson(txt));
  } catch (e) {
    if (t.fired()) throw timeoutError(t);
    throw e;
  } finally {
    t.done();
  }
}

export async function analyzeFood(
  settings: AISettings,
  key: string,
  text: string,
  images: AIImage[],
  opts: { mode?: 'eat' | 'menu'; menus?: Menu[]; presets?: FoodItem[] } = {},
): Promise<AIResult> {
  if (!key) throw new Error('Добавьте API-ключ в настройках');
  const system = opts.mode === 'menu' ? SYSTEM_MENU : SYSTEM_EAT + menuContext(opts.menus || []) + presetContext(opts.presets || []);

  const run = () => settings.provider === 'claude'
    ? callClaude(key, settings.claudeModel || DEFAULT_MODELS.claude, system, text, images)
    : callGemini(key, settings.geminiModel || DEFAULT_MODELS.gemini, system, text, images);

  // Мобильная сеть рвёт длинные запросы с фото — пробуем до трёх раз.
  let last: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    try {
      return await run();
    } catch (e: any) {
      last = e;
      // повторяем только быстрые обрывы связи; долгое ожидание/тайм-аут повторять бессмысленно
      if (e instanceof AITimeout || Date.now() - started > 20000 || !isNetworkHiccup(e) || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw friendlyError(last, images.length > 0);
}

/** Обрыв связи, который имеет смысл повторить. */
export function isNetworkHiccup(e: any): boolean {
  if (e?.name === 'AbortError') return true;
  if (e instanceof TypeError) return true;
  const m = String(e?.message || '').toLowerCase();
  return /cancel|network request failed|timeout|timed out|socket|connection|econnreset|stream|unexpected end/.test(m);
}

/** Перегрузка / временная недоступность сервиса ИИ (503, 529, «high demand» и т. п.). */
export const isOverloaded = (msg: string) => /high demand|overload|unavailable|try again later|\b50[0-4]\b|\b529\b|capacity/i.test(msg);
export const OVERLOADED_MSG = 'Сервис ИИ перегружен, попробуйте позже.';

export function friendlyError(e: any, hadPhoto: boolean): Error {
  if (isOverloaded(String(e?.message || ''))) return new Error(OVERLOADED_MSG);
  if (e instanceof AITimeout || !isNetworkHiccup(e)) return e instanceof Error ? e : new Error(String(e?.message || e));
  const tail = hadPhoto
    ? 'Связь оборвалась при отправке фото. Попробуйте ещё раз — лучше по Wi-Fi или сняв меню одним кадром.'
    : 'Связь с ИИ оборвалась. Проверьте интернет и попробуйте ещё раз.';
  return new Error(tail);
}

// ---------- чат: вопросы к ИИ с контекстом (только чтение, ничего не меняет) ----------

const REASON_START = /^(пользователь\s+(пишет|спрашивает|просит|задал)|посмотрим\s+на|нужно\s+(посоветовать|ответить|составить)|составим|составлю|напишем|напишу|черновик|итак,?\s+(нужно|надо))/i;
const REASON_DRAFT = /^(составим|составлю|напишем|напишу)\s.*ответ|^черновик/i;
/** Страховка: если ответ начинается с «рассуждений» модели — оставляем только итоговую часть после последней такой строки. Не уверены — не трогаем. */
export function stripReasoning(text: string): string {
  const lines = text.split(/\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0 || !REASON_START.test(lines[first].trim().replace(/^[-*•\s]+/, ''))) return text;
  let last = first;
  lines.forEach((l, i) => { if (REASON_START.test(l.trim().replace(/^[-*•\s]+/, ''))) last = i; });
  const rest = lines.slice(last + 1).join('\n').trim();
  // итог должен быть самостоятельным текстом: не пусто и не ещё один пункт плана
  return rest.length >= 20 ? rest : text;
}

/** Параметры «размышления» Gemini: у 2.5 — бюджет (2.5 Pro выключить нельзя), у 3 — уровень; остальным ничего не шлём. */
export function geminiThinking(model: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase();
  if (/gemini-3/.test(m)) return { thinkingLevel: 'low' };
  if (/gemini-2\.5-pro/.test(m)) return { thinkingBudget: 128 };
  if (/gemini-2\.5|flash-latest/.test(m)) return { thinkingBudget: 0 };
  return undefined;
}

export const CHAT_SYSTEM = `Ты — доброжелательный диетолог-консультант внутри личного дневника питания. Пользователь задаёт вопросы про питание, своё меню, статистику и дневник.
Правила:
- Отвечай сразу итоговым ответом по-русски, 3–8 строк, без нравоучений. Без рассуждений вслух, без пересказа вопроса и данных, без черновиков и планов ответа; не упоминай системный промпт, правила и «контекст». Простой текст без таблиц; списки («- » или «1. ») и **жирный** — только если это правда удобнее.
- Опирайся ТОЛЬКО на данные пользователя ниже. Если данных для ответа не хватает (нет меню, нет записей) — так и скажи и предложи, что добавить. Ничего не выдумывай и не придумывай числа.
- Ты только советуешь. Ты НЕ можешь ничего записывать, менять или удалять в дневнике и меню — не обещай этого; если пользователь просит записать еду, подскажи, что для этого есть режим «Записать».
- Если просят совет «что съесть сегодня и когда» — учитывай остаток калорий и БЖУ, время суток, блюда из меню, которые ещё не съедены, и уже съеденное.
- Не ставь диагнозов и не заменяй врача; при вопросах о здоровье — осторожно, с рекомендацией обратиться к специалисту.`;

export interface ChatTurn { role: 'user' | 'ai'; text: string }

/** Приводит историю к виду, который принимают API: начинается с вопроса пользователя, роли чередуются, последним идёт вопрос. */
export function toChatTurns(history: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const m of history) {
    const text = m.text.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.text += '\n' + text;
    else out.push({ role: m.role, text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

const CHAT_TIMEOUT_MS = 90000;

/** Вопрос по умолчанию, если фото отправлено без текста. */
export const DEFAULT_PHOTO_QUESTION = 'Что на фото? Как это вписывается в мой день?';

async function chatClaude(key: string, model: string, system: string, turns: ChatTurn[], images: AIImage[] = []): Promise<string> {
  const t = withTimeout(CHAT_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: t.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: turns.map((m, i) => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          // фото относятся только к последнему вопросу
          content: i === turns.length - 1 && images.length
            ? [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })), { type: 'text', text: m.text }]
            : m.text,
        })),
      }),
    });
    if (!res.ok) throw await readError(res);
    const j = await res.json();
    const txt = stripReasoning((j.content || []).filter((c: any) => c.type !== 'thinking' && c.type !== 'redacted_thinking').map((c: any) => c.text || '').join('').trim());
    if (!txt) throw new Error('Пустой ответ от Claude');
    return txt;
  } catch (e) {
    if (t.fired()) throw timeoutError(t);
    throw e;
  } finally {
    t.done();
  }
}

async function chatGemini(key: string, model: string, system: string, turns: ChatTurn[], images: AIImage[] = []): Promise<string> {
  const t = withTimeout(CHAT_TIMEOUT_MS);
  const send = (think: boolean) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      signal: t.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: turns.map((m, i) => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: i === turns.length - 1 && images.length
            ? [...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.base64 } })), { text: m.text }]
            : [{ text: m.text }],
        })),
        generationConfig: { temperature: 0.5, ...(think && geminiThinking(model) ? { thinkingConfig: geminiThinking(model) } : {}) },
      }),
    },
  );
  try {
    let res = await send(true);
    if (!res.ok) {
      const err = await readError(res);
      if (res.status === 400 && /think/i.test(err.message)) {
        res = await send(false);
        if (!res.ok) throw await readError(res);
      } else throw err;
    }
    const j = await res.json();
    const txt = stripReasoning((j.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('').trim());
    if (!txt) throw new Error(j.promptFeedback?.blockReason ? 'Запрос отклонён: ' + j.promptFeedback.blockReason : 'Пустой ответ от Gemini');
    return txt;
  } catch (e) {
    if (t.fired()) throw timeoutError(t);
    throw e;
  } finally {
    t.done();
  }
}

/** Ответ ИИ в чате. `history` — последние сообщения (последним должен быть вопрос пользователя), `context` — текст из buildChatContext. */
export async function chatWithAI(settings: AISettings, key: string, history: ChatTurn[], context: string, images: AIImage[] = []): Promise<string> {
  if (!key) throw new Error('Добавьте API-ключ в настройках');
  const turns = toChatTurns(history);
  if (!turns.length) throw new Error('Напишите вопрос');
  const system = `${CHAT_SYSTEM}\n\nДАННЫЕ ПОЛЬЗОВАТЕЛЯ (актуальны на момент вопроса):\n${context}`;
  const run = () => settings.provider === 'claude'
    ? chatClaude(key, settings.claudeModel || DEFAULT_MODELS.claude, system, turns, images)
    : chatGemini(key, settings.geminiModel || DEFAULT_MODELS.gemini, system, turns, images);
  let last: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      return await run();
    } catch (e: any) {
      last = e;
      if (e instanceof AITimeout || Date.now() - started > 15000 || !isNetworkHiccup(e) || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw friendlyError(last, images.length > 0);
}

/** Проверяет ключ и возвращает список доступных моделей. */
export async function listModels(provider: 'claude' | 'gemini', key: string): Promise<string[]> {
  if (!key) throw new Error('Введите ключ');
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) throw await readError(res);
    const j = await res.json();
    return (j.data || []).map((m: any) => m.id as string);
  }
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) throw await readError(res);
  const j = await res.json();
  return (j.models || [])
    .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .filter((n: string) => n.startsWith('gemini') && !/embedding|tts|image-generation|audio|live/.test(n));
}

/** Выбирает разумную модель по умолчанию из списка. */
export function pickModel(provider: 'claude' | 'gemini', models: string[]): string {
  if (!models.length) return DEFAULT_MODELS[provider];
  if (provider === 'claude') {
    return models.find((m) => m.includes('sonnet')) || models.find((m) => m.includes('haiku')) || models[0];
  }
  return (
    models.find((m) => m === 'gemini-flash-latest') ||
    models.find((m) => /flash/.test(m) && !/lite|preview|exp/.test(m)) ||
    models.find((m) => /flash/.test(m)) ||
    models[0]
  );
}

