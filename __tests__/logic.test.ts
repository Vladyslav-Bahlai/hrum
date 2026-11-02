import * as L from '../src/logic';
import { DEFAULT_MEALS, setMealsConfig } from '../src/utils';
import { AppData } from '../src/types';
import { at, baseData, entry, item, menu } from './helpers/data';

beforeEach(() => setMealsConfig(DEFAULT_MEALS));
let n = 0;
const gid = () => 'id' + ++n;

describe('записи дневника', () => {
  test('addEntries присваивает id и считает частоту избранных', () => {
    let d = baseData();
    d = L.toggleFavorite(d, item('Йогурт'), gid);
    const withFav = L.addEntries(d, [
      { date: '2026-11-02', time: 1, meal: 'breakfast', item: item('йогурт '), portion: 1, source: 'repeat' },
      { date: '2026-11-02', time: 2, meal: 'breakfast', item: item('Хлеб'), portion: 1, source: 'manual' },
    ], gid);
    expect(withFav.entries).toHaveLength(2);
    expect(withFav.entries.every((e) => e.id)).toBe(true);
    expect(withFav.favorites[0].uses).toBe(2); // 1 при добавлении + 1 использование
  });
  test('updateEntry меняет только нужную запись, в том числе время', () => {
    const d = { ...baseData(), entries: [entry('a', '2026-11-02', 9, item('x')), entry('b', '2026-11-02', 10, item('y'))] };
    const t = at('2026-11-02', 18, 30);
    const r = L.updateEntry(d, 'a', { time: t, meal: 'dinner' });
    expect(r.entries[0]).toMatchObject({ time: t, meal: 'dinner' });
    expect(r.entries[1].meal).toBe('lunch');
  });
  test('removeEntry / restoreEntry', () => {
    const e = entry('a', '2026-11-02', 9, item('x'));
    const d = { ...baseData(), entries: [e] };
    const r = L.removeEntry(d, 'a');
    expect(r.entries).toHaveLength(0);
    expect(L.restoreEntry(r, e).entries).toEqual([e]);
  });
});

describe('избранное и пресеты', () => {
  test('toggleFavorite добавляет и убирает (без учёта регистра)', () => {
    let d = L.toggleFavorite(baseData(), item('Борщ'), gid);
    expect(d.favorites).toHaveLength(1);
    d = L.toggleFavorite(d, item('борщ'), gid);
    expect(d.favorites).toHaveLength(0);
  });
  test('favoriteBubbles: только избранные, самые используемые первыми, с лимитом', () => {
    const d = { favorites: [
      { id: '1', item: item('A'), uses: 1 }, { id: '2', item: item('B'), uses: 5 }, { id: '3', item: item('C'), uses: 3 },
    ] };
    expect(L.favoriteBubbles(d).map((i) => i.name)).toEqual(['B', 'C', 'A']);
    expect(L.favoriteBubbles(d, 2)).toHaveLength(2);
    expect(L.favoriteBubbles({ favorites: [] })).toEqual([]);
  });
  test('savePreset: создаёт, обновляет по id и по названию, чистит portion', () => {
    let d = L.savePreset(baseData(), item('Каша', 200, { portion: 0.5 }), undefined, gid);
    expect(d.favorites).toHaveLength(1);
    expect(d.favorites[0].item.portion).toBeUndefined();
    const id = d.favorites[0].id;
    d = L.savePreset(d, item('Каша', 300), id, gid);
    expect(d.favorites[0].item.kcal).toBe(300);
    d = L.savePreset(d, item('каша', 400), undefined, gid);
    expect(d.favorites).toHaveLength(1);
    expect(d.favorites[0].item.kcal).toBe(400);
  });
  test('deletePreset', () => {
    const d = L.savePreset(baseData(), item('A'), undefined, gid);
    expect(L.deletePreset(d, d.favorites[0].id).favorites).toHaveLength(0);
  });
});

