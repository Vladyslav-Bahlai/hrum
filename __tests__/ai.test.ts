import {
  AITimeout, chatWithAI, DEFAULT_PHOTO_QUESTION, CHAT_SYSTEM, extractJson, friendlyError, isNetworkHiccup, normalize, num, opt, pickModel, readError, toChatTurns, toGemini, analyzeFood, listModels, DEFAULT_MODELS,
} from '../src/ai';
import { AISettings } from '../src/types';

const settings = (provider: 'claude' | 'gemini'): AISettings => ({ provider, claudeModel: 'claude-test', geminiModel: 'gemini-test' });
const ok = (body: any) => ({ ok: true, status: 200, json: async () => body }) as any;
const fail = (status: number, message: string) => ({ ok: false, status, json: async () => ({ error: { message } }) }) as any;
const realFetch = (globalThis as any).fetch;
afterEach(() => { (globalThis as any).fetch = realFetch; jest.useRealTimers(); });

describe('разбор чисел и ответа ИИ', () => {
  test('num и opt', () => {
    expect(num('12,5')).toBe(12.5);
    expect(num(-3)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(opt(undefined)).toBeUndefined();
    expect(opt(null)).toBeUndefined();
    expect(opt('')).toBeUndefined();
    expect(opt(0)).toBe(0);
    expect(opt('7,5')).toBe(7.5);
  });
  test('normalize: «неизвестно» остаётся неизвестным, а не нулём', () => {
    const r = normalize({ items: [{ name: 'Суп', kcal: 250.4, protein: null, fat: 5, portion: 0.5 }], isMenu: false, comment: 'ок' });
    const it = r.items[0];
    expect(it.kcal).toBe(250);
    expect(it.protein).toBeUndefined();
    expect(it.fat).toBe(5);
    expect(it.carbs).toBeUndefined();
    expect(it.portion).toBe(0.5);
    expect(it.emoji).toBe('🍽️');
    expect(r.comment).toBe('ок');
  });
  test('normalize: границы и мусор', () => {
    const r = normalize({ items: [{ name: 'x'.repeat(200), portion: 11, section: 'Завтрак', grams: 0 }, {}], isMenu: 1, title: 'T'.repeat(60) });
    expect(r.items[0].name).toHaveLength(80);
    expect(r.items[0].portion).toBeUndefined();
    expect(r.items[0].grams).toBeUndefined();
    expect(r.items[0].section).toBe('Завтрак');
    expect(r.items[1].name).toBe('Блюдо');
    expect(r.isMenu).toBe(true);
    expect(r.title).toHaveLength(40);
    expect(normalize(null).items).toEqual([]);
  });
  test('extractJson достаёт объект из текста', () => {
    expect(extractJson('вот: {"a":1} спасибо')).toEqual({ a: 1 });
    expect(() => extractJson('без json')).toThrow('не в формате JSON');
  });
  test('toGemini переводит типы схемы в верхний регистр', () => {
    expect(toGemini({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] })).toEqual({ type: 'OBJECT', properties: { a: { type: 'STRING' } }, required: ['a'] });
  });
  test('pickModel', () => {
    expect(pickModel('claude', [])).toBe(DEFAULT_MODELS.claude);
    expect(pickModel('claude', ['claude-opus-1', 'claude-sonnet-9'])).toBe('claude-sonnet-9');
    expect(pickModel('gemini', ['gemini-pro', 'gemini-2-flash-lite', 'gemini-2-flash'])).toBe('gemini-2-flash');
    expect(pickModel('gemini', ['x', 'gemini-flash-latest'])).toBe('gemini-flash-latest');
  });
});

