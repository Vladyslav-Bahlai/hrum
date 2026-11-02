import * as CH from '../src/chat';
import { DEFAULT_MEALS, setMealsConfig } from '../src/utils';
import { at, baseData, entry, item, menu } from './helpers/data';

beforeEach(() => setMealsConfig(DEFAULT_MEALS));

describe('день чата (граница 04:00)', () => {
  test('до 04:00 — ещё вчерашний чат, с 04:00 — новый', () => {
    expect(CH.chatDayKey(new Date(2026, 10, 2, 3, 59))).toBe('2026-11-01');
    expect(CH.chatDayKey(new Date(2026, 10, 2, 4, 0))).toBe('2026-11-02');
    expect(CH.chatDayKey(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
    expect(CH.chatDayKey(new Date(2026, 10, 2, 0, 0))).toBe('2026-11-01');
  });
  test('граница меняется настройкой', () => {
    expect(CH.chatDayKey(new Date(2026, 10, 2, 5, 0), 6)).toBe('2026-11-01');
    expect(CH.chatDayKey(new Date(2026, 10, 2, 6, 0), 6)).toBe('2026-11-02');
    expect(CH.chatDayKey(new Date(2026, 10, 2, 0, 30), 0)).toBe('2026-11-02');
  });
  test('через границу месяца и года', () => {
    expect(CH.chatDayKey(new Date(2027, 0, 1, 2, 0))).toBe('2026-12-31');
  });
  test('принимает timestamp; мусорный час → 4', () => {
    expect(CH.chatDayKey(new Date(2026, 10, 2, 3, 0).getTime())).toBe('2026-11-01');
    expect(CH.chatDayKey(new Date(2026, 10, 2, 3, 0), NaN)).toBe('2026-11-01');
  });
  test('chatTitle', () => {
    const now = new Date(2026, 10, 2, 12, 0);
    expect(CH.chatTitle('2026-11-02', now)).toBe('Сегодня');
    expect(CH.chatTitle('2026-11-01', now)).toBe('Вчера');
    expect(CH.chatTitle('2026-10-30', now)).toBe('30 октября, пятница');
    // ночью «сегодня» ещё вчерашний день
    expect(CH.chatTitle('2026-11-01', new Date(2026, 10, 2, 2, 0))).toBe('Сегодня');
  });
});

describe('настройки чата', () => {
  test('значения по умолчанию', () => {
    const s = CH.chatSettings({});
    expect(s.ctx).toEqual(CH.DEFAULT_CTX);
    expect(s.keepDays).toBe(30);
    expect(s.dayStartHour).toBe(4);
  });
  test('нормализация некорректных значений', () => {
    const s = CH.chatSettings({ chatSettings: { ctx: { summaryDays: -5, detailDays: 100, history: 'x', today: 'no' }, keepDays: 5, dayStartHour: 20 } });
    expect(s.ctx.summaryDays).toBe(0);
    expect(s.ctx.detailDays).toBe(14);
    expect(s.ctx.history).toBe(20);
    expect(s.ctx.today).toBe(true);
    expect(s.keepDays).toBe(30);
    expect(s.dayStartHour).toBe(11);
  });
  test('допустимые значения сохраняются', () => {
    const s = CH.chatSettings({ chatSettings: { ctx: { ...CH.DEFAULT_CTX, summaryDays: 14, favorites: true }, keepDays: 0, dayStartHour: 6 } });
    expect(s.ctx.summaryDays).toBe(14);
    expect(s.ctx.favorites).toBe(true);
    expect(s.keepDays).toBe(0);
    expect(s.dayStartHour).toBe(6);
  });
  test('пресеты различаются, sameCtx узнаёт текущий', () => {
    expect(CH.CTX_PRESETS).toHaveLength(3);
    expect(CH.sameCtx(CH.DEFAULT_CTX, CH.CTX_PRESETS[1].ctx)).toBe(true);
    expect(CH.sameCtx(CH.DEFAULT_CTX, CH.CTX_PRESETS[0].ctx)).toBe(false);
  });
  test('clampInt', () => {
    expect(CH.clampInt(5.6, 0, 10, 1)).toBe(6);
    expect(CH.clampInt(Infinity, 0, 10, 3)).toBe(3);
    expect(CH.clampInt(-1, 0, 10, 3)).toBe(0);
  });
});

describe('buildChatContext', () => {
  const NOW = new Date(2026, 10, 2, 18, 20);
  const data = () => {
    const d = baseData();
    d.entries = [
      entry('1', '2026-11-02', 8, item('Овсянка', 300), { meal: 'breakfast' }),
      entry('2', '2026-11-02', 13, item('Борщ', 250), { meal: 'lunch', portion: 0.5 }),
      entry('3', '2026-11-01', 13, item('Вчерашний плов', 600), { meal: 'lunch' }),
      entry('4', '2026-10-30', 9, item('Старый тост', 150), { meal: 'breakfast' }),
    ];
    d.menus = [menu('m1', ['2026-11-02'], [item('Борщ', 500, { section: 'Обед' }), item('Рыба', 400), item('Салат', 120)], { closed: ['Салат'] }),
      menu('m2', ['2026-11-05'], [item('Чужое меню')])];
    d.entries[1].menuId = 'm1';
    d.water['2026-11-02'] = 3;
    d.favorites = [{ id: 'f', item: item('Любимый йогурт', 90), uses: 2 }];
    return d;
  };
  const all = { ...CH.DEFAULT_CTX, favorites: true, summaryDays: 7, detailDays: 0 };

  test('содержит дату, профиль и норму', () => {
    const t = CH.buildChatContext(data(), NOW, all);
    expect(t).toContain('понедельник, 2 ноября, 18:20');
    expect(t).toContain('мужчина, 30 лет, рост 178 см, вес 80 кг, цель — похудение');
    expect(t).toContain('НОРМА В ДЕНЬ');
  });
  test('дневник сегодня: блюда, время, остаток, вода', () => {
    const t = CH.buildChatContext(data(), NOW, all);
    expect(t).toContain('ДНЕВНИК СЕГОДНЯ');
    expect(t).toContain('08:00 Овсянка');
    expect(t).toContain('Борщ ×0.5');
    expect(t).toContain('съедено 425');
    expect(t).toContain('вода 3 ст.');
    expect(t).not.toContain('Старый тост');
  });
  test('меню дня: только привязанные, с состоянием блюд', () => {
    const t = CH.buildChatContext(data(), NOW, all);
    expect(t).toContain('МЕНЮ НА СЕГОДНЯ');
    expect(t).toContain('Борщ — 500 ккал');
    expect(t).toContain('осталась ½');
    expect(t).toContain('Рыба — 400 ккал');
    expect(t).toContain('не тронуто');
    expect(t).not.toContain('закрыто');
    expect(t).not.toContain('Салат');
    expect(t).not.toContain('Чужое меню');
  });
  test('если меню нет — так и сказано', () => {
    const d = data(); d.menus = [];
    expect(CH.buildChatContext(d, NOW, all)).toContain('МЕНЮ НА СЕГОДНЯ: не добавлено.');
  });
  test('итоги прошлых дней: по дням, без списка блюд', () => {
    const t = CH.buildChatContext(data(), NOW, all);
    expect(t).toContain('ИТОГИ ПРОШЛЫХ ДНЕЙ (7)');
    expect(t).toContain('600 ккал');
    expect(t).toContain('записей нет');
    expect(t).not.toContain('Вчерашний плов');
    expect(t).toContain('В среднем за дни с записями: 375 ккал');
  });
  test('подробно за прошлые дни (M>0) включает блюда', () => {
    const t = CH.buildChatContext(data(), NOW, { ...all, detailDays: 1 });
    expect(t).toContain('ПОДРОБНО ЗА ПРОШЛЫЕ ДНИ');
    expect(t).toContain('Вчерашний плов');
    expect(t).not.toContain('Старый тост');
    expect(CH.buildChatContext(data(), NOW, { ...all, detailDays: 3 })).toContain('Старый тост');
  });
  test('избранные включаются по настройке', () => {
    expect(CH.buildChatContext(data(), NOW, all)).toContain('Любимый йогурт');
    expect(CH.buildChatContext(data(), NOW, { ...all, favorites: false })).not.toContain('Любимый йогурт');
  });
  test('выключенные блоки не попадают в контекст', () => {
    const t = CH.buildChatContext(data(), NOW, { today: false, menu: false, profile: false, favorites: false, summaryDays: 0, detailDays: 0, history: 0 });
    expect(t).toBe('Сейчас: понедельник, 2 ноября, 18:20.');
  });
  test('функция чистая: данные не меняются', () => {
    const d = data(); const snap = JSON.stringify(d);
    CH.buildChatContext(d, NOW, all);
    expect(JSON.stringify(d)).toBe(snap);
  });
  test('размер растёт с количеством включённых блоков', () => {
    const small = CH.estimateTokens(CH.buildChatContext(data(), NOW, CH.CTX_PRESETS[0].ctx));
    const large = CH.estimateTokens(CH.buildChatContext(data(), NOW, CH.CTX_PRESETS[2].ctx));
    expect(large).toBeGreaterThan(small);
  });
  test('tokensLabel', () => {
    expect(CH.tokensLabel(40)).toBe('~40 токенов');
    expect(CH.tokensLabel(1500)).toBe('~1,5 тыс. токенов');
    expect(CH.estimateTokens('абв'.repeat(10))).toBe(10);
  });
});

describe('история запроса', () => {
  const msg = (role: 'user' | 'ai', text: string, error = false) => CH.newMsg(role, text, 1, error, () => text);
  test('последние K, без ошибок и пустых', () => {
    const ms = [msg('user', 'a'), msg('ai', 'b'), msg('user', 'c'), msg('ai', 'ошибка', true), msg('ai', '  '), msg('user', 'd')];
    expect(CH.historyForRequest(ms, 2).map((m) => m.text)).toEqual(['c', 'd']);
    expect(CH.historyForRequest(ms, 0)).toEqual([]);
    expect(CH.historyForRequest(ms, 99).map((m) => m.text)).toEqual(['a', 'b', 'c', 'd']);
  });
  test('requestTurns: вопрос идёт последним даже при памяти 0', () => {
    const prev = [msg('user', 'a'), msg('ai', 'b')];
    expect(CH.requestTurns(prev, msg('user', 'q'), 0)).toEqual([{ role: 'user', text: 'q' }]);
    expect(CH.requestTurns(prev, msg('user', 'q'), 5).map((m) => m.text)).toEqual(['a', 'b', 'q']);
  });
  test('newMsg: флаг ошибки', () => {
    expect(CH.newMsg('ai', 'x', 5, true).error).toBe(true);
    expect(CH.newMsg('ai', 'x', 5).error).toBeUndefined();
  });
});

describe('хранение чатов', () => {
  const m = (t: string, at = 1) => CH.newMsg('user', t, at);
  test('appendChatMsg создаёт чат дня и дописывает в существующий', () => {
    let d = CH.appendChatMsg(baseData(), '2026-11-02', m('a', 10));
    d = CH.appendChatMsg(d, '2026-11-02', m('b', 20));
    d = CH.appendChatMsg(d, '2026-11-03', m('c', 30));
    expect(d.chats).toHaveLength(2);
    expect(d.chats![0].messages.map((x) => x.text)).toEqual(['a', 'b']);
    expect(d.chats![0].updatedAt).toBe(20);
  });
  test('вопросы одного дня — в один чат, следующего — в другой', () => {
    let d = baseData();
    const ask = (when: Date, text: string) => { d = CH.appendChatMsg(d, CH.chatDayKey(when), m(text, when.getTime())); };
    ask(new Date(2026, 10, 2, 9, 0), 'утро');
    ask(new Date(2026, 10, 2, 22, 0), 'вечер');
    ask(new Date(2026, 10, 3, 1, 30), 'ночью (ещё тот же день)');
    ask(new Date(2026, 10, 3, 4, 5), 'новый день');
    expect(d.chats!.map((c) => [c.id, c.messages.length])).toEqual([['2026-11-02', 3], ['2026-11-03', 1]]);
  });
  test('deleteChat / clearChats / removeChatMsg', () => {
    let d = CH.appendChatMsg(CH.appendChatMsg(baseData(), 'a', m('1')), 'b', m('2'));
    expect(CH.deleteChat(d, 'a').chats!.map((c) => c.id)).toEqual(['b']);
    expect(CH.clearChats(d).chats).toEqual([]);
    const id = d.chats![0].messages[0].id;
    expect(CH.removeChatMsg(d, 'a', id).chats!.map((c) => c.id)).toEqual(['b']); // пустой чат исчезает
  });
  test('pruneChats: удаляет старше keepDays, сегодняшний остаётся', () => {
    let d = baseData();
    for (const id of ['2026-09-01', '2026-10-01', '2026-10-10', '2026-11-02']) d = CH.appendChatMsg(d, id, m(id));
    const now = new Date(2026, 10, 2, 12, 0);
    expect(CH.pruneChats(d, now, 30).chats!.map((c) => c.id)).toEqual(['2026-10-10', '2026-11-02']);
    expect(CH.pruneChats(d, now, 7).chats!.map((c) => c.id)).toEqual(['2026-11-02']);
    expect(CH.pruneChats(d, now, 0)).toBe(d); // «всегда»
    expect(CH.pruneChats(baseData(), now, 7).chats).toBeUndefined();
  });
  test('pruneChats учитывает границу дня 04:00', () => {
    let d = CH.appendChatMsg(baseData(), '2026-11-01', m('x'));
    // в 02:00 «сегодня» ещё 1 ноября, чат с ключом 11-01 сегодняшний и не удаляется даже при минимальном сроке
    expect(CH.pruneChats(d, new Date(2026, 10, 2, 2, 0), 1).chats).toHaveLength(1);
  });
  test('sortedChats: новые сверху', () => {
    let d = baseData();
    for (const id of ['2026-10-01', '2026-11-02', '2026-10-15']) d = CH.appendChatMsg(d, id, m(id));
    expect(CH.sortedChats(d.chats).map((c) => c.id)).toEqual(['2026-11-02', '2026-10-15', '2026-10-01']);
    expect(CH.sortedChats(undefined)).toEqual([]);
  });
});

describe('выбор чата из истории', () => {
  test('выбранный чат активен в тот же день и сбрасывается при смене дня', () => {
    const today = CH.chatDayKey(new Date(2026, 10, 2, 12, 0));
    const override = { id: '2026-10-30', day: today };
    expect(CH.activeChatId(override, today)).toBe('2026-10-30');
    expect(CH.activeChatId(null, today)).toBe(today);
    // до 04:00 следующего дня — всё ещё прежний «день» чата
    const before4 = CH.chatDayKey(new Date(2026, 10, 3, 3, 59));
    expect(CH.activeChatId(override, before4)).toBe('2026-10-30');
    // с 04:00 — новый день, переопределение не действует
    const after4 = CH.chatDayKey(new Date(2026, 10, 3, 4, 0));
    expect(CH.activeChatId(override, after4)).toBe(after4);
  });
});

describe('вкладка «Чаты»: управление чатами', () => {
  const m = (t: string, at = 1, role: 'user' | 'ai' = 'user') => CH.newMsg(role, t, at);
  const now = new Date(2026, 10, 2, 12, 0);

  test('createChat: пустой чат, повтор не дублирует', () => {
    let d = CH.createChat(baseData(), 'c_1', 5);
    expect(d.chats).toEqual([{ id: 'c_1', messages: [], updatedAt: 5 }]);
    expect(CH.createChat(d, 'c_1', 9)).toBe(d);
    expect(CH.newChatId(() => 'x')).toBe('c_x');
    expect(CH.isDayId('2026-11-02')).toBe(true);
    expect(CH.isDayId('c_abc')).toBe(false);
  });
  test('несколько чатов в один день: сообщения идут в нужный', () => {
    let d = CH.createChat(baseData(), 'c_1', 5);
    d = CH.appendChatMsg(d, '2026-11-02', m('день'));
    d = CH.appendChatMsg(d, 'c_1', m('свой', 10));
    expect(d.chats!.map((c) => [c.id, c.messages.length])).toEqual([['c_1', 1], ['2026-11-02', 1]]);
    expect(d.chats![0].updatedAt).toBe(10);
  });
  test('renameChat: обрезка, пустое название убирает своё имя', () => {
    let d = CH.appendChatMsg(baseData(), '2026-11-02', m('привет'));
    d = CH.renameChat(d, '2026-11-02', '  План на неделю ');
    expect(d.chats![0].title).toBe('План на неделю');
    expect(CH.chatName(d.chats![0], '2026-11-02', now)).toBe('План на неделю');
    d = CH.renameChat(d, '2026-11-02', '   ');
    expect(d.chats![0].title).toBeUndefined();
    expect(CH.chatName(d.chats![0], '2026-11-02', now)).toBe('Сегодня');
    expect(CH.renameChat(d, '2026-11-02', 'x'.repeat(100)).chats![0].title!.length).toBe(60);
  });
  test('chatName: для созданного вручную — начало первого вопроса или «Новый чат»', () => {
    let d = CH.createChat(baseData(), 'c_1');
    expect(CH.chatName(d.chats![0], 'c_1', now)).toBe('Новый чат');
    d = CH.appendChatMsg(d, 'c_1', m('Что мне съесть на ужин, если уже было 1500 ккал?'));
    expect(CH.chatName(d.chats![0], 'c_1', now)).toBe('Что мне съесть на ужин, если уже…');
    expect(CH.chatName(undefined, 'c_9', now)).toBe('Новый чат');
  });
  test('togglePinChat и сортировка: закреплённые сверху', () => {
    let d = baseData();
    for (const [id, at] of [['2026-10-01', 1], ['2026-11-02', 3], ['c_1', 2]] as const) d = CH.appendChatMsg(d, id, m(id, at));
    expect(CH.sortedChats(d.chats).map((c) => c.id)).toEqual(['2026-11-02', 'c_1', '2026-10-01']);
    d = CH.togglePinChat(d, '2026-10-01');
    expect(CH.sortedChats(d.chats).map((c) => c.id)).toEqual(['2026-10-01', '2026-11-02', 'c_1']);
    d = CH.togglePinChat(d, '2026-10-01');
    expect(d.chats!.find((c) => c.id === '2026-10-01')!.pinned).toBeUndefined();
  });
  test('автоочистка не трогает закреплённые; чаты вручную — по последнему сообщению', () => {
    let d = baseData();
    d = CH.appendChatMsg(d, '2026-09-01', m('старый', new Date(2026, 8, 1, 12).getTime()));
    d = CH.appendChatMsg(d, 'c_old', m('мой старый', new Date(2026, 8, 5, 12).getTime()));
    d = CH.appendChatMsg(d, 'c_new', m('мой свежий', new Date(2026, 10, 1, 12).getTime()));
    d = CH.togglePinChat(d, 'c_old');
    const ids = (x: typeof d) => x.chats!.map((c) => c.id).sort();
    expect(ids(CH.pruneChats(d, now, 30))).toEqual(['c_new', 'c_old']);
    d = CH.togglePinChat(d, 'c_old');
    expect(ids(CH.pruneChats(d, now, 30))).toEqual(['c_new']);
    expect(CH.pruneChats(d, now, 0)).toBe(d);
  });
  test('deleteChat + upsertChat = отмена удаления', () => {
    let d = CH.appendChatMsg(baseData(), 'c_1', m('x'));
    const c = d.chats![0];
    d = CH.deleteChat(d, 'c_1');
    expect(d.chats).toEqual([]);
    expect(CH.upsertChat(d, c).chats).toEqual([c]);
    expect(CH.upsertChat(CH.upsertChat(d, c), { ...c, title: 'Т' }).chats).toEqual([{ ...c, title: 'Т' }]);
  });
  test('clearChats оставляет закреплённые', () => {
    let d = CH.appendChatMsg(CH.appendChatMsg(baseData(), 'a', m('1')), 'b', m('2'));
    d = CH.togglePinChat(d, 'b');
    expect(CH.clearChats(d).chats!.map((c) => c.id)).toEqual(['b']);
  });
  test('removeChatMsg: пустой чат с названием или закреплённый остаётся', () => {
    let d = CH.appendChatMsg(baseData(), 'c_1', m('x'));
    d = CH.renameChat(d, 'c_1', 'Имя');
    expect(CH.removeChatMsg(d, 'c_1', d.chats![0].messages[0].id).chats).toHaveLength(1);
  });
  test('searchChats: по названию и тексту, регистр не важен, сниппет', () => {
    let d = baseData();
    d = CH.appendChatMsg(d, '2026-11-02', m('Что съесть на ужин?', 3));
    d = CH.appendChatMsg(d, '2026-11-02', m('Лучше всего подойдёт Борщ с хлебом', 4, 'ai'));
    d = CH.appendChatMsg(d, 'c_1', m('про завтрак', 2));
    d = CH.renameChat(d, 'c_1', 'Диета');
    expect(CH.searchChats(d.chats, '', now)).toHaveLength(2);
    const r = CH.searchChats(d.chats, 'БОРЩ', now);
    expect(r.map((h) => h.chat.id)).toEqual(['2026-11-02']);
    expect(r[0].snippet).toContain('Борщ');
    expect(CH.searchChats(d.chats, 'диета', now).map((h) => [h.chat.id, h.snippet])).toEqual([['c_1', undefined]]);
    expect(CH.searchChats(d.chats, 'сегодня', now).map((h) => h.chat.id)).toEqual(['2026-11-02']); // по названию «Сегодня»
    expect(CH.searchChats(d.chats, 'нету такого', now)).toEqual([]);
  });

  test('chatPhotos: ссылки на фото всех чатов (для удаления файлов)', () => {
    let d = CH.appendChatMsg(baseData(), 'c_1', { ...m('a'), photos: ['file:///a.jpg', 'file:///b.jpg'] });
    d = CH.appendChatMsg(d, 'c_2', m('без фото'));
    d = CH.appendChatMsg(d, 'c_2', { ...m('b'), photos: ['file:///c.jpg'] });
    expect(CH.chatPhotos(d.chats)).toEqual(['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    expect(CH.chatPhotos(undefined)).toEqual([]);
    expect(CH.chatPhotos(CH.deleteChat(d, 'c_1').chats)).toEqual(['file:///c.jpg']);
  });
  test('requestTurns не тащит фото в историю (только текст)', () => {
    const q = { ...m('вопрос'), photos: ['file:///a.jpg'] };
    expect(CH.requestTurns([], q, 5)).toEqual([{ role: 'user', text: 'вопрос' }]);
  });
});

describe('подсказки-примеры в пустом инпуте «Спросить»', () => {
  test('ASK_HINTS: три примера с этими вопросами, период ~4 с', () => {
    expect(CH.ASK_HINTS).toHaveLength(3);
    expect(CH.ASK_HINTS[0]).toMatch(/что съесть сегодня/);
    expect(CH.ASK_HINTS[1]).toMatch(/как прошла неделя/);
    expect(CH.ASK_HINTS[2]).toMatch(/чем заменить/);
    expect(CH.ASK_HINT_MS).toBe(4000);
  });
  test('nextAskHint идёт по кругу', () => {
    expect(CH.nextAskHint(0)).toBe(1);
    expect(CH.nextAskHint(2)).toBe(0);
    expect(CH.nextAskHint(0, 0)).toBe(0);
  });
  test('askHintVisible: только пустой инпут без фокуса и без фото', () => {
    expect(CH.askHintVisible({ text: '', focus: false, photos: 0 })).toBe(true);
    expect(CH.askHintVisible({ text: '', focus: true, photos: 0 })).toBe(false);
    expect(CH.askHintVisible({ text: 'а', focus: false, photos: 0 })).toBe(false);
    expect(CH.askHintVisible({ text: '', focus: false, photos: 1 })).toBe(false);
  });
});