describe('вода и вес', () => {
  test('setWater не уходит в минус', () => {
    expect(L.setWater(baseData(), '2026-11-02', 3).water['2026-11-02']).toBe(3);
    expect(L.setWater(baseData(), '2026-11-02', -2).water['2026-11-02']).toBe(0);
  });
  test('addWeight заменяет запись дня, сортирует и обновляет вес профиля', () => {
    let d = L.addWeight(baseData(), { date: '2999-01-02', kg: 79 });
    d = L.addWeight(d, { date: '2999-01-01', kg: 80 });
    d = L.addWeight(d, { date: '2999-01-02', kg: 78 });
    expect(d.weights.map((w) => w.date)).toEqual(['2999-01-01', '2999-01-02']);
    expect(d.weights[1].kg).toBe(78);
    expect(d.profile.weight).toBe(78);
  });
  test('removeWeight', () => {
    const d = L.addWeight(baseData(), { date: '2020-01-01', kg: 70 });
    expect(L.removeWeight(d, '2020-01-01').weights).toHaveLength(0);
  });
});

describe('меню', () => {
  const m = menu('m1', ['2026-11-02'], [item('Суп'), item('Каша')]);
  test('saveMenu создаёт и обновляет', () => {
    let d = L.saveMenu(baseData(), m);
    expect(d.menus).toHaveLength(1);
    d = L.saveMenu(d, { ...m, title: 'Новое' });
    expect(d.menus).toHaveLength(1);
    expect(d.menus[0].title).toBe('Новое');
  });
  test('saveMenu забывает закрытые блюда, которых больше нет в меню', () => {
    const d = L.saveMenu(baseData(), { ...m, closed: ['Суп', 'Удалённое'] });
    expect(d.menus[0].closed).toEqual(['Суп']);
    const d2 = L.saveMenu(d, { ...d.menus[0], items: [item('Каша')] });
    expect(d2.menus[0].closed).toBeUndefined();
  });
  test('attachMenu / detachMenu', () => {
    let d = L.saveMenu(baseData(), m);
    d = L.attachMenu(d, 'm1', '2026-11-01');
    d = L.attachMenu(d, 'm1', '2026-11-01');
    expect(d.menus[0].dates).toEqual(['2026-11-01', '2026-11-02']);
    d = L.detachMenu(d, 'm1', '2026-11-02');
    expect(d.menus[0].dates).toEqual(['2026-11-01']);
  });
  test('deleteMenu не трогает записи дневника', () => {
    let d = L.saveMenu(baseData(), m);
    d = L.addEntries(d, [{ date: '2026-11-02', time: 1, meal: 'lunch', item: item('Суп'), portion: 1, source: 'menu', menuId: 'm1' }], gid);
    d = L.deleteMenu(d, 'm1');
    expect(d.menus).toHaveLength(0);
    expect(d.entries).toHaveLength(1);
  });
  test('setMenuDone', () => {
    const d = L.setMenuDone(L.saveMenu(baseData(), m), 'm1', true);
    expect(d.menus[0].done).toBe(true);
  });
  test('setDishClosed: закрыть, не дублировать, снять', () => {
    let d = L.saveMenu(baseData(), m);
    d = L.setDishClosed(d, 'm1', 'Суп', true);
    d = L.setDishClosed(d, 'm1', 'Суп', true);
    expect(d.menus[0].closed).toEqual(['Суп']);
    d = L.setDishClosed(d, 'm1', 'Суп', false);
    expect(d.menus[0].closed).toBeUndefined();
    expect(d.entries).toHaveLength(0); // в дневник ничего не попадает
  });
  test('replaceMenuItem сохраняет раздел и сбрасывает portion', () => {
    const d = L.saveMenu(baseData(), menu('m1', [], [item('Суп', 100, { section: 'Обед', portion: 0.5 })]));
    const r = L.replaceMenuItem(d, 'm1', 0, item('Борщ', 200));
    expect(r.menus[0].items[0]).toMatchObject({ name: 'Борщ', section: 'Обед' });
    expect(r.menus[0].items[0].portion).toBeUndefined();
  });
});

describe('категории: setMeals', () => {
  test('записи удалённой категории переезжают по времени', () => {
    const d = { ...baseData(), entries: [entry('a', '2026-11-02', 8, item('x'), { meal: 'breakfast' }), entry('b', '2026-11-02', 19, item('y'), { meal: 'dinner' })] };
    const meals = [{ key: 'day', label: 'День', from: 0, to: 12 * 60 }, { key: 'eve', label: 'Вечер', from: 12 * 60, to: 24 * 60 }];
    const r = L.setMeals(d, meals);
    expect(r.entries.map((e) => e.meal)).toEqual(['day', 'eve']);
    expect(r.meals).toBe(meals);
  });
  test('записи с существующей категорией не меняются', () => {
    const d = { ...baseData(), entries: [entry('a', '2026-11-02', 8, item('x'), { meal: 'lunch' })] };
    expect(L.setMeals(d, DEFAULT_MEALS).entries[0].meal).toBe('lunch');
  });
});

