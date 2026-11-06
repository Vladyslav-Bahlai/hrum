import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Alert, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../ui/RNText';
import { play } from '../sound';
import { C, T, TABS, shade } from '../theme';
import { Icon } from '../ui/Icon';
import { ActBtn, Btn, Chip, Field, NumField, Sheet } from '../ui/kit';
import { AmountPicker } from '../ui/Amount';
import { useStore } from '../store';
import { analyzeFood, isCancelled } from '../ai';
import { ModelSelect } from './ModelPopup';
import { getKey } from '../storage';
import { fromCamera, fromGallery, Picked } from '../media';
import { Entry, FoodItem, Menu } from '../types';
import { DayTitle } from '../ui/DayTitle';
import { dishState, eatenByName, fmt, humanDate, isClosed, kcalOf, kcalText, known, macroText, menuTitleFor, plural, r0, restItems, sum, uid } from '../utils';
import { useToast } from '../ui/Toast';
import { menuTitleFromAI } from '../logic';
import { Tabs } from '../ui/kit';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { DishesView, DishPicker } from './Dishes';
import { DishIcon } from '../ui/DishIcon';
import { IconPicker } from './IconPicker';
import { ExplainButton, RefineHistory, RefineInput, useRefine } from './DishAssist';
const X = TABS.menu;