describe('ошибки', () => {
  test('readError: понятные сообщения по статусам', async () => {
    expect((await readError(fail(401, 'bad'))).message).toMatch(/Ключ не подошёл/);
    expect((await readError(fail(429, 'slow'))).message).toMatch(/Лимит запросов/);
    expect((await readError(fail(404, 'nf'))).message).toMatch(/Модель не найдена/);
    expect((await readError(fail(500, 'boom'))).message).toBe('boom');
    expect((await readError({ status: 502, json: async () => { throw new Error('x'); } } as any)).message).toBe('HTTP 502');
  });
  test('isNetworkHiccup', () => {
    expect(isNetworkHiccup(new TypeError('x'))).toBe(true);
    expect(isNetworkHiccup({ name: 'AbortError' })).toBe(true);
    expect(isNetworkHiccup(new Error('Network request failed'))).toBe(true);
    expect(isNetworkHiccup(new Error('Fetch request has been canceled'))).toBe(true);
    expect(isNetworkHiccup(new Error('Ключ не подошёл'))).toBe(false);
  });
  test('friendlyError: обрыв связи с фото и без; прочее — как есть', () => {
    expect(friendlyError(new TypeError('x'), true).message).toMatch(/фото/);
    expect(friendlyError(new TypeError('x'), false).message).toMatch(/Связь с ИИ оборвалась/);
    const t = new AITimeout('долго');
    expect(friendlyError(t, false)).toBe(t);
    expect(friendlyError(new Error('Ключ'), false).message).toBe('Ключ');
  });
});

describe('analyzeFood (замоканный fetch)', () => {
  test('без ключа — понятная ошибка', async () => {
    await expect(analyzeFood(settings('gemini'), '', 'йогурт', [])).rejects.toThrow('API-ключ');
  });
  test('Gemini: разбор JSON-ответа', async () => {
    const f = jest.fn().mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: '{"items":[{"name":"Йогурт","kcal":120}],"isMenu":false}' }] } }] }));
    (globalThis as any).fetch = f;
    const r = await analyzeFood(settings('gemini'), 'KEY', 'йогурт', []);
    expect(r.items[0]).toMatchObject({ name: 'Йогурт', kcal: 120 });
    expect(f.mock.calls[0][0]).toContain('gemini-test');
    expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe('KEY');
  });
  test('Gemini: модель без thinking — повтор без thinkingConfig', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce(fail(400, 'thinkingLevel is not supported'))
      .mockResolvedValueOnce(ok({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] }));
    (globalThis as any).fetch = f;
    await analyzeFood(settings('gemini'), 'K', 'x', []);
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });
  test('Claude: tool_use', async () => {
    const f = jest.fn().mockResolvedValue(ok({ content: [{ type: 'tool_use', input: { items: [{ name: 'Хлеб', kcal: 80 }] } }] }));
    (globalThis as any).fetch = f;
    const r = await analyzeFood(settings('claude'), 'K', 'хлеб', []);
    expect(r.items[0].name).toBe('Хлеб');
    expect(f.mock.calls[0][1].headers['x-api-key']).toBe('K');
    expect(JSON.parse(f.mock.calls[0][1].body).model).toBe('claude-test');
  });
  test('ошибка ключа не повторяется', async () => {
    const f = jest.fn().mockResolvedValue(fail(401, 'nope'));
    (globalThis as any).fetch = f;
    await expect(analyzeFood(settings('claude'), 'K', 'x', [])).rejects.toThrow('Ключ не подошёл');
    expect(f).toHaveBeenCalledTimes(1);
  });
  test('в запрос еды контекст чата НЕ попадает', async () => {
    const f = jest.fn().mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] }));
    (globalThis as any).fetch = f;
    await analyzeFood(settings('gemini'), 'K', 'я выпил йогурт', []);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(JSON.stringify(body)).not.toContain('ДАННЫЕ ПОЛЬЗОВАТЕЛЯ');
    expect(body.contents).toHaveLength(1);
  });
});

describe('listModels', () => {
  test('без ключа — ошибка', async () => { await expect(listModels('gemini', '')).rejects.toThrow('Введите ключ'); });
});

describe('чат: toChatTurns', () => {
  test('склеивает подряд идущие реплики и убирает пустые', () => {
    expect(toChatTurns([{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'ai', text: ' ' }, { role: 'ai', text: 'c' }, { role: 'user', text: 'd' }]))
      .toEqual([{ role: 'user', text: 'a\nb' }, { role: 'ai', text: 'c' }, { role: 'user', text: 'd' }]);
  });
  test('начинается с пользователя и заканчивается им', () => {
    expect(toChatTurns([{ role: 'ai', text: 'привет' }, { role: 'user', text: 'q' }, { role: 'ai', text: 'ответ' }])).toEqual([{ role: 'user', text: 'q' }]);
    expect(toChatTurns([])).toEqual([]);
  });
});