describe('звуки и модели', () => {
  test('setSoundMap / cacheModels', () => {
    expect(L.setSoundMap(baseData(), { add: 'bird' }).soundMap).toEqual({ add: 'bird' });
    const d = L.cacheModels(L.cacheModels(baseData(), 'gemini', ['g1']), 'claude', ['c1']);
    expect(d.ai.models).toEqual({ gemini: ['g1'], claude: ['c1'] });
  });
});

describe('migrate (загрузка старых данных)', () => {
  test('пустые данные → значения по умолчанию', () => {
    const r = L.migrate({}, baseData());
    expect(r.entries).toEqual([]);
    expect(r.menus).toEqual([]);
    expect(r.meals).toEqual(DEFAULT_MEALS);
    expect(r.chats).toEqual([]);
    expect(r.chatSettings).toBeUndefined();
  });
  test('старая запись «snack» раскладывается по времени суток', () => {
    const old: any = { entries: [{ id: 'a', date: '2026-11-02', time: at('2026-11-02', 19, 0), meal: 'snack', item: item('x'), portion: 1, source: 'manual' }] };
    expect(L.migrate(old, baseData()).entries[0].meal).toBe('dinner');
  });
  test('меню без дат привязывается ко дню создания, без items — пустой список', () => {
    const r = L.migrate({ menus: [{ id: 'm', title: 't', created: at('2026-10-01', 12), items: [item('a')] }, { id: 'n', title: 'u', created: 1 }] } as any, baseData());
    expect(r.menus[0].dates).toEqual(['2026-10-01']);
    expect(r.menus[1].items).toEqual([]);
  });
  test('closed: оставляются только существующие названия', () => {
    const r = L.migrate({ menus: [{ id: 'm', title: 't', created: 1, dates: [], items: [item('a')], closed: ['a', 'b', 5] }] } as any, baseData());
    expect(r.menus[0].closed).toEqual(['a']);
  });
  test('soundVolume: допустимые значения сохраняются, мусор отбрасывается', () => {
    expect(L.migrate({ soundVolume: 'low' } as any, baseData()).soundVolume).toBe('low');
    expect(L.migrate({ soundVolume: 'x' } as any, baseData()).soundVolume).toBeUndefined();
  });
  test('ai: настройки дополняются значениями по умолчанию', () => {
    const r = L.migrate({ ai: { provider: 'claude' } } as any, baseData());
    expect(r.ai.provider).toBe('claude');
    expect(r.ai.geminiModel).toBe('gemini-x');
  });
  test('чаты: битые отбрасываются, настройки нормализуются', () => {
    const r = L.migrate({
      chats: [{ id: '2026-11-02', updatedAt: 5, messages: [{ id: '1', role: 'user', text: 'привет', at: 1 }, { role: 'x', text: 'y' }, { role: 'ai' }] }, { id: 'e', messages: [] }, null, { id: 5 }],
      chatSettings: { ctx: { summaryDays: 999 }, keepDays: 13 },
    } as any, baseData());
    expect(r.chats).toHaveLength(1);
    expect(r.chats![0].messages).toHaveLength(1);
    expect(r.chatSettings!.ctx.summaryDays).toBe(30);
    expect(r.chatSettings!.keepDays).toBe(30);
  });
  test('чаты: фото сообщений — только строки-ссылки', () => {
    const r = L.migrate({ chats: [{ id: 'c_1', updatedAt: 1, messages: [
      { id: '1', role: 'user', text: 'x', at: 1, photos: ['file:///a.jpg', 5, '', null] },
      { id: '2', role: 'user', text: 'y', at: 2, photos: 'нет' },
    ] }] } as any, baseData());
    expect(r.chats![0].messages[0].photos).toEqual(['file:///a.jpg']);
    expect(r.chats![0].messages[1].photos).toBeUndefined();
  });
  test('чаты: название и закрепление сохраняются, пустой чат с названием/закрепом остаётся', () => {
    const r = L.migrate({
      chats: [
        { id: 'c_1', updatedAt: 5, title: '  План ', pinned: true, messages: [] },
        { id: 'c_2', updatedAt: 6, title: 5, pinned: 'да', messages: [{ id: '1', role: 'user', text: 'x', at: 1 }] },
        { id: 'c_3', updatedAt: 7, messages: [] },
      ],
    } as any, baseData());
    expect(r.chats!.map((c) => c.id)).toEqual(['c_1', 'c_2']);
    expect(r.chats![0]).toMatchObject({ title: 'План', pinned: true });
    expect(r.chats![1].title).toBeUndefined();
    expect(r.chats![1].pinned).toBeUndefined();
  });
});

