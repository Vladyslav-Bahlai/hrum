import { fracLabel, parseFrac, stepPortion, valueForX, xForValue, portionMarks } from '../src/logic';
import { amountLabel, numLabel, portionLabel, setDecimalMode } from '../src/utils';
import { factFor } from '../src/facts';
import { claudeBudget, geminiEffort, normalize } from '../src/ai';

afterEach(() => setDecimalMode(false));

describe('десятичный режим', () => {
  test('целые остаются целыми, без «3.00»', () => {
    setDecimalMode(true);
    expect(numLabel(3)).toBe('3');
    expect(fracLabel(3)).toBe('3');
    expect(fracLabel(0.5)).toBe('0.5');
    expect(fracLabel(1 / 3)).toBe('0.33');
    expect(portionLabel(0.25)).toBe('0.25');
    expect(amountLabel(0.5)).toBe('0.5 порции');
    expect(amountLabel(1)).toBe('1 порция');
  });
  test('дробный режим: ¼ ½ ¾ глифами, трети — «1/3»', () => {
    expect(fracLabel(1.75)).toBe('1¾');
    expect(portionLabel(2 / 3)).toBe('2/3');
    expect(amountLabel(0.5)).toBe('½ порции');
  });
});

describe('мелкий шаг доли', () => {
  test('дроби: шаг 1/8, с трети — к ближайшей восьмой', () => {
    expect(stepPortion(1, 1)).toBe(1.125);
    expect(stepPortion(0.5, -1)).toBe(0.375);
    expect(stepPortion(1 / 3, 1)).toBeCloseTo(0.375);
    expect(stepPortion(1 / 3, -1)).toBeCloseTo(0.25);
    expect(stepPortion(0, -1)).toBe(0);
    expect(fracLabel(0.375)).toBe('3/8');
    expect(fracLabel(1.125)).toBe('1 1/8');
  });
  test('десятичный: ±0.1 без хвостов', () => {
    setDecimalMode(true);
    expect(stepPortion(0.3, 1)).toBe(0.4);
    expect(stepPortion(1, -1)).toBe(0.9);
    expect(stepPortion(0.05, -1)).toBe(0);
  });
});

describe('шкала: любое значение имеет позицию', () => {
  const marks = portionMarks(60, 34);
  test('между метками — линейно, туда и обратно', () => {
    const x = xForValue(marks, 0.375);
    expect(x).toBeGreaterThan(xForValue(marks, 1 / 3));
    expect(x).toBeLessThan(xForValue(marks, 0.5));
    expect(valueForX(marks, x)).toBeCloseTo(0.375, 3);
    expect(valueForX(marks, xForValue(marks, 1.75))).toBeCloseTo(1.75, 3);
  });
});

describe('Frac', () => {
  test('разбор подписей', () => {
    expect(parseFrac('⅔')).toEqual({ whole: '', num: '2', den: '3' });
    expect(parseFrac('1¾')).toEqual({ whole: '1', num: '3', den: '4' });
    expect(parseFrac('1 3/8')).toEqual({ whole: '1', num: '3', den: '8' });
    expect(parseFrac('7')).toBeNull();
    expect(parseFrac('0.33')).toBeNull();
  });
});

describe('факты для карусели', () => {
  test('факт от ИИ важнее словаря; запасной вариант всегда есть', () => {
    expect(factFor({ name: 'Овсянка', fact: 'Свой факт.' })).toBe('Свой факт.');
    expect(factFor({ name: 'Овсянка с ягодами' })).toMatch(/бета-глюкан/);
    expect(factFor({ name: 'Нечто неизвестное' }).length).toBeGreaterThan(10);
  });
  test('normalize сохраняет fact', () => {
    const r = normalize({ items: [{ name: 'Тост', fact: ' Хлеб древнее колеса. ' }] });
    expect(r.items[0].fact).toBe('Хлеб древнее колеса.');
  });
});

describe('уровень размышления', () => {
  test('бюджет Claude и конфиг Gemini', () => {
    expect(claudeBudget('off')).toBe(0);
    expect(claudeBudget(undefined)).toBe(0);
    expect(claudeBudget('high')).toBeGreaterThan(claudeBudget('low'));
    expect(geminiEffort('gemini-3-flash', 'high')).toEqual({ thinkingLevel: 'high' });
    expect(geminiEffort('gemini-2.5-flash', 'off')).toEqual({ thinkingBudget: 0 });
    expect(geminiEffort('gemini-2.5-pro', 'off')).toEqual({ thinkingBudget: 128 });
    expect(geminiEffort('gemini-3-flash', undefined)).toBeUndefined();
  });
});