describe('чат: chatWithAI (замоканный fetch)', () => {
  const hist = [{ role: 'user' as const, text: 'привет' }, { role: 'ai' as const, text: 'здравствуйте' }, { role: 'user' as const, text: 'что съесть?' }];
  test('Gemini: контекст в system_instruction, история в contents, без схемы JSON', async () => {
    const f = jest.fn().mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: 'Съешьте творог.' }, { text: 'мысли', thought: true }] } }] }));
    (globalThis as any).fetch = f;
    const r = await chatWithAI(settings('gemini'), 'K', hist, 'КОНТЕКСТ-123');
    expect(r).toBe('Съешьте творог.');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.system_instruction.parts[0].text).toContain('КОНТЕКСТ-123');
    expect(body.system_instruction.parts[0].text).toContain(CHAT_SYSTEM.slice(0, 40));
    expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig.responseSchema).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
  test('Claude: роли user/assistant, без tools (только текст, ничего не меняет)', async () => {
    const f = jest.fn().mockResolvedValue(ok({ content: [{ type: 'text', text: 'Ответ' }] }));
    (globalThis as any).fetch = f;
    expect(await chatWithAI(settings('claude'), 'K', hist, 'CTX')).toBe('Ответ');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.system).toContain('CTX');
    expect(body.model).toBe('claude-test');
  });
  test('фото к вопросу: Gemini — inline_data только в последней реплике', async () => {
    const f = jest.fn().mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: 'Это йогурт.' }] } }] }));
    (globalThis as any).fetch = f;
    await chatWithAI(settings('gemini'), 'K', hist, 'CTX', [{ base64: 'AAA', mime: 'image/jpeg' }]);
    const c = JSON.parse(f.mock.calls[0][1].body).contents;
    expect(c[0].parts).toEqual([{ text: 'привет' }]);
    expect(c[2].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'AAA' } });
    expect(c[2].parts[1]).toEqual({ text: 'что съесть?' });
  });
  test('фото к вопросу: Claude — image-блок перед текстом последнего сообщения, без tools', async () => {
    const f = jest.fn().mockResolvedValue(ok({ content: [{ type: 'text', text: 'Ок' }] }));
    (globalThis as any).fetch = f;
    await chatWithAI(settings('claude'), 'K', hist, 'CTX', [{ base64: 'BBB', mime: 'image/jpeg' }]);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe('привет');
    expect(body.messages[2].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBB' } },
      { type: 'text', text: 'что съесть?' },
    ]);
    expect(body.tools).toBeUndefined();
  });
  test('без фото форма запроса прежняя; вопрос по умолчанию для фото без текста', () => {
    expect(DEFAULT_PHOTO_QUESTION).toMatch(/Что на фото/);
  });
  test('системный промпт запрещает менять данные и требует честности', () => {
    expect(CHAT_SYSTEM).toMatch(/НЕ можешь ничего записывать/);
    expect(CHAT_SYSTEM).toMatch(/не выдумывай/i);
    expect(CHAT_SYSTEM).toMatch(/по-русски/);
  });
  test('нет ключа / нет вопроса', async () => {
    await expect(chatWithAI(settings('gemini'), '', hist, '')).rejects.toThrow('API-ключ');
    await expect(chatWithAI(settings('gemini'), 'K', [{ role: 'ai', text: 'x' }], '')).rejects.toThrow('Напишите вопрос');
  });
  test('пустой ответ — ошибка', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(ok({ content: [] }));
    await expect(chatWithAI(settings('claude'), 'K', hist, '')).rejects.toThrow('Пустой ответ');
  });
  test('ошибки API превращаются в понятные', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(fail(429, 'quota'));
    await expect(chatWithAI(settings('gemini'), 'K', hist, '')).rejects.toThrow('Лимит запросов');
  });
  test('быстрый обрыв связи повторяется один раз', async () => {
    const f = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(ok({ content: [{ type: 'text', text: 'ок' }] }));
    (globalThis as any).fetch = f;
    expect(await chatWithAI(settings('claude'), 'K', hist, '')).toBe('ок');
    expect(f).toHaveBeenCalledTimes(2);
  });
  test('постоянный обрыв — дружелюбная ошибка', async () => {
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(chatWithAI(settings('claude'), 'K', hist, '')).rejects.toThrow('Связь с ИИ оборвалась');
  });
  test('тайм-аут: наш AITimeout вместо «canceled»', async () => {
    jest.useFakeTimers();
    (globalThis as any).fetch = jest.fn((_u: string, init: any) => new Promise((_res, rej) => { init.signal.addEventListener('abort', () => rej(new Error('Fetch request has been canceled'))); }));
    const p = chatWithAI(settings('gemini'), 'K', hist, '');
    const assertion = expect(p).rejects.toThrow('ИИ не ответил за 90 с');
    await jest.advanceTimersByTimeAsync(91000);
    await assertion;
  });
});