describe('панель ввода и карусель', () => {
  const idle = { focus: false, text: '', photos: 0, busy: false, sheetOpen: false, picking: false };
  test('panelIsIdle: свёртывается только когда ничего не происходит', () => {
    expect(L.panelIsIdle(idle)).toBe(true);
    for (const patch of [{ focus: true }, { text: 'йог' }, { photos: 1 }, { busy: true }, { sheetOpen: true }, { picking: true }]) {
      expect(L.panelIsIdle({ ...idle, ...patch })).toBe(false);
    }
    expect(L.panelIsIdle({ ...idle, text: '   ' })).toBe(true);
    expect(L.PANEL_IDLE_MS).toBe(8000);
  });
  test('nextSlide: по кругу для одного меню', () => {
    expect(L.nextSlide(3, 0, false)).toBe(1);
    expect(L.nextSlide(3, 2, false)).toBe(0);
    expect(L.nextSlide(1, 0, false)).toBe(0);
    expect(L.AD_MS).toBe(3000);
  });
  test('nextSlide: случайный прыжок никогда не остаётся на месте', () => {
    for (let cur = 0; cur < 4; cur++) for (const r of [0, 0.3, 0.6, 0.99]) {
      const nx = L.nextSlide(4, cur, true, () => r);
      expect(nx).not.toBe(cur);
      expect(nx).toBeGreaterThanOrEqual(0);
      expect(nx).toBeLessThan(4);
    }
  });
});

describe('время записи', () => {
  test('entryTimestamp: без изменений — прежняя метка, иначе — дата записи + новые минуты', () => {
    const prev = new Date(2026, 10, 2, 13, 20, 45).getTime();
    expect(L.entryTimestamp(prev, '2026-11-02', 13 * 60 + 20)).toBe(prev);
    const t = L.entryTimestamp(prev, '2026-11-02', 18 * 60 + 5);
    expect(new Date(t).getHours()).toBe(18);
    expect(new Date(t).getMinutes()).toBe(5);
    expect(new Date(t).getDate()).toBe(2);
    // запись другого дня сохраняет свою дату
    const t2 = L.entryTimestamp(prev, '2026-10-30', 9 * 60);
    expect(new Date(t2).getDate()).toBe(30);
  });
});

