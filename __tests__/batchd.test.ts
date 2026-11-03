import { allIcons, iconFor, keywordCount, matchIcon } from '../src/icons';
import {
  canGo, clampDay, dayTarget, deleteTargetRecord, fracLabel, markAtOffset, markForValue, mergeItems, migrate, normalizeMenuTitle, portionMarks,
  recordTargets, targetAt, targetsFromLog, upsertTargetRecord,
} from '../src/logic';
import { analyzeFood, applyGrouping, decideGroup, dishTalk, normalize, normalizeDishTalk, refineDish } from '../src/ai';
import { AISettings, AppData } from '../src/types';
import { baseData as defaultData } from './helpers/data';
import { timestampAt } from '../src/utils';

const settings = (provider: 'claude' | 'gemini'): AISettings => ({ provider, claudeModel: 'claude-test', geminiModel: 'gemini-test' });
const ok = (body: any) => ({ ok: true, status: 200, json: async () => body }) as any;
const gem = (obj: any) => ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const claudeTool = (input: any) => ok({ content: [{ type: 'tool_use', input }] });
const realFetch = (globalThis as any).fetch;
afterEach(() => { (globalThis as any).fetch = realFetch; });

describe('иконки блюд (без ИИ)', () => {
  const cases: [string, string][] = [
    ['Пирог с лимонно-творожным курдом и вяленой клюквой', '🥧'],
    ['Морковные маффины с йогуртом', '🧁'],
    ['Филе белой рыбы со сладким соусом и бурым рисом', '🐟'],
    ['Боул с пастой, тунцом и вялеными томатами', '🥗'],
    ['Стейк на гриле с булгуром и сливочным соусом', '🥩'],
    ['Салат с грушей и сыром бри', '🥗'],
    ['Polpette al sugo с печеными овощами', '🍖'],
    ['Трюфели с арахисовой пастой', '🍫'],
    ['Персиковый чизкейк', '🍰'],
    ['Шаурма', '🌯'],
    ['Котлета по-киевски с сыром и овощами', '🍖'],
    ['Сырники со сметаной', '🥞'],
    ['Борщ со сметаной', '🍲'],
    ['Йогурт', '🥣'],
    ['Капучино 300 мл', '☕'],
    ['Зелёный чай', '🍵'],
    ['Овсянка с бананом и орехами', '🥣'],
    ['Гречка с курицей', '🥣'],
    ['Куриная грудка на гриле', '🍗'],
    ['Омлет с помидорами', '🍳'],
    ['Яйцо варёное', '🥚'],
    ['Банан', '🍌'],
    ['Яблоко', '🍎'],
    ['Пицца Маргарита', '🍕'],
    ['Спагетти карбонара', '🍝'],
    ['Пельмени со сметаной', '🥟'],
    ['Роллы Филадельфия', '🌯'],
    ['Суши с лососем', '🍣'],
    ['Плов с бараниной', '🥘'],
    ['Картофельное пюре', '🥔'],
    ['Бургер с говядиной', '🍔'],
    ['Шоколадный торт', '🎂'],
    ['Мороженое пломбир', '🍦'],
    ['Кефир 1%', '🥛'],
    ['Апельсиновый сок', '🧃'],
    ['Пиво светлое', '🍺'],
    ['Красное вино', '🍷'],
    ['Хлеб ржаной', '🍞'],
    ['Творог 5%', '🧀'],
    ['Креветки в кляре', '🍤'], ['Креветки отварные', '🦐'],
    ['Лосось на пару', '🐟'],
    ['Тыквенный суп-пюре', '🍲'],
    ['Грибной жульен', '🍄'],
    ['Вареники с картошкой', '🥟'],
    ['Блины с икрой', '🥞'],
  ];
  test.each(cases)('%s → %s', (name, emoji) => expect(iconFor(name)).toBe(emoji));
  test('ничего не нашлось — эмодзи от ИИ, иначе 🍽️', () => {
    expect(matchIcon('Абракадабра')).toBeUndefined();
    expect(iconFor('Абракадабра', '🥨')).toBe('🥨');
    expect(iconFor('Абракадабра')).toBe('🍽️');
    expect(iconFor('Абракадабра', '🍽️')).toBe('🍽️');
  });
  test('библиотека большая', () => {
    expect(allIcons().length).toBeGreaterThanOrEqual(100);
    expect(keywordCount()).toBeGreaterThanOrEqual(400);
  });
});

