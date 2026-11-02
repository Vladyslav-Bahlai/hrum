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

const jsonSchema = {
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
function toGemini(s: any): any {
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

const num = (v: any) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return isFinite(n) && n >= 0 ? n : 0;
};

/** null/пусто/нет поля → «неизвестно», а не 0 */
const opt = (v: any): number | undefined => (v === undefined || v === null || v === '' ? undefined : num(v));

function normalize(raw: any): AIResult {
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

function extractJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('ИИ вернул ответ не в формате JSON');
  return JSON.parse(m[0]);
}

async function readError(res: Response) {
  let msg = `HTTP ${res.status}`;
  try {
    const j = await res.json();
    msg = j?.error?.message || j?.message || msg;
  } catch {}
  if (res.status === 401 || res.status === 403) msg = 'Ключ не подошёл (' + msg + ')';
  if (res.status === 429) msg = 'Лимит запросов исчерпан, попробуйте через минуту (' + msg + ')';
  if (res.status === 404) msg = 'Модель не найдена — выберите другую в настройках (' + msg + ')';
  return new Error(msg);
}

/** Наш собственный тайм-аут: expo-fetch при abort() выдаёт «Fetch request has been canceled». */
class AITimeout extends Error {}
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
function isNetworkHiccup(e: any): boolean {
  if (e?.name === 'AbortError') return true;
  if (e instanceof TypeError) return true;
  const m = String(e?.message || '').toLowerCase();
  return /cancel|network request failed|timeout|timed out|socket|connection|econnreset|stream|unexpected end/.test(m);
}

function friendlyError(e: any, hadPhoto: boolean): Error {
  if (e instanceof AITimeout || !isNetworkHiccup(e)) return e instanceof Error ? e : new Error(String(e?.message || e));
  const tail = hadPhoto
    ? 'Связь оборвалась при отправке фото. Попробуйте ещё раз — лучше по Wi-Fi или сняв меню одним кадром.'
    : 'Связь с ИИ оборвалась. Проверьте интернет и попробуйте ещё раз.';
  return new Error(tail);
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

