import {
  addDays, amountLabel, calcTargets, carouselSlides, dishState, DEFAULT_MEALS, eatenByName, fmt, formatTimeInput, fromKey, hasAllMacros, hasAnyMacros, humanDate,
  isClosed, kcalOf, kcalText, known, macroText, mealAtMinutes, mealByTime, mealFromSection, menuLeftCount, menuTitleFor, minutesLabel, minutesOf, nut, parseTime,
  plural, portionLabel, remainLabel, restItems, scaled, setMealsConfig, shiftMinutes, sum, timestampAt, toKey, todayKey,
} from '../src/utils';
import { at, entry, item, menu } from './helpers/data';

beforeEach(() => setMealsConfig(DEFAULT_MEALS));

describe('даты', () => {
  test('toKey/fromKey — туда и обратно', () => {
    expect(toKey(new Date(2026, 10, 2))).toBe('2026-11-02');
    expect(toKey(fromKey('2026-01-05'))).toBe('2026-01-05');
  });
  test('addDays через границу месяца и года', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  test('humanDate: сегодня / вчера / завтра / обычная', () => {
    const t = todayKey();
    expect(humanDate(t)).toBe('Сегодня');
    expect(humanDate(addDays(t, -1))).toBe('Вчера');
    expect(humanDate(addDays(t, 1))).toBe('Завтра');
    expect(humanDate('2020-02-03')).toBe('3 февраля, понедельник');
  });
  test('menuTitleFor', () => expect(menuTitleFor('2026-11-02')).toBe('Понедельник, 2 ноября'));
});

describe('категории дня', () => {
  test('mealAtMinutes по интервалам', () => {
    expect(mealAtMinutes(8 * 60)).toBe('breakfast');
    expect(mealAtMinutes(13 * 60)).toBe('lunch');
    expect(mealAtMinutes(19 * 60)).toBe('dinner');
    expect(mealAtMinutes(11 * 60)).toBe('lunch'); // граница: "до" не включая
  });
  test('время вне интервалов — ближайшая категория', () => {
    expect(mealAtMinutes(3 * 60)).toBe('breakfast'); // 03:00 ближе к 06:00, чем к 24:00?
    expect(mealAtMinutes(0)).toBe('dinner');
  });
  test('интервал через полночь', () => {
    const meals = [{ key: 'night', label: 'Ночь', from: 22 * 60, to: 4 * 60 }, { key: 'day', label: 'День', from: 4 * 60, to: 22 * 60 }];
    expect(mealAtMinutes(23 * 60, meals)).toBe('night');
    expect(mealAtMinutes(2 * 60, meals)).toBe('night');
    expect(mealAtMinutes(12 * 60, meals)).toBe('day');
  });
  test('mealByTime использует часы даты', () => expect(mealByTime(new Date(2026, 0, 1, 18, 0))).toBe('dinner'));
  test('mealFromSection', () => {
    expect(mealFromSection('Завтрак')).toBe('breakfast');
    expect(mealFromSection('Суп')).toBe('lunch');
    expect(mealFromSection('Ужин')).toBe('dinner');
    expect(mealFromSection('2-й завтрак')).toBe('breakfast');
    expect(mealFromSection('Напитки')).toBeUndefined();
    expect(mealFromSection(undefined)).toBeUndefined();
  });
  test('setMealsConfig меняет набор категорий', () => {
    setMealsConfig([{ key: 'a', label: 'А', from: 0, to: 1440 }]);
    expect(mealAtMinutes(500)).toBe('a');
  });
});

describe('время', () => {
  test('minutesOf / timestampAt / minutesLabel', () => {
    const ts = timestampAt('2026-11-02', 13 * 60 + 5);
    expect(minutesOf(ts)).toBe(785);
    expect(toKey(new Date(ts))).toBe('2026-11-02');
    expect(minutesLabel(785)).toBe('13:05');
    expect(minutesLabel(0)).toBe('00:00');
  });
  test('parseTime принимает разные форматы', () => {
    expect(parseTime('13:30')).toBe(810);
    expect(parseTime('9:05')).toBe(545);
    expect(parseTime('930')).toBe(570);
    expect(parseTime('1930')).toBe(1170);
    expect(parseTime('9.15')).toBe(555);
  });
  test('parseTime отвергает мусор', () => {
    for (const bad of ['', '24:00', '12:60', 'абв', '9:5', '12345', '1:']) expect(parseTime(bad)).toBeNull();
  });
  test('formatTimeInput подставляет двоеточие', () => {
    expect(formatTimeInput('1930')).toBe('19:30');
    expect(formatTimeInput('9')).toBe('9');
    expect(formatTimeInput('093')).toBe('09:3');
    expect(formatTimeInput('19:3x0')).toBe('19:30');
  });
  test('shiftMinutes упирается в границы суток', () => {
    expect(shiftMinutes(10, -15)).toBe(0);
    expect(shiftMinutes(1430, 15)).toBe(1439);
    expect(shiftMinutes(600, 15)).toBe(615);
  });
});

describe('КБЖУ', () => {
  test('known: пустые значения — неизвестно', () => {
    expect(known({ name: 'x' })).toEqual({ kcal: false, protein: false, fat: false, carbs: false });
    expect(known({ name: 'x', kcal: 100 })).toEqual({ kcal: true, protein: false, fat: false, carbs: false });
    expect(known({ name: 'x', kcal: 0, protein: 0, fat: 0, carbs: 0 }).kcal).toBe(false);
  });
  test('known: нули БЖУ при калориях — не заполнено', () => {
    const k = known({ name: 'x', kcal: 100, protein: 0, fat: 0, carbs: 0 });
    expect(k.kcal).toBe(true);
    expect(k.protein).toBe(false);
  });
  test('known: ноль в одном из БЖУ — настоящий ноль', () => {
    const k = known({ name: 'сок', kcal: 100, protein: 0, fat: 0, carbs: 25 });
    expect(k).toEqual({ kcal: true, protein: true, fat: true, carbs: true });
  });
  test('hasAllMacros / hasAnyMacros', () => {
    expect(hasAllMacros(item('a'))).toBe(true);
    expect(hasAllMacros({ name: 'a', kcal: 5, protein: 1 })).toBe(false);
    expect(hasAnyMacros({ name: 'a', kcal: 5, protein: 1 })).toBe(true);
    expect(hasAnyMacros({ name: 'a', kcal: 5 })).toBe(false);
  });
  test('nut и scaled умножают на порцию', () => {
    expect(nut(item('a', 200), 0.5).kcal).toBe(100);
    expect(scaled(entry('1', '2026-11-02', 9, item('a', 200), { portion: 2 })).protein).toBe(20);
    expect(kcalOf({ name: 'a' })).toBe(0);
  });
  test('sum считает итоги и пропуски', () => {
    const s = sum([entry('1', 'd', 9, item('a', 100)), entry('2', 'd', 10, { name: 'b' }), entry('3', 'd', 11, item('c', 50), { portion: 2 })]);
    expect(s.kcal).toBe(200);
    expect(s.unk.kcal).toBe(1);
    expect(s.count).toBe(3);
  });
  test('текстовые представления', () => {
    expect(kcalText({ name: 'a' })).toBe('ккал не указаны');
    expect(kcalText(item('a', 1234))).toBe('1 234 ккал');
    expect(macroText({ name: 'a' })).toBe('БЖУ не указаны');
    expect(macroText(item('a'), 2)).toBe('Б 20 Ж 10 У 24');
    expect(macroText(item('a'), 1, true)).toBe('Б 10 · Ж 5 · У 12');
    expect(fmt(1234567)).toBe('1 234 567');
  });
  test('calcTargets: разумные значения и цели', () => {
    const base = { name: '', sex: 'male' as const, age: 30, height: 178, weight: 80, activity: 1.375 };
    const keep = calcTargets({ ...base, goal: 'keep' });
    const lose = calcTargets({ ...base, goal: 'lose' });
    const gain = calcTargets({ ...base, goal: 'gain' });
    expect(lose.kcal).toBeLessThan(keep.kcal);
    expect(gain.kcal).toBeGreaterThan(keep.kcal);
    expect(keep.kcal % 10).toBe(0);
    expect(keep.waterGlasses).toBe(8);
    expect(calcTargets({ ...base, sex: 'female', goal: 'keep' }).kcal).toBeLessThan(keep.kcal);
  });
});

describe('plural / amountLabel / portionLabel', () => {
  test('plural', () => {
    expect(plural(1, 'запись', 'записи', 'записей')).toBe('запись');
    expect(plural(3, 'запись', 'записи', 'записей')).toBe('записи');
    expect(plural(5, 'запись', 'записи', 'записей')).toBe('записей');
    expect(plural(11, 'запись', 'записи', 'записей')).toBe('записей');
    expect(plural(21, 'запись', 'записи', 'записей')).toBe('запись');
  });
  test('amountLabel', () => {
    expect(amountLabel(1)).toBe('1 порция');
    expect(amountLabel(0.5)).toBe('½ порции');
    expect(amountLabel(0.7, 200)).toBe('140 г');
    expect(amountLabel(0.7)).toBe('×0.7');
  });
  test('portionLabel', () => {
    expect(portionLabel(1 / 3)).toBe('⅓');
    expect(portionLabel(0.7)).toBe('0.7');
  });
});

describe('меню: остатки и закрытые блюда', () => {
  test('remainLabel', () => {
    expect(remainLabel(0.5)).toBe('осталась ½');
    expect(remainLabel(0.75)).toBe('осталась ¼');
    expect(remainLabel(2 / 3)).toBe('осталась ⅓');
    expect(remainLabel(1 / 3)).toBe('осталось ⅔');
    expect(remainLabel(0.25)).toBe('осталось ¾');
    expect(remainLabel(0.3)).toBe('осталось 70%');
    expect(remainLabel(1)).toBeNull();
    expect(remainLabel(1.5)).toBeNull();
  });
  test('dishState', () => {
    expect(dishState(0, false).kind).toBe('none');
    expect(dishState(0.5, false)).toEqual({ kind: 'part', label: 'осталась ½' });
    expect(dishState(1, false)).toEqual({ kind: 'done', label: 'съедено' });
    expect(dishState(2, false).label).toBe('съедено 2');
    expect(dishState(0, true).kind).toBe('closed');
    expect(dishState(0.5, true).kind).toBe('closed');
  });
  const m = menu('m1', ['2026-11-02'], [item('Суп'), item('Салат'), item('Каша')], { closed: ['Салат'] });
  test('eatenByName суммирует порции только этого меню и дня', () => {
    const e = [
      entry('1', '2026-11-02', 9, item('Суп'), { menuId: 'm1', portion: 0.5 }),
      entry('2', '2026-11-02', 10, item('Суп'), { menuId: 'm1', portion: 0.25 }),
      entry('3', '2026-11-03', 10, item('Суп'), { menuId: 'm1' }),
      entry('4', '2026-11-02', 10, item('Суп'), { menuId: 'other' }),
    ];
    expect(eatenByName(e, '2026-11-02', 'm1')).toEqual({ Суп: 0.75 });
  });
  test('isClosed / restItems / menuLeftCount', () => {
    expect(isClosed(m, 'Салат')).toBe(true);
    expect(isClosed(m, 'Суп')).toBe(false);
    expect(restItems(m, {}).map((i) => i.name)).toEqual(['Суп', 'Каша']);
    expect(restItems(m, { Суп: 0.5 }).map((i) => i.name)).toEqual(['Каша']);
    expect(menuLeftCount([m], [], '2026-11-02')).toBe(2);
    expect(menuLeftCount([m], [entry('1', '2026-11-02', 9, item('Каша'), { menuId: 'm1' })], '2026-11-02')).toBe(1);
  });
  test('carouselSlides: только несъеденные и незакрытые', () => {
    const s = carouselSlides([m], [], '2026-11-02');
    expect(s.map((x) => x.item.name)).toEqual(['Суп', 'Каша']);
  });
  test('carouselSlides: при нескольких меню порядок перемешивается (управляемый rng)', () => {
    const m2 = menu('m2', ['2026-11-02'], [item('Рыба'), item('Рис')]);
    const seq = [0, 0, 0]; let i = 0;
    const a = carouselSlides([m, m2], [], '2026-11-02', () => seq[i++ % 3]);
    const names = a.map((x) => x.item.name).sort();
    expect(names).toEqual(['Каша', 'Рис', 'Рыба', 'Суп']);
    // у одного меню порядок исходный
    expect(carouselSlides([m2], [], '2026-11-02', () => 0).map((x) => x.item.name)).toEqual(['Рыба', 'Рис']);
  });
});