describe('«руль» доли порции', () => {
  const marks = portionMarks(60, 34);
  test('метки 0…2 крупные, дальше шаг ½ до 10', () => {
    expect(marks.filter((m) => m.big).map((m) => m.label)).toEqual(['0', '¼', '⅓', '½', '⅔', '¾', '1', '1¼', '1½', '2']);
    const small = marks.filter((m) => !m.big);
    expect(small[0].v).toBe(2.5);
    expect(small[small.length - 1].v).toBe(10);
    expect(small).toHaveLength(16);
    expect(marks[1].x - marks[0].x).toBe(60);
    expect(small[1].x - small[0].x).toBe(34);
  });
  test('подписи и ближайшая метка', () => {
    expect(fracLabel(2.5)).toBe('2½');
    expect(fracLabel(7)).toBe('7');
    expect(fracLabel(2 / 3)).toBe('⅔');
    expect(markAtOffset(marks, 62).v).toBe(0.25);
    expect(markAtOffset(marks, 9999).v).toBe(10);
    expect(markForValue(marks, 0.34).label).toBe('⅓');
    expect(markForValue(marks, 1).x).toBe(360);
  });
});

describe('история нормы', () => {
  const t0 = timestampAt('2026-10-01', 9 * 60);
  const t1 = timestampAt('2026-10-15', 18 * 60);
  let n = 0; const gid = () => 'r' + n++;
  const log = recordTargets(recordTargets([], { kcal: 2000, protein: 120 }, t0, gid), { kcal: 1800, protein: 120 }, t1, gid);
  test('запись только при изменении', () => {
    expect(log).toHaveLength(2);
    expect(recordTargets(log, { kcal: 1800, protein: 120 }, t1 + 1000)).toHaveLength(2);
  });
  test('targetAt — норма на конец дня, до первой записи — первая', () => {
    const fb = { kcal: 9999 };
    expect(targetAt('2026-09-20', log, fb).kcal).toBe(2000);
    expect(targetAt('2026-10-14', log, fb).kcal).toBe(2000);
    expect(targetAt('2026-10-15', log, fb).kcal).toBe(1800);
    expect(targetAt('2026-11-01', log, fb).kcal).toBe(1800);
    expect(targetAt('2026-11-01', [], fb).kcal).toBe(9999);
  });
  test('режимы статистики', () => {
    const d = { targets: { kcal: 1700, protein: 100, fat: 60, carbs: 200, waterGlasses: 8 }, targetLog: log };
    expect(dayTarget({ ...d, statsMode: 'history' }, '2026-10-02').kcal).toBe(2000);
    expect(dayTarget({ ...d, statsMode: 'latest' }, '2026-10-02').kcal).toBe(1700);
  });
  test('правка/удаление/добавление записей и текущая норма', () => {
    const edited = upsertTargetRecord(log, { ...log[1], kcal: 1900 });
    expect(edited.find((r) => r.id === log[1].id)!.kcal).toBe(1900);
    const added = upsertTargetRecord(edited, { id: 'x', at: t1 + 86400000, kcal: 1500 });
    expect(added.map((r) => r.kcal)).toEqual([2000, 1900, 1500]);
    expect(targetsFromLog({ kcal: 1, protein: 2, fat: 3, carbs: 4, waterGlasses: 8 }, added).kcal).toBe(1500);
    expect(deleteTargetRecord(added, 'x')).toHaveLength(2);
  });
  test('миграция: старые данные получают начальную запись', () => {
    const base = defaultData();
    const d = migrate({ ...base, targetLog: undefined, targets: { ...base.targets, kcal: 2222 }, entries: [{ id: 'e', date: '2026-01-05', time: timestampAt('2026-01-05', 600), meal: 'breakfast', item: { name: 'x' }, portion: 1, source: 'manual' }] } as any, base);
    expect(d.targetLog).toHaveLength(1);
    expect(d.targetLog![0].kcal).toBe(2222);
    expect(d.targetLog![0].at).toBeLessThanOrEqual(timestampAt('2026-01-05', 0));
    expect(d.statsMode).toBe('history');
    expect(migrate({ ...base, autoMeal: false } as any, base).autoMeal).toBe(false);
    expect(migrate({ ...base } as AppData, base).autoMeal).toBeUndefined();
  });
});