describe('любимые модели ИИ', () => {
  const ai = (extra: any = {}) => ({ provider: 'gemini' as const, claudeModel: 'c-1', geminiModel: 'g-2', models: { gemini: ['g-1', 'g-2', 'g-3', 'g-4'], claude: ['c-1', 'c-2'] }, ...extra });
  test('toggleFavModel: добавляет и убирает по провайдеру', () => {
    let d = L.toggleFavModel(baseData(), 'gemini', 'g-3');
    expect(d.ai.favModels).toEqual({ gemini: ['g-3'] });
    d = L.toggleFavModel(d, 'claude', 'c-2');
    expect(d.ai.favModels).toEqual({ gemini: ['g-3'], claude: ['c-2'] });
    d = L.toggleFavModel(d, 'gemini', 'g-3');
    expect(d.ai.favModels!.gemini).toEqual([]);
  });
  test('modelChoices: любимых нет — показываем все', () => {
    expect(L.modelChoices(ai(), 'gemini')).toEqual({ list: ['g-1', 'g-2', 'g-3', 'g-4'], filtered: false });
    expect(L.modelChoices(ai({ favModels: { gemini: [] } }), 'gemini').filtered).toBe(false);
  });
  test('modelChoices: только любимые + активная модель всегда', () => {
    const r = L.modelChoices(ai({ favModels: { gemini: ['g-4', 'g-1'] } }), 'gemini');
    expect(r).toEqual({ list: ['g-1', 'g-2', 'g-4'], filtered: true }); // g-2 — активная, порядок как в списке провайдера
    expect(L.modelChoices(ai({ favModels: { gemini: ['g-2'] } }), 'gemini').list).toEqual(['g-2']);
  });
  test('modelChoices: избранные, которых нет в кэше, не учитываются; без кэша — только текущая', () => {
    expect(L.modelChoices(ai({ favModels: { gemini: ['устарела'] } }), 'gemini').filtered).toBe(false);
    expect(L.modelChoices({ provider: 'claude', claudeModel: 'c-1', geminiModel: 'g' } as any, 'claude')).toEqual({ list: ['c-1'], filtered: false });
  });
  test('фильтр по провайдеру независим', () => {
    const a = ai({ favModels: { gemini: ['g-4'] } });
    expect(L.modelChoices(a, 'claude').list).toEqual(['c-1', 'c-2']);
  });
  test('migrate: старые данные без favModels; мусор очищается', () => {
    expect(L.migrate({ ai: { provider: 'claude' } } as any, baseData()).ai.favModels).toBeUndefined();
    const r = L.migrate({ ai: { provider: 'gemini', favModels: { gemini: ['a', 'a', 5, ''], claude: 'нет' } } } as any, baseData());
    expect(r.ai.favModels).toEqual({ gemini: ['a'], claude: [] });
  });
});

describe('сворачиваемые секции', () => {
  test('toggleCollapsed / isCollapsed: независимо по ключам', () => {
    let d = baseData();
    expect(L.isCollapsed(d, 'dishes:rest')).toBe(false);
    d = L.toggleCollapsed(d, 'dishes:rest');
    expect(L.isCollapsed(d, 'dishes:rest')).toBe(true);
    expect(L.isCollapsed(d, 'dishes:presets')).toBe(false);
    d = L.toggleCollapsed(L.toggleCollapsed(d, 'dishes:presets'), 'dishes:rest');
    expect(d.collapsed).toEqual(['dishes:presets']);
  });
  test('migrate: состояние сохраняется, мусор отбрасывается', () => {
    expect(L.migrate({ collapsed: ['a', 'a', 5, ''] } as any, baseData()).collapsed).toEqual(['a']);
    expect(L.migrate({ collapsed: 'x' } as any, baseData()).collapsed).toBeUndefined();
    expect(L.migrate({}, baseData()).collapsed).toBeUndefined();
  });
});

describe('свайп по дню: зоны и блокировки', () => {
  const base = { animating: false, chatOpen: false, dx: -60, dy: 5, y0: 400, zone: null as { y: number; h: number } | null };
  test('обычный горизонтальный жест разрешён', () => {
    expect(L.daySwipeAllowed(base)).toBe(true);
  });
  test('вертикальный, короткий или диагональный жест — нет', () => {
    expect(L.daySwipeAllowed({ ...base, dx: -8 })).toBe(false);
    expect(L.daySwipeAllowed({ ...base, dy: 80 })).toBe(false);
    expect(L.daySwipeAllowed({ ...base, dx: -40, dy: 30 })).toBe(false);
  });
  test('во время анимации и при открытом чате — нет', () => {
    expect(L.daySwipeAllowed({ ...base, animating: true })).toBe(false);
    expect(L.daySwipeAllowed({ ...base, chatOpen: true })).toBe(false);
  });
  test('старт в зоне горизонтального списка (таблетки меню): нет, с допуском 6px', () => {
    const zone = { y: 200, h: 50 };
    expect(L.daySwipeAllowed({ ...base, zone, y0: 220 })).toBe(false);
    expect(L.daySwipeAllowed({ ...base, zone, y0: 195 })).toBe(false);
    expect(L.daySwipeAllowed({ ...base, zone, y0: 256 })).toBe(false);
    expect(L.daySwipeAllowed({ ...base, zone, y0: 193 })).toBe(true);
    expect(L.daySwipeAllowed({ ...base, zone, y0: 257 })).toBe(true);
  });
});