describe('ответ чата: рассуждения, перегрузка', () => {
  const A = require('../src/ai');
  test('stripReasoning: отрезает черновик, оставляет итог', () => {
    const raw = 'Пользователь пишет: «что съесть». Посмотрим на актуальные данные.\nНужно посоветовать ужин.\nНапишем короткий ответ.\n\nНа ужин возьмите рыбу с рисом — это уложится в остаток калорий.';
    expect(A.stripReasoning(raw)).toBe('На ужин возьмите рыбу с рисом — это уложится в остаток калорий.');
  });
  test('stripReasoning: обычный ответ и неуверенные случаи не трогает', () => {
    const ok1 = 'Съешьте творог с ягодами — белок и мало калорий.';
    expect(A.stripReasoning(ok1)).toBe(ok1);
    const only = 'Пользователь пишет: привет. Нужно посоветовать.';
    expect(A.stripReasoning(only)).toBe(only);
  });
  test('geminiThinking по моделям', () => {
    expect(A.geminiThinking('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
    expect(A.geminiThinking('gemini-2.5-pro')).toEqual({ thinkingBudget: 128 });
    expect(A.geminiThinking('gemini-3-flash-preview')).toEqual({ thinkingLevel: 'low' });
    expect(A.geminiThinking('gemini-1.5-flash')).toBeUndefined();
  });
  test('Gemini чат: thought-части отбрасываются, thinkingConfig задан, итог без рассуждений', async () => {
    const f = jest.fn().mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: 'Пользователь пишет…', thought: true }, { text: 'Съешьте творог.' }] } }] }));
    (globalThis as any).fetch = f;
    const r = await A.chatWithAI({ provider: 'gemini', geminiModel: 'gemini-2.5-flash', claudeModel: 'c' }, 'K', [{ role: 'user', text: 'что съесть?' }], 'ctx');
    expect(r).toBe('Съешьте творог.');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(JSON.stringify(body)).not.toContain('includeThoughts');
    expect(body.system_instruction.parts[0].text).toMatch(/ассуждений вслух/);
  });
  test('Claude чат: thinking-блоки игнорируются', async () => {
    const f = jest.fn().mockResolvedValue(ok({ content: [{ type: 'thinking', thinking: 'мысли' }, { type: 'text', text: 'Готовый ответ.' }] }));
    (globalThis as any).fetch = f;
    expect(await A.chatWithAI({ provider: 'claude', geminiModel: 'g', claudeModel: 'claude-x' }, 'K', [{ role: 'user', text: 'привет' }], 'ctx')).toBe('Готовый ответ.');
  });
  test('перегрузка: 503 и английский текст → дружелюбное сообщение', async () => {
    expect(A.friendlyError(new Error('This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'), false).message).toBe('Сервис ИИ перегружен, попробуйте позже.');
    (globalThis as any).fetch = jest.fn().mockResolvedValue(fail(503, 'The model is overloaded'));
    await expect(A.chatWithAI({ provider: 'gemini', geminiModel: 'gemini-2.5-flash', claudeModel: 'c' }, 'K', [{ role: 'user', text: 'привет' }], 'ctx')).rejects.toThrow('Сервис ИИ перегружен');
  });
});