describe('навигация: без будущего', () => {
  test('canGo / clampDay', () => {
    expect(canGo('2026-11-03', 1, '2026-11-03')).toBe(false);
    expect(canGo('2026-11-02', 1, '2026-11-03')).toBe(true);
    expect(canGo('2026-11-03', -1, '2026-11-03')).toBe(true);
    expect(clampDay('2026-11-09', '2026-11-03')).toBe('2026-11-03');
    expect(clampDay('2026-11-01', '2026-11-03')).toBe('2026-11-01');
  });
});

describe('название меню с датой', () => {
  test.each([
    ['Меню 01.01.2026', '2026-01-01', 'Чт (01.01.2026)'],
    ['Суббота 31.10', '2026-10-30', 'Сб (31.10.2026)'],
    ['31 октября', '2026-11-02', 'Сб (31.10.2026)'],
    ['Пн 2/11/26', '2026-11-02', 'Пн (02.11.2026)'],
    ['Сб (31.10.2026)', '2026-11-02', 'Сб (31.10.2026)'],
    ['Доставка Grow Food', '2026-11-02', 'Доставка Grow Food'],
    ['31.12', '2027-01-02', 'Чт (31.12.2026)'],
  ])('%s', (t, ref, want) => expect(normalizeMenuTitle(t, ref)).toBe(want));
});

describe('слияние блюд', () => {
  test('mergeItems: суммы, название, состав', () => {
    const m = mergeItems([
      { item: { name: 'Гречка', kcal: 200, protein: 7, fat: 2, carbs: 40, grams: 150 }, portion: 1 },
      { item: { name: 'Курица', kcal: 300, protein: 40, fat: 10, carbs: 0, grams: 200 }, portion: 0.5 },
      { item: { name: 'Огурец', kcal: 15, protein: 0.8, fat: 0.1, carbs: 3, grams: 100 }, portion: 1 },
    ]);
    expect(m.name).toBe('Гречка + Курица + Огурец');
    expect(m.kcal).toBe(365);
    expect(m.protein).toBe(27.8);
    expect(m.grams).toBe(350);
    expect(m.note).toContain('Курица (½)');
  });
  test('неизвестное значение у одной части — итог неизвестен', () => {
    const m = mergeItems([{ item: { name: 'A', kcal: 100 }, portion: 1 }, { item: { name: 'B' }, portion: 1 }]);
    expect(m.kcal).toBeUndefined();
  });
  test('много блюд — короткое название', () => {
    const m = mergeItems(['a', 'b', 'c', 'd'].map((name) => ({ item: { name, kcal: 1, protein: 1, fat: 1, carbs: 1 }, portion: 1 })));
    expect(m.name).toBe('a и ещё 3');
  });
});

describe('одно блюдо или несколько', () => {
  const two = normalize({ items: [{ name: 'Банан', kcal: 100 }, { name: 'Йогурт', kcal: 150 }], isMenu: false, group: 'single' });
  test('явные признаки разных моментов → отдельно, даже если ИИ сказал single', () => {
    expect(decideGroup('утром съел банан, а в обед йогурт', two, false)).toBe('separate');
    expect(applyGrouping(two, 'утром съел банан, а в обед йогурт', false).items).toHaveLength(2);
  });
  test('перечисление без признаков → одно блюдо с суммой', () => {
    const r = applyGrouping({ ...two, group: undefined }, 'гречка, курица, огурец', false);
    expect(r.group).toBe('single');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kcal).toBe(250);
  });
  test('решение ИИ уважается', () => {
    expect(decideGroup('кофе и круассан', { ...two, group: 'separate' }, false)).toBe('separate');
    expect(decideGroup('гречка и курица', { ...two, group: 'single' }, false)).toBe('single');
    expect(decideGroup('', { ...two, group: undefined }, true)).toBe('separate');
  });
  test('analyzeFood: время и часть дня у отдельных записей, объяснение', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(gem({
      items: [{ name: 'Банан', kcal: 105, meal: 'Завтрак', time: '8:30' }, { name: 'Йогурт', kcal: 150, meal: 'обед' }],
      isMenu: false, title: '', comment: '', group: 'separate', explanation: '- банан ~120 г',
    }));
    const r = await analyzeFood(settings('gemini'), 'k', 'утром банан, в обед йогурт', []);
    expect(r.items).toHaveLength(2);
    expect((r.items[0] as any).time).toBe('8:30');
    expect((r.items[1] as any).meal).toBe('обед');
    expect(r.items[0].explain).toContain('банан');
    expect(r.explanation).toContain('банан');
  });
  test('analyzeFood: single от ИИ с несколькими элементами — сливаем', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(claudeTool({
      items: [{ name: 'Гречка', kcal: 200 }, { name: 'Курица', kcal: 250 }], isMenu: false, title: '', comment: '', group: 'single', explanation: 'x',
    }));
    const r = await analyzeFood(settings('claude'), 'k', 'гречка, курица', []);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kcal).toBe(450);
  });
  test('меню: промпт просит дату в формате «Сб (01.01.2026)» и день загрузки', async () => {
    const f = jest.fn().mockResolvedValue(gem({ items: [{ name: 'Каша', kcal: 200 }], isMenu: true, title: 'Сб (31.10.2026)', comment: '', group: 'separate', explanation: '' }));
    (globalThis as any).fetch = f;
    const r = await analyzeFood(settings('gemini'), 'k', 'меню', [], { mode: 'menu', refDate: '2026-10-31' });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.system_instruction.parts[0].text).toContain('Сб (01.01.2026)');
    expect(body.system_instruction.parts[0].text).toContain('2026-10-31');
    expect(r.title).toBe('Сб (31.10.2026)');
  });
});