describe('панель «+»: малая кнопка и тап по ленте', () => {
  test('smallBtnMode: пусто — свернуть, текст или фото — отправить', () => {
    expect(L.smallBtnMode({ text: '', photos: 0 })).toBe('collapse');
    expect(L.smallBtnMode({ text: '   ', photos: 0 })).toBe('collapse');
    expect(L.smallBtnMode({ text: 'йогурт', photos: 0 })).toBe('send');
    expect(L.smallBtnMode({ text: '', photos: 1 })).toBe('send');
  });
  test('outsideTapAction: пусто — свернуть; есть ввод или режим «Спросить» — только убрать клавиатуру', () => {
    expect(L.outsideTapAction({ text: '', photos: 0, askMode: false })).toBe('collapse');
    expect(L.outsideTapAction({ text: ' ', photos: 0, askMode: false })).toBe('collapse');
    expect(L.outsideTapAction({ text: 'а', photos: 0, askMode: false })).toBe('blur');
    expect(L.outsideTapAction({ text: '', photos: 2, askMode: false })).toBe('blur');
    expect(L.outsideTapAction({ text: '', photos: 0, askMode: true })).toBe('blur');
  });
});

describe('панель «+»: что видно', () => {
  test('без фокуса, «Записать»: переключатель, любимые, боковые кружки; чипа модели нет, кнопка отдельная', () => {
    expect(L.panelParts({ focus: false, ask: false, hasQuick: true })).toEqual({ showSeg: true, showChip: false, showQuick: true, showSide: true, buttonInside: false });
  });
  test('нет любимых — ряд не показывается', () => {
    expect(L.panelParts({ focus: false, ask: false, hasQuick: false }).showQuick).toBe(false);
  });
  test('с фокусом: переключатель остаётся, рядом чип модели, кнопка уходит внутрь инпута', () => {
    expect(L.panelParts({ focus: true, ask: false, hasQuick: true })).toEqual({ showSeg: true, showChip: true, showQuick: false, showSide: false, buttonInside: true });
  });
  test('«Спросить» без фокуса: переключатель, без любимых и кружков, чипа нет', () => {
    expect(L.panelParts({ focus: false, ask: true, hasQuick: true })).toEqual({ showSeg: true, showChip: false, showQuick: false, showSide: false, buttonInside: false });
  });
});

describe('колода блюд карусели', () => {
  const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  test('shuffle: все элементы на месте, исходный массив не меняется', () => {
    const src = [1, 2, 3, 4, 5]; const r = L.shuffle(src, seeded(7));
    expect([...r].sort()).toEqual(src); expect(src).toEqual([1, 2, 3, 4, 5]);
  });
  test('newDeck: перестановка без повторов, первый не равен avoidFirst', () => {
    for (let sd = 1; sd < 60; sd++) for (const len of [2, 3, 5, 8]) for (const av of [-1, 0, len - 1]) {
      const d = L.newDeck(len, av, seeded(sd));
      expect([...d].sort((a, b) => a - b)).toEqual(Array.from({ length: len }, (_, i) => i));
      if (av >= 0) expect(d[0]).not.toBe(av);
    }
    expect(L.newDeck(1, 0)).toEqual([0]);
    expect(L.newDeck(0)).toEqual([]);
  });
  test('deckStep: круг без повторов, все блюда, на границе — новая колода без повтора последнего', () => {
    const rng = seeded(3); const len = 6;
    let deck = { order: L.newDeck(len, -1, rng), pos: 0 };
    for (let lap = 0; lap < 20; lap++) {
      const seen: number[] = [deck.order[deck.pos]];
      const last = deck.order[len - 1];
      for (let k = 1; k < len; k++) { deck = L.deckStep(deck, rng); seen.push(deck.order[deck.pos]); }
      expect(new Set(seen).size).toBe(len);
      deck = L.deckStep(deck, rng); // граница круга
      expect(deck.pos).toBe(0);
      expect(deck.order[0]).not.toBe(last);
    }
  });
  test('одно блюдо — колода остаётся на нём', () => {
    expect(L.deckStep({ order: [0], pos: 0 })).toEqual({ order: [0], pos: 0 });
  });
});