/** Вкладка «Меню»: сохранённые меню, добавление блюда в дневник одним тапом. */
export function MenuScreen({ date, go, canNext, openCalendar, topInset, bottom, request, onAdd, onAddAll, onAddDish, onUpdateEntry, onRemoveEntry, onRequestDone }: {
  /** обновить в дневнике запись, добавленную из меню */
  onUpdateEntry: (id: string, item: FoodItem, portion: number) => void;
  /** убрать с дневника запись, добавленную из меню */
  onRemoveEntry: (e: Entry) => void;
  /** запрос из дневника обработан — забыть его (иначе он срабатывает при каждом возврате во вкладку) */
  onRequestDone?: () => void;
  date: string;
  /** отступ снизу для плавающей панели инструментов */
  bottom: number;
  /** запрос из дневника: открыть выбор прошлого меню / загрузку / конструктор */
  request?: { n: number; kind: 'attach' | 'upload' | 'manual' };
  go: (n: number) => void;
  openCalendar: () => void;
  topInset: number;
  onAdd: (item: FoodItem, portion: number, menu: Menu) => void;
  onAddAll: (items: FoodItem[], menu: Menu) => void;
  onAddDish: (item: FoodItem) => void;
  /** можно ли перейти на следующий день (в будущее нельзя) */
  canNext: boolean;
}) {
  const store = useStore();
  const [view, setView] = useState<'menu' | 'dishes' | 'old'>('menu');
  // меню показываются только на тех днях, к которым привязаны (будущие дни — пустые, без «вчерашнего»)
  const menus = useMemo(() => store.data.menus.filter((m) => m.dates.includes(date)), [store.data.menus, date]);
  const toast = useToast();
  const [replace, setReplace] = useState<{ index: number } | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [pickOld, setPickOld] = useState(false);
  const [sel, setSel] = useState<string | undefined>(menus[0]?.id);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<Menu | null>(null);
  const [portionFor, setPortionFor] = useState<{ item: FoodItem; index: number } | null>(null);
  const [iconFor, setIconFor] = useState<FoodItem | null>(null);
  const [amount, setAmount] = useState(1);
  // блюдо, уточнённое с ИИ («съел только мясо») — добавляется в дневник вместо исходного; меню не меняется
  const [refined, setRefined] = useState<FoodItem | null>(null);
  // последняя запись этого блюда в дневнике выбранного дня (её можно обновить или убрать прямо отсюда)
  const menuNow = menus.find((m) => m.id === sel);
  const lastEntry = useMemo(() => {
    if (!portionFor || !menuNow) return undefined;
    return store.data.entries.filter((e) => e.date === date && e.menuId === menuNow.id && e.item.name === portionFor.item.name).sort((a, b) => a.time - b.time).pop();
  }, [store.data.entries, portionFor, menuNow, date]);
  useEffect(() => {
    if (!portionFor) return;
    // открыли блюдо, уже внесённое в дневник, — показываем то, что записано (порцию и уточнённую версию)
    setAmount(lastEntry ? lastEntry.portion : 1);
    setRefined(lastEntry && menuNow && JSON.stringify([lastEntry.item.kcal, lastEntry.item.protein, lastEntry.item.fat, lastEntry.item.carbs, lastEntry.item.note]) !== JSON.stringify([portionFor.item.kcal, portionFor.item.protein, portionFor.item.fat, portionFor.item.carbs, portionFor.item.note]) ? lastEntry.item : null);
  }, [portionFor?.index, portionFor?.item.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const refineP = useRefine([refined || portionFor?.item || { name: '' }], (its, orig) => setRefined(orig ? null : its[0]));
  useEffect(() => { refineP.reset(); }, [portionFor?.index, portionFor?.item.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // название остаётся как в меню (по нему считается «съедено»), что изменил ИИ — в заметке
  const asEaten = (orig: FoodItem, r: FoodItem | null): FoodItem => (!r ? orig : { ...r, name: orig.name, section: orig.section, note: r.name.trim() !== orig.name.trim() ? `${r.name}${r.note ? ' — ' + r.note : ''}` : r.note });

  useEffect(() => {
    if (!menus.find((m) => m.id === sel)) setSel(menus[0]?.id);
  }, [menus, sel]);
  useEffect(() => {
    if (!request) return;
    setView('menu');
    if (request.kind === 'attach') setPickOld(true);
    else if (request.kind === 'upload') setCreate(true);
    else setEdit(blankMenu(date));
    onRequestDone?.();
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = menus.find((m) => m.id === sel);

  // сколько порций каждого блюда уже отмечено в выбранный день
  const eaten = useMemo(() => (menu ? eatenByName(store.data.entries, date, menu.id) : {}), [store.data.entries, date, menu]);

  // таблетки меню дня (+ «плюс» в конце — взять из прошлых); список — ScrollView из gesture-handler, он не отдаёт жест свайпу дня
  const showPills = view === 'menu' && menus.length > 0;

  const sections = useMemo(() => {
    const out: { title: string; items: FoodItem[] }[] = [];
    for (const it of menu?.items || []) {
      const t = it.section || '';
      const last = out[out.length - 1];
      if (last && last.title === t) last.items.push(it);
      else out.push({ title: t, items: [it] });
    }
    return out;
  }, [menu]);

  const total = menu ? sum(menu.items.map((item) => ({ item, portion: 1 } as any))) : null;
  const eatenKcal = menu ? store.data.entries.filter((e) => e.date === date && e.menuId === menu.id).reduce((a, e) => a + (known(e.item).kcal ? e.item.kcal! * e.portion : 0), 0) : 0;

  const add = (item: FoodItem, portion: number) => {
    if (!menu) return;
    onAdd(item, portion, menu);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* шапка */}
      <View style={[st.head, { paddingTop: topInset + 6 }]}>
        <Pressable onPress={() => go(-1)} hitSlop={8} style={{ padding: 6 }}><Icon name="left" size={24} color={C.inkSoft} /></Pressable>
        <DayTitle date={date} onPress={openCalendar} tab="menu" caption="Меню на" />
        <Pressable accessibilityLabel="Следующий день" onPress={() => go(1)} disabled={!canNext} hitSlop={8} style={{ padding: 6, opacity: canNext ? 1 : 0.3 }}><Icon name="right" size={24} color={canNext ? C.inkSoft : C.line} /></Pressable>
      </View>

      <Tabs items={[{ key: 'menu', label: 'Меню дня', n: menus.length || undefined }, { key: 'dishes', label: 'Мои блюда', n: store.data.favorites.length || undefined }, { key: 'old', label: 'Старые меню', n: store.data.menus.filter((m) => m.done).length || undefined }]}
        value={view} onChange={setView} style={{ paddingHorizontal: 20 }} />

      {view === 'dishes' ? <DishesView onAdd={onAddDish} /> : null}
      {view === 'old' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 230 }} keyboardShouldPersistTaps="handled">
          <Text style={[T.small, { marginBottom: 12 }]}>Меню, отмеченные как полностью съеденные. В списки «Из прошлых» они не попадают — найти их можно только здесь.</Text>
          <PastMenus date={date} only="done" onTaken={(id) => { setSel(id); setView('menu'); }} onAll={() => {}} />
        </ScrollView>
      ) : null}

      {showPills ? (
        <View style={{ flexGrow: 0, flexShrink: 0 }}>
        <GHScrollView testID="menu-pills" horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 12, alignItems: 'center' }}>
          {menus.map((m) => {
            const on = m.id === sel;
            return (
              <Pressable key={m.id} onPress={() => setSel(m.id)} style={[st.pill, on && st.pillOn]}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: on ? C.white : C.inkSoft }} numberOfLines={1}>{m.title}</Text>
                {m.done ? <Text style={{ fontSize: 12, color: on ? '#D6E8DC' : C.muted, marginLeft: 6 }}>съедено</Text> : null}
              </Pressable>
            );
          })}
          <Pressable accessibilityLabel="Добавить меню из прошлых" onPress={() => setPickOld(true)} style={({ pressed }) => [st.pill, st.pillPlus, pressed && { opacity: 0.7 }]}>
            <Icon name="plus" size={20} color={X.accent} stroke={2.2} />
          </Pressable>
        </GHScrollView>
        </View>
      ) : null}

      {view !== 'menu' ? null : !menu ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 230 }} keyboardShouldPersistTaps="handled">
          <View style={st.empty}>
            <Text style={[T.h2, { textAlign: 'center' }]}>На этот день меню нет</Text>
            <Text style={[T.bodySoft, { textAlign: 'center', marginTop: 8 }]}>
              Загрузите новое меню — или возьмите одно из прошлых ниже. Внизу — панель инструментов.
            </Text>
          </View>
          <PastMenus date={date} limit={3} onTaken={(id) => setSel(id)} onAll={() => setPickOld(true)} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 290 }} showsVerticalScrollIndicator={false}>
          {menu.done ? (
            <View style={st.yBanner}>
              <Text style={[T.bodySoft, { fontSize: 14 }]}>Меню отмечено как полностью съеденное — оно не предлагается для переноса на новые дни.</Text>
            </View>
          ) : null}
          <View style={st.paper}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[T.h2, { textAlign: 'left', flex: 1 }]} numberOfLines={2}>{menu.title}</Text>
              <Pressable onPress={() => setEdit(menu)} hitSlop={10} style={{ padding: 4 }}>
                <Icon name="edit" size={20} color={C.inkSoft} />
              </Pressable>
            </View>
            {total ? <MenuSummary total={total} count={menu.items.length} eatenKcal={eatenKcal} /> : null}

            {sections.map((sec, si) => (
              <View key={si} style={{ marginTop: 18 }}>
                {sec.title ? (
                  <View style={st.secHead}>
                    <View style={st.secLine} />
                    <Text style={st.secTitle}>{sec.title}</Text>
                    <View style={st.secLine} />
                  </View>
                ) : null}
                {sec.items.map((it, i) => {
                  const n = eaten[it.name] || 0;
                  const closed = isClosed(menu, it.name);
                  const ds = dishState(n, closed);
                  return (
                    <Pressable key={i} onLongPress={() => setPortionFor({ item: it, index: menu.items.indexOf(it) })} delayLongPress={300}
                      onPress={() => setPortionFor({ item: it, index: menu.items.indexOf(it) })} style={({ pressed }) => [st.dish, closed && { opacity: 0.55 }, pressed && { opacity: 0.7 }]}>
                      <View style={{ alignItems: 'center', marginRight: 12, alignSelf: 'flex-start', gap: 6 }}>
                        <View style={[st.num, { marginRight: 0 }, n || closed ? { backgroundColor: X.accent, borderColor: X.accent } : null]}>
                          <Text style={[st.numT, n || closed ? { color: C.white } : null]}>{menu.items.indexOf(it) + 1}</Text>
                        </View>
                        <DishIcon name={it.name} emoji={it.emoji} en={it.en} where="menu" onLongPress={() => setIconFor(it)} />
                      </View>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                          <Text style={[T.h3, { flex: 1 }, closed && { textDecorationLine: 'line-through' }]}>{it.name}</Text>
                          <Text style={[T.body, T.num, { fontWeight: '700', marginLeft: 8 }, !known(it).kcal && { color: C.muted }]}>{known(it).kcal ? fmt(it.kcal!) : '—'}</Text>
                        </View>
                        <Text style={[T.small, { marginTop: 3 }]}>
                          {it.grams ? `${r0(it.grams)} г · ` : ''}{macroText(it, 1, true)}
                        </Text>
                        {it.note ? <Text style={[T.small, { color: C.inkSoft, marginTop: 2 }]} numberOfLines={2}>{it.note}</Text> : null}
                        {ds.kind !== 'none' ? (
                          <View style={[st.eaten, ds.kind === 'part' && st.rest, ds.kind === 'closed' && st.closedTag]}>
                            <Icon name="check" size={13} color={ds.kind === 'part' ? C.fat : ds.kind === 'closed' ? C.muted : X.accent} stroke={2.6} />
                            <Text style={{ color: ds.kind === 'part' ? '#8A6A1F' : ds.kind === 'closed' ? C.muted : X.accent, fontSize: 12.5, fontWeight: '700' }}>
                              {ds.label}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Pressable accessibilityLabel={`Добавить: ${it.name}`} onPress={() => setPortionFor({ item: it, index: menu.items.indexOf(it) })} hitSlop={6}
                          style={({ pressed }) => [st.plus, n || closed ? { backgroundColor: X.soft } : null, pressed && { transform: [{ scale: 0.92 }] }]}>
                          <Icon name="plus" size={24} color={n || closed ? X.accent : C.white} stroke={2.4} />
                        </Pressable>
                        {n > 0 || closed ? (
                          <Pressable accessibilityLabel={closed ? `Снова открыть: ${it.name}` : `Закрыть блюдо: ${it.name}`} hitSlop={6}
                            onPress={() => {
                              const name = it.name; const was = closed;
                              store.setDishClosed(menu.id, name, !was);
                              toast({ text: was ? `«${name}» снова в меню` : `«${name}» закрыто`, action: 'Отменить', onAction: () => store.setDishClosed(menu.id, name, was) });
                            }}
                            style={({ pressed }) => [st.quick, closed && st.quickOn, pressed && { opacity: 0.6 }]}>
                            <Icon name={closed ? 'repeat' : 'check'} size={13} color={closed ? C.muted : X.accent} stroke={2.4} />
                            <Text style={{ fontSize: 11.5, fontWeight: '700', color: closed ? C.muted : X.accent }}>{closed ? 'Открыть' : 'Закрыть'}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {(() => {
              const rest = restItems(menu, eaten);
              return rest.length ? (
                <Btn label={rest.length === menu.items.length && !menu.closed?.length ? `Съел всё меню · ${fmt(rest.reduce((a, b) => a + kcalOf(b), 0))} ккал` : `Отметить остальное (${rest.length}) · ${fmt(rest.reduce((a, b) => a + kcalOf(b), 0))} ккал`}
                  kind="soft" icon="check" onPress={() => onAddAll(rest, menu)} style={{ marginTop: 18 }} />
              ) : (
                <Text style={[T.body, { textAlign: 'center', marginTop: 18, color: X.accent, fontWeight: '600' }]}>Всё меню отмечено ✓</Text>
              );
            })()}
            <Text style={[T.small, { textAlign: 'center', marginTop: 12 }]}>«+» — целая порция · нажмите на блюдо — порция или граммы</Text>
          </View>
        </ScrollView>
      )}

      {portionFor && menu ? (
        <Sheet visible onClose={() => setPortionFor(null)} title={portionFor.item.name}
          footer={
            <View style={{ gap: 8, paddingBottom: 4 }}>
              <Btn label={`${lastEntry ? 'Добавить ещё' : refined ? 'Добавить в дневник уточнённое' : 'Добавить в дневник'} · ${kcalText(refined || portionFor.item, amount)}`} onPress={() => { add(asEaten(portionFor.item, refined), amount); setPortionFor(null); }}
                style={{ paddingVertical: 16 }} disabled={amount <= 0} />
              {lastEntry ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ActBtn label="Обновить в дневнике" icon="check" onPress={() => { onUpdateEntry(lastEntry.id, asEaten(portionFor.item, refined), amount); setPortionFor(null); }} style={{ minHeight: 50 }} />
                  <ActBtn label="Удалить с дневника" icon="trash" danger onPress={() => { onRemoveEntry(lastEntry); setPortionFor(null); }} style={{ minHeight: 50 }} />
                </View>
              ) : null}
              <ActBtn label={isClosed(menu, portionFor.item.name) ? 'Снять закрытие блюда' : 'Закрыть блюдо'} icon="check" style={{ flex: 0, minHeight: 50 }}
                onPress={() => {
                  const name = portionFor.item.name; const was = isClosed(menu, name);
                  store.setDishClosed(menu.id, name, !was);
                  setPortionFor(null);
                  toast({ text: was ? `«${name}» снова в меню` : `«${name}» закрыто — в дневник не попадёт`, action: 'Отменить', onAction: () => store.setDishClosed(menu.id, name, was) });
                }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <ActBtn label="Заменить" icon="repeat" onPress={() => { setReplace({ index: portionFor.index }); setPortionFor(null); }} />
                <ActBtn label="Изменить" icon="edit" onPress={() => { setEditIndex(portionFor.index); setEdit(menu); setPortionFor(null); }} />
                <ActBtn label="" icon={store.isFavorite(portionFor.item) ? 'starFill' : 'star'} on={store.isFavorite(portionFor.item)} style={{ flex: 0, width: 46, paddingHorizontal: 0 }}
                  onPress={() => { store.isFavorite(portionFor.item) ? store.toggleFavorite(portionFor.item) : store.savePreset(portionFor.item); }} />
                <ActBtn label="" icon="trash" danger style={{ flex: 0, width: 46, paddingHorizontal: 0 }}
                  onPress={() => {
                    const it = portionFor.item; const idx = portionFor.index;
                    Alert.alert('Убрать блюдо из меню?', `«${it.name}» исчезнет из меню. Записи в дневнике останутся.`, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Убрать', style: 'destructive', onPress: () => { store.saveMenu({ ...menu, items: menu.items.filter((_, j) => j !== idx) }); setPortionFor(null); } },
                    ]);
                  }} />
              </View>
            </View>
          }>
          <RefineHistory r={refineP} />
          {(() => { const ds = dishState(eaten[portionFor.item.name] || 0, isClosed(menu, portionFor.item.name)); return ds.kind !== 'none' ? <Text style={[T.small, { marginBottom: 6, color: X.accent, fontWeight: '700' }]}>{ds.label}</Text> : null; })()}
          <Text style={[T.small, { marginBottom: 12 }]}>
            Полная порция: {kcalText(portionFor.item)}{portionFor.item.grams ? ` · ${r0(portionFor.item.grams)} г` : ''} · {macroText(portionFor.item)}
          </Text>
          <AmountPicker big value={amount} onChange={setAmount} gramsPerPortion={(refined || portionFor.item).grams} kcalPerPortion={(refined || portionFor.item).kcal}
            onGramsKnown={(g) => { const it = { ...portionFor.item, grams: g }; store.replaceMenuItem(menu.id, portionFor.index, it); setPortionFor({ ...portionFor, item: it }); }} />
          <View style={{ marginTop: 12 }}><ExplainButton items={[refined || portionFor.item]} /></View>
          <RefineInput r={refineP} placeholder="Уточнить для ИИ: «съел только мясо», «без гарнира»…" />
        </Sheet>
      ) : null}

      {iconFor ? <IconPicker item={iconFor} onClose={() => setIconFor(null)} /> : null}
      {replace && menu ? (
        <DishPicker visible title="Заменить на…" date={date} onClose={() => setReplace(null)}
          onManual={() => { setEditIndex(replace.index); setEdit(menu); setReplace(null); }}
          onPick={(item) => { store.replaceMenuItem(menu.id, replace.index, item); setReplace(null); play('preset'); }} />
      ) : null}

      {pickOld ? (
        <Sheet visible onClose={() => setPickOld(false)} title="Меню из прошлых дней">
          <PastMenus date={date} onTaken={(id) => { setSel(id); setPickOld(false); }} onAll={() => {}} showAll />
        </Sheet>
      ) : null}
      <MenuToolbar bottom={bottom} hidden={view !== 'menu'} menu={menu}
        onUpload={() => setCreate(true)} onManual={() => setEdit(blankMenu(date))} onPast={() => setPickOld(true)}
        onEdit={() => menu && setEdit(menu)}
        onDone={() => { if (!menu) return; const v = !menu.done; store.setMenuDone(menu.id, v); toast({ text: v ? 'Меню отмечено съеденным' : 'Меню снова в списке переноса', action: 'Отменить', onAction: () => store.setMenuDone(menu.id, !v) }); }}
        onDetach={() => { if (!menu) return; store.detachMenu(menu.id, date); toast({ text: 'Меню убрано из этого дня', action: 'Вернуть', onAction: () => store.attachMenu(menu.id, date) }); }} />
      <MenuCreateSheet visible={create} date={date} onClose={() => setCreate(false)} onParsed={(m) => { setCreate(false); setEdit(m); }}
        onMany={(list) => { setCreate(false); list.forEach((m) => store.saveMenu(m)); setSel(list[0]?.id); toast({ text: `Создано меню: ${list.length}` }); }}
        onManual={() => { setCreate(false); setEdit(blankMenu(date)); }} />
      {edit ? (
        <MenuEditSheet menu={edit} openIndex={editIndex} onClose={() => { setEdit(null); setEditIndex(null); }}
          onSave={(m) => { store.saveMenu(m); setSel(m.id); setEdit(null); setEditIndex(null); }}
          onDetach={edit.dates.length > 1 && edit.dates.includes(date) ? () => { store.detachMenu(edit.id, date); setEdit(null); } : undefined}
          onDelete={store.data.menus.some((x) => x.id === edit.id) ? () => {
            Alert.alert('Удалить меню?', `«${edit.title}» будет удалено. Записи в дневнике останутся.`, [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => { store.deleteMenu(edit.id); setEdit(null); } },
            ]);
          } : undefined} />
      ) : null}
    </View>
  );
}

/** Загрузка нового меню: фото/текст → ИИ. */
function MenuCreateSheet({ visible, date, onClose, onParsed, onMany, onManual }: { visible: boolean; date: string; onClose: () => void; onParsed: (m: Menu) => void; onMany: (m: Menu[]) => void; onManual: () => void }) {
  const { data } = useStore();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => { if (visible) { setText(''); setPhotos([]); } }, [visible]);

  const pick = async (src: 'camera' | 'gallery') => {
    const p = src === 'camera' ? await fromCamera() : await fromGallery(6 - photos.length);
    if (p.length) setPhotos((x) => [...x, ...p].slice(0, 6));
  };

  const run = async () => {
    const key = await getKey(data.ai.provider);
    const title = menuTitleFor(date);
    if (!key) {
      onParsed({ id: uid(), title, created: Date.now(), dates: [date], items: [] });
      Alert.alert('Нет ключа ИИ', 'Добавьте ключ в настройках — или заполните меню вручную.');
      return;
    }
    setBusy(true);
    const ac = new AbortController(); ctl.current = ac;
    try {
      // каждое фото — отдельное меню (несколько страниц/дней не склеиваются в одно)
      const jobs: (Picked | null)[] = photos.length ? photos : [null];
      const results = await Promise.allSettled(jobs.map((p) =>
        analyzeFood(data.ai, key, text || 'Распознай меню на фото.', p ? [{ base64: p.base64, mime: p.mime }] : [], { mode: 'menu', refDate: date, signal: ac.signal })));
      const made: Menu[] = [];
      let fail = '';
      results.forEach((r, i) => {
        if (r.status === 'rejected') { fail = (r.reason as any)?.message || String(r.reason); return; }
        if (!r.value.items.length) { fail = r.value.comment || 'Меню не распознано'; return; }
        const p = jobs[i];
        // дата / день недели с фото → «Сб (01.01.2026)»; иначе — как раньше, по дню
        const aiTitle = menuTitleFromAI(r.value.title, date);
        made.push({
          id: uid(), title: aiTitle || (jobs.length > 1 ? `${menuTitleFor(date)} · ${i + 1}` : menuTitleFor(date)), created: Date.now() + i, dates: [date],
          items: r.value.items.map(({ portion, ...it }) => it),
        });
      });
      if (ac.signal.aborted) return;
      if (!made.length) { Alert.alert('Меню не распознано', fail || 'Попробуйте фото почётче или текстом.'); return; }
      play('ai');
      if (fail) Alert.alert('Часть меню не распознана', `Создано: ${made.length} из ${jobs.length}. ${fail}`);
      if (made.length === 1) onParsed(made[0]);
      else onMany(made);
    } catch (e: any) {
      if (!isCancelled(e)) Alert.alert('Не получилось', e?.message || String(e));
    } finally {
      ctl.current = null;
      setBusy(false);
    }
  };

  const can = (text.trim() || photos.length) && !busy;
  return (
    <Sheet visible={visible} onClose={onClose} title="Новое меню"
      footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ModelSelect height={44} />
        {busy ? <ActBtn label="Отменить запрос" icon="close" danger onPress={() => ctl.current?.abort()} style={{ flex: 1, minHeight: 54 }} />
          : <Btn label="Распознать" onPress={run} disabled={!can} style={{ paddingVertical: 16, flex: 1 }} />}
      </View>}>
      <ActBtn label="Собрать меню вручную" icon="edit" onPress={onManual} style={{ flex: 0, marginBottom: 16, minHeight: 54 }} />
      <Text style={[T.bodySoft, { marginBottom: 14 }]}>Или сфотографируйте меню / вставьте текст — ИИ разберёт сам. Несколько фото — несколько отдельных меню (по одному на фото).</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => pick('camera')} style={st.bigPick}>
          <Icon name="camera" size={28} color={X.accent} />
          <Text style={st.bigPickT}>Камера</Text>
        </Pressable>
        <Pressable onPress={() => pick('gallery')} style={st.bigPick}>
          <Icon name="image" size={28} color={X.accent} />
          <Text style={st.bigPickT}>Галерея</Text>
        </Pressable>
      </View>
      {photos.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
          {photos.map((p, i) => (
            <Pressable key={i} onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))}>
              <Image source={{ uri: p.uri }} style={{ width: 70, height: 70, borderRadius: 10 }} />
              <View style={st.x}><Icon name="close" size={11} color={C.white} stroke={2.4} /></View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <TextInput value={text} onChangeText={setText} multiline placeholder={'Например:\nЗавтрак — сырники со сметаной, кофе\nОбед — борщ, котлета с пюре…'}
        placeholderTextColor={C.muted} style={[T.body, st.textArea]} />
      {busy ? <ActivityIndicator color={X.accent} style={{ marginTop: 10 }} /> : null}
    </Sheet>
  );
}

const blankMenu = (date: string): Menu => ({ id: uid(), title: menuTitleFor(date), created: Date.now(), dates: [date], items: [] });

/** Стандартные разделы доставки — для быстрого добавления в конструкторе. */
const SECTIONS = ['Завтрак', 'Второй завтрак', 'Обед', 'Салат', 'Ужин', 'Второй ужин'];

/** Конструктор / редактор меню: разделы, нумерованные блюда, порядок, значения (необязательные). */
/** Компактная «шкала меню»: калории всего, сколько съедено, БЖУ — тёплые жёлтые тона, одна строка плюс полоска. */
function MenuSummary({ total, count, eatenKcal }: { total: ReturnType<typeof sum>; count: number; eatenKcal: number }) {
  const pct = total.kcal > 0 ? Math.min(1, eatenKcal / total.kcal) : 0;
  const mac = [{ l: 'Б', v: total.protein, u: total.unk.protein }, { l: 'Ж', v: total.fat, u: total.unk.fat }, { l: 'У', v: total.carbs, u: total.unk.carbs }];
  return (
    <LinearGradient colors={['#FBEFC6', '#F3E2A9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.sum} testID="menu-summary">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={[T.h1, { fontSize: 28, lineHeight: 32, color: '#5E4710' }]}>{fmt(total.kcal)}{total.unk.kcal ? '+' : ''}</Text>
            <Text style={{ fontSize: 13, color: '#8A6A24', fontWeight: '700' }}>ккал · {count} {plural(count, 'блюдо', 'блюда', 'блюд')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {mac.map((m) => (
            <View key={m.l} style={st.sumChip}>
              <Text style={{ fontSize: 11, color: '#8A6A24', fontWeight: '700' }}>{m.l}</Text>
              <Text style={{ fontSize: 14, color: '#4A3A0C', fontWeight: '800' }}>{r0(m.v)}{m.u ? '+' : ''}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={st.sumBar}><View style={[st.sumFill, { width: `${pct * 100}%` }]} /></View>
      <Text style={{ fontSize: 12.5, color: '#7A5F1A', fontWeight: '600', marginTop: 5 }}>
        {eatenKcal > 0 ? `съедено ${fmt(eatenKcal)} · осталось ${fmt(Math.max(0, total.kcal - eatenKcal))} ккал` : 'пока ничего не отмечено'}
      </Text>
    </LinearGradient>
  );
}

function MenuEditSheet({ menu, openIndex, onClose, onSave, onDelete, onDetach }: { menu: Menu; openIndex?: number | null; onClose: () => void; onSave: (m: Menu) => void; onDelete?: () => void; onDetach?: () => void }) {
  const isNew = !onDelete;
  const [m, setM] = useState<Menu>(menu);
  const [open, setOpen] = useState<number | null>(openIndex ?? null);
  const [picker, setPicker] = useState<string | null>(null); // раздел, в который добавляем из «Моих блюд» ('' — без раздела)
  const setItem = (i: number, patch: Partial<FoodItem>) => setM((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const refine = useRefine(open !== null && m.items[open] ? [m.items[open]] : [], (its) => { if (open !== null) setItem(open, { ...its[0], section: m.items[open]?.section }); });
  useEffect(() => { refine.reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Вставляет блюдо после последнего блюда того же раздела — чтобы разделы не разваливались. */
  const insert = (section: string | undefined, base?: FoodItem): number => {
    let at = m.items.length;
    if (section) for (let i = m.items.length - 1; i >= 0; i--) if ((m.items[i].section || '') === section) { at = i + 1; break; }
    const item: FoodItem = { ...(base || { name: '' }), section: section ?? base?.section ?? m.items[m.items.length - 1]?.section, portion: undefined };
    setM((x) => { const items = [...x.items]; items.splice(at, 0, item); return { ...x, items }; });
    return at;
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.items.length) return;
    setM((x) => { const items = [...x.items]; [items[i], items[j]] = [items[j], items[i]]; return { ...x, items }; });
    setOpen(j);
  };
  const remove = (i: number) => { setM((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) })); setOpen(null); };

  const total = sum(m.items.map((item) => ({ item, portion: 1 } as any)));
  const valid = m.items.filter((i) => i.name.trim());

  return (
    <Sheet visible onClose={onClose} title={isNew ? 'Новое меню' : 'Изменить меню'}
      footer={
        <View style={{ gap: 6 }}>
          <Btn label={valid.length ? `Сохранить меню · ${valid.length} блюд` : 'Добавьте хотя бы одно блюдо'} disabled={!valid.length}
            onPress={() => onSave({ ...m, title: m.title.trim() || menuTitleFor(m.dates[0] || ''), items: valid })} style={{ paddingVertical: 16 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {onDetach ? <ActBtn label="Убрать из дня" icon="close" onPress={onDetach} /> : null}
            {onDelete ? <ActBtn label="Удалить меню" icon="trash" danger onPress={onDelete} /> : null}
          </View>
        </View>
      }>
      <RefineHistory r={refine} />
      <Field label="Название меню" placeholder="Например: Понедельник, 2 ноября" value={m.title} onChangeText={(t) => setM((x) => ({ ...x, title: t }))} />

      {m.items.length ? (
        <Text style={[T.small, { marginTop: 12 }]}>
          {m.items.length} {plural(m.items.length, 'блюдо', 'блюда', 'блюд')} · {total.unk.kcal === m.items.length ? 'калории не указаны' : `${fmt(total.kcal)}${total.unk.kcal ? ' +?' : ''} ккал`}
        </Text>
      ) : null}

      {/* блюда, пронумерованные как в меню */}
      <View style={{ marginTop: 6 }}>
        {m.items.map((it, i) => {
          const expanded = open === i;
          const kn = known(it);
          return (
            <View key={i} style={st.editRow}>
              {it.section && it.section !== m.items[i - 1]?.section ? (
                <View style={[st.secHead, { marginTop: 6 }]}>
                  <View style={st.secLine} /><Text style={st.secTitle}>{it.section}</Text><View style={st.secLine} />
                </View>
              ) : null}
              <Pressable onPress={() => setOpen(expanded ? null : i)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
                <View style={[st.num, { marginTop: 0, alignSelf: 'center' }]}><Text style={st.numT}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[T.body, { fontWeight: '500' }]} numberOfLines={2}>{it.name || 'Новое блюдо'}</Text>
                  <Text style={T.small}>{kcalText(it)} · {macroText(it)}</Text>
                </View>
                <Icon name={expanded ? 'check' : 'edit'} size={20} color={expanded ? X.accent : C.muted} />
              </Pressable>

              {expanded ? (
                <View style={{ gap: 10, marginTop: 10 }}>
                  <Field placeholder="Название блюда" value={it.name} onChangeText={(t) => setItem(i, { name: t })} autoFocus={!it.name} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                    {SECTIONS.map((s) => <Chip key={s} label={s} on={it.section === s} onPress={() => setItem(i, { section: it.section === s ? undefined : s })} />)}
                  </ScrollView>
                  <Field placeholder="Свой раздел (необязательно)" value={SECTIONS.includes(it.section || '') ? '' : it.section || ''} onChangeText={(t) => setItem(i, { section: t })} />
                  <Text style={T.small}>На порцию. Пустое поле = «не указано» — оно не считается нулём и не попадёт в итоги.</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <NumField optional label="Ккал" value={it.kcal} onChange={(n) => setItem(i, { kcal: n })} style={{ flex: 1 }} />
                    <NumField optional label="Вес" suffix="г" value={it.grams} onChange={(n) => setItem(i, { grams: n || undefined })} style={{ flex: 1 }} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <NumField optional label="Белки" suffix="г" value={it.protein} onChange={(n) => setItem(i, { protein: n })} style={{ flex: 1 }} />
                    <NumField optional label="Жиры" suffix="г" value={it.fat} onChange={(n) => setItem(i, { fat: n })} style={{ flex: 1 }} />
                    <NumField optional label="Углев." suffix="г" value={it.carbs} onChange={(n) => setItem(i, { carbs: n })} style={{ flex: 1 }} />
                  </View>
                  <ExplainButton items={[it]} />
                  <RefineInput r={refine} placeholder="Попросить ИИ: «пересчитай на 250 г», «это без масла»…" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <ActBtn label="Выше" icon="left" onPress={() => move(i, -1)} style={{ opacity: i === 0 ? 0.4 : 1 }} />
                    <ActBtn label="Ниже" icon="right" onPress={() => move(i, 1)} style={{ opacity: i === m.items.length - 1 ? 0.4 : 1 }} />
                    <ActBtn label="Убрать" icon="trash" danger onPress={() => remove(i)} />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* быстрые кнопки разделов */}
      <Text style={[T.label, { marginTop: 18, marginBottom: 8 }]}>{m.items.length ? 'Добавить блюдо в раздел' : 'С чего начнём? Выберите раздел'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SECTIONS.map((s) => (
          <Pressable key={s} onPress={() => setOpen(insert(s))} style={({ pressed }) => [st.secBtn, pressed && { opacity: 0.7 }]}>
            <Icon name="plus" size={16} color={X.accent} stroke={2.2} />
            <Text style={{ color: X.accent, fontWeight: '600', fontSize: 14 }}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <ActBtn label="Из моих блюд" icon="star" onPress={() => setPicker(m.items[m.items.length - 1]?.section || '')} />
        <ActBtn label="Без раздела" icon="plus" onPress={() => setOpen(insert(m.items[m.items.length - 1]?.section))} />
      </View>

      {picker !== null ? (
        <DishPicker visible title="Добавить в меню" onClose={() => setPicker(null)}
          onPick={(item) => { insert(picker || undefined, item); setPicker(null); }} />
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: X.accent, paddingHorizontal: 16, height: 44, borderRadius: 22 },
  empty: { backgroundColor: C.surface, borderRadius: 16, padding: 24, marginTop: 20, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  paper: { backgroundColor: C.surface, marginHorizontal: 12, marginTop: 14, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  secLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.lineStrong },
  secTitle: { fontFamily: 'Lora_400Regular_Italic', fontSize: 15, color: X.accent, letterSpacing: 0.3 },
  pill: { flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, maxWidth: 260 },
  pillOn: { backgroundColor: X.accent, borderColor: X.accent },
  refined: { padding: 12, borderRadius: 12, backgroundColor: X.tint, borderWidth: 1, borderColor: X.accent, marginBottom: 12 },
  pillPlus: { width: 46, paddingHorizontal: 0, justifyContent: 'center', backgroundColor: X.tint, borderStyle: 'dashed', borderColor: X.accent },
  num: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: X.accent, alignItems: 'center', justifyContent: 'center', marginRight: 12, alignSelf: 'flex-start', marginTop: 2 },
  numT: { fontFamily: 'Lora_600SemiBold', fontSize: 16, color: X.accent },
  dish: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  dots: { flex: 1, minWidth: 12, marginHorizontal: 6, borderBottomWidth: 1, borderStyle: 'dotted', borderColor: C.lineStrong, marginBottom: 4 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 26, paddingHorizontal: 9, borderRadius: 13, backgroundColor: X.tint, borderWidth: StyleSheet.hairlineWidth, borderColor: X.accent },
  quickOn: { backgroundColor: C.paper, borderColor: C.lineStrong },
  sum: { marginTop: 12, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: '#E6CF8E' },
  sumChip: { alignItems: 'center', minWidth: 38, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.55)' },
  sumBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(138,106,36,0.18)', overflow: 'hidden', marginTop: 9 },
  sumFill: { height: 6, borderRadius: 3, backgroundColor: '#C99A1E' },
  plus: { width: 48, height: 48, borderRadius: 24, backgroundColor: X.accent, alignItems: 'center', justifyContent: 'center' },
  rest: { backgroundColor: '#F7EFD9' },
  closedTag: { backgroundColor: C.line },
  eaten: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, backgroundColor: X.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pBig: { width: '31%', flexGrow: 1, height: 76, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong },
  bigPick: { flex: 1, height: 84, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 6 },
  bigPickT: { color: X.accent, fontWeight: '600', fontSize: 14 },
  x: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  textArea: { marginTop: 14, minHeight: 110, maxHeight: 220, textAlignVertical: 'top', backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 10, padding: 12 },
  act: { flex: 1, height: 64, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actT: { color: X.accent, fontWeight: '600', fontSize: 13 },
  yBanner: { marginHorizontal: 12, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#F3EEDF' },
  oldCard: { backgroundColor: C.surface, borderRadius: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  old: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, minHeight: 60 },
  toolbar: {
    marginHorizontal: 12, backgroundColor: C.surface, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
    shadowColor: '#0F2A1C', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  mainBtn: { flex: 1, flexDirection: 'row', gap: 8, height: 52 },
  tool: { height: 54, paddingHorizontal: 4, borderRadius: 18, backgroundColor: X.tint, alignItems: 'center', justifyContent: 'center' },
  take: { backgroundColor: X.soft, paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center' },
  secBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: X.tint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  editRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});

/** Прошлые меню: последние три (без «съеденных») и «Показать все». Нажатие раскрывает состав, повторное — закрывает. */
function PastMenus({ date, limit, onTaken, onAll, showAll, only = 'fresh' }: { date: string; limit?: number; onTaken: (id: string) => void; onAll: () => void; showAll?: boolean; only?: 'fresh' | 'done' }) {
  const store = useStore();
  const [open, setOpen] = useState<string | null>(null);
  // съеденные меню в списки для переноса не попадают — они только во вкладке «Старые меню»
  const all = useMemo(() => [...store.data.menus].filter((m) => (only === 'done' ? !!m.done : !m.done && !m.dates.includes(date)))
    .sort((a, b) => (b.dates[b.dates.length - 1] || '').localeCompare(a.dates[a.dates.length - 1] || '') || b.created - a.created), [store.data.menus, date, only]);
  const list = showAll || only === 'done' ? all : all.slice(0, limit ?? 3);
  if (!all.length) return <Text style={[T.small, { textAlign: 'center', marginTop: 20 }]}>{only === 'done' ? 'Съеденных меню пока нет.' : 'Прошлых меню пока нет.'}</Text>;
  return (
    <View style={{ marginTop: showAll || only === 'done' ? 0 : 22 }}>
      {!showAll && only !== 'done' ? <Text style={[T.label, { marginLeft: 4, marginBottom: 8 }]}>Взять из прошлых</Text> : null}
      {list.map((m) => {
        const isOpen = open === m.id;
        const kcal = m.items.reduce((a, b) => a + kcalOf(b), 0);
        const last = m.dates[m.dates.length - 1];
        return (
          <View key={m.id} style={st.oldCard}>
            <Pressable onPress={() => setOpen(isOpen ? null : m.id)} style={st.old}>
              <View style={{ flex: 1 }}>
                <Text style={T.h3} numberOfLines={1}>{m.title}</Text>
                <Text style={T.small} numberOfLines={1}>{last ? humanDate(last) : ''} · {m.items.length} блюд · {fmt(kcal)} ккал{m.done ? ' · съедено' : ''}</Text>
              </View>
              <Icon name={isOpen ? 'down' : 'right'} size={18} color={C.muted} />
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                {m.items.map((it, i) => (
                  <View key={i}>
                    {it.section && it.section !== m.items[i - 1]?.section ? (
                      <View style={[st.secHead, { marginTop: 10 }]}><View style={st.secLine} /><Text style={st.secTitle}>{it.section}</Text><View style={st.secLine} /></View>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 5 }}>
                      <Text style={[st.numT, { width: 26, fontSize: 14 }]}>{i + 1}</Text>
                      <Text style={[T.h3, { flex: 1 }]}>{it.name}</Text>
                      <Text style={[T.body, T.num, { marginLeft: 8, fontWeight: '700' }, !known(it).kcal && { color: C.muted }]}>{known(it).kcal ? fmt(it.kcal!) : '—'}</Text>
                    </View>
                  </View>
                ))}
                <Btn label="Взять на этот день" icon="plus" onPress={() => { store.attachMenu(m.id, date); onTaken(m.id); }} style={{ marginTop: 12, paddingVertical: 14 }} />
              </View>
            ) : null}
          </View>
        );
      })}
      {!showAll && all.length > list.length ? <ActBtn label={`Показать все (${all.length})`} icon="list" onPress={onAll} style={{ flex: 0, marginTop: 4 }} /> : null}
    </View>
  );
}

/** Плавающая панель меню: один ряд «Добавить / Изменить»; по тапу сверху раскрывается ряд опций. Тап по главной кнопке или по пустому месту сворачивает. */
function MenuToolbar({ bottom, hidden, menu, onUpload, onManual, onPast, onEdit, onDone, onDetach }: {
  bottom: number; hidden: boolean; menu?: Menu; onUpload: () => void; onManual: () => void; onPast: () => void;
  onEdit: () => void; onDone: () => void; onDetach: () => void;
}) {
  const [open, setOpen] = useState<null | 'add' | 'edit'>(null);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    if (open) Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, pop]);
  // меню исчезло или вкладка скрыта — опции сворачиваем
  useEffect(() => { if (hidden || (!menu && open === 'edit')) setOpen(null); }, [hidden, menu, open]);
  if (hidden) return null;
  const run = (fn: () => void) => () => { setOpen(null); fn(); };
  const Tool = ({ icon, label, on, flex = 1 }: { icon: any; label: string; on: () => void; flex?: number }) => (
    <Pressable onPress={on} accessibilityLabel={label} style={({ pressed }) => [st.tool, { flex }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={21} color={X.accent} />
      <Text style={{ fontSize: 11.5, fontWeight: '600', marginTop: 2, color: X.accent, textAlign: 'center' }} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
  const Main = ({ k, icon, label }: { k: 'add' | 'edit'; icon: any; label: string }) => {
    const on = open === k;
    return (
      <Pressable onPress={() => setOpen(on ? null : k)} accessibilityLabel={label}
        style={({ pressed }) => [st.tool, st.mainBtn, on && { backgroundColor: X.accent }, pressed && { opacity: 0.7 }]}>
        <Icon name={icon} size={21} color={on ? C.white : X.accent} stroke={on ? 2.2 : 1.7} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: on ? C.white : X.accent, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <>
      {open ? <Pressable accessibilityLabel="Свернуть" onPress={() => setOpen(null)} style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom }}>
        <View style={[st.toolbar, { padding: 6, gap: 6 }]}>
          {open ? (
            <Animated.View style={{ flexDirection: 'row', gap: 6, opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
              {open === 'add' ? (
                <>
                  <Tool icon="camera" label="Загрузить" on={run(onUpload)} />
                  <Tool icon="pen" label="Вручную" on={run(onManual)} />
                  <Tool icon="calendar" label="Из прошлых" on={run(onPast)} />
                </>
              ) : menu ? (
                <>
                  <Tool icon="close" label="Убрать из дня" on={run(onDetach)} />
                  <Tool icon="edit" label="Изменить меню" on={run(onEdit)} />
                  <Tool icon="check" label={menu.done ? 'Вернуть в список' : 'Съедено полностью'} on={run(onDone)} />
                </>
              ) : null}
            </Animated.View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Main k="add" icon="plus" label="Добавить меню" />
            {menu ? <Main k="edit" icon="edit" label="Изменить меню" /> : null}
          </View>
        </View>
      </View>
    </>
  );
}