describe('уточнение блюда с ИИ', () => {
  const dish = { name: 'Котлета с пюре', kcal: 600, protein: 30, fat: 30, carbs: 50, section: 'Обед' };
  test('normalizeDishTalk: изменено / просто ответ', () => {
    const a = normalizeDishTalk({ reply: 'Убрал пюре', changed: true, items: [{ name: 'Котлета', kcal: 300 }], explanation: 'только мясо' }, [dish]);
    expect(a.items![0].name).toBe('Котлета');
    expect(a.items![0].section).toBe('Обед');
    expect(a.items![0].explain).toBe('только мясо');
    const b = normalizeDishTalk({ reply: 'Из-за масла', changed: false, items: [], explanation: '' }, [dish]);
    expect(b.items).toBeUndefined();
    expect(b.reply).toBe('Из-за масла');
  });
  test('refineDish (Gemini): блюдо и просьба уходят в запрос', async () => {
    const f = jest.fn().mockResolvedValue(gem({ reply: 'Пересчитал только мясо', changed: true, items: [{ name: 'Котлета', kcal: 320, protein: 25, fat: 22, carbs: 5 }], explanation: '- котлета 120 г' }));
    (globalThis as any).fetch = f;
    const r = await refineDish(settings('gemini'), 'k', dish, 'съел только мясо');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.system_instruction.parts[0].text).toContain('Котлета с пюре');
    expect(body.contents[0].parts[0].text).toBe('съел только мясо');
    expect(r.changed).toBe(true);
    expect(r.item.kcal).toBe(320);
    expect(r.item.section).toBe('Обед');
  });
  test('dishTalk (Claude): история мини-разговора уходит целиком', async () => {
    const f = jest.fn().mockResolvedValue(claudeTool({ reply: 'Да, около 25 г', changed: false, items: [], explanation: '' }));
    (globalThis as any).fetch = f;
    const r = await dishTalk(settings('claude'), 'k', [dish], [
      { role: 'user', text: 'без пюре' }, { role: 'ai', text: 'Убрал пюре' }, { role: 'user', text: 'сколько белка?' },
    ]);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1].role).toBe('assistant');
    expect(r.reply).toBe('Да, около 25 г');
    expect(r.items).toBeUndefined();
  });
  test('без ключа — понятная ошибка', async () => {
    await expect(dishTalk(settings('gemini'), '', [dish], [{ role: 'user', text: 'x' }])).rejects.toThrow('ключ');
  });
});

import { menuTitleFromAI, weekdayIn } from '../src/logic';
describe('название меню из ответа ИИ', () => {
  test('дата / только день недели / ничего', () => {
    expect(menuTitleFromAI('Сб (31.10.2026)', '2026-10-31')).toBe('Сб (31.10.2026)');
    expect(menuTitleFromAI('Меню на 31.10', '2026-10-31')).toBe('Сб (31.10.2026)');
    expect(menuTitleFromAI('Суббота', '2026-11-01')).toBe('Сб (31.10.2026)');
    expect(menuTitleFromAI('Меню на понедельник', '2026-11-02')).toBe('Пн (02.11.2026)');
    expect(menuTitleFromAI('Доставка Grow Food', '2026-11-02')).toBeUndefined();
    expect(menuTitleFromAI('', '2026-11-02')).toBeUndefined();
    expect(weekdayIn('Пятница')).toBe(5);
    expect(weekdayIn('Спред')).toBeUndefined();
  });
});
