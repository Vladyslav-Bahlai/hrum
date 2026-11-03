import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { DEMO } from '../demo';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from '../ui/RNText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { play } from '../sound';
import { C, T } from '../theme';
import { Icon } from '../ui/Icon';
import { ActBtn, Bar, Btn, IconBtn, Sheet, Unk, useKeyboardHeight } from '../ui/kit';
import { closeOpenRow, SwipeRow } from '../ui/SwipeRow';
import { useToast } from '../ui/Toast';
import { useStore } from '../store';
import { analyzeFood } from '../ai';
import { getKey, persistPhoto } from '../storage';
import { Picked } from '../media';
import { Entry, FoodItem, MealType } from '../types';
import { mealAtMinutes, parseTime } from '../utils';
import { addDays, amountLabel, carouselSlides, fmt, humanDate, kcalText, known, macroText, mealByTime, mealFromSection, getMeals, menuLeftCount, minutesOf, OTHER_MEAL, plural, r0, scaled, sum, timestampAt, todayKey } from '../utils';
import { canGo, clampDay, entryTimestamp, favoriteBubbles } from '../logic';
import { MenuAd } from './MenuAd';
import { DishIcon } from '../ui/DishIcon';
import { IconPicker } from './IconPicker';
import { Composer } from './Composer';
import { ChatsScreen } from './ChatsScreen';
import { Draft, ReviewSheet } from './ReviewSheet';
import { CalendarSheet } from './CalendarSheet';
import { MenuScreen } from './MenuScreen';
import { FillScreen } from './FillScreen';
import { StatsScreen } from './StatsScreen';
import { SettingsScreen } from './SettingsScreen';
import { Menu } from '../types';

type Review =
  | { mode: 'ai' | 'manual'; drafts: Draft[]; comment?: string; photo?: string; source: Entry['source']; meal?: MealType }
  | { mode: 'edit'; entry: Entry };

export function DayScreen() {
  const store = useStore();
  const { data } = store;
  const ins = useSafeAreaInsets();
  const toast = useToast();
  const [date, setDate] = useState(todayKey());
  const [tab, setTab] = useState<'day' | 'menu' | 'fill' | 'stats' | 'chats' | 'settings'>('day');
  const [menuReq, setMenuReq] = useState<{ n: number; kind: 'attach' | 'upload' | 'manual' } | undefined>();
  const openSettings = () => setTab('settings');
  const [chooseOpen, setChooseOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [iconFor, setIconFor] = useState<FoodItem | null>(null);
  const [kb, setKb] = useState(false);
  const kbH = useKeyboardHeight(); // Android в edge-to-edge окно не ужимает: страницы с полями поднимаем сами
  // ---- свайп по дню: страница едет за пальцем, затем плавно сменяется ----
  const { width: W } = useWindowDimensions();
  const wRef = useRef(W); wRef.current = W;
  const slide = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);
  const today = todayKey();
  const dateRef = useRef(date); dateRef.current = date;
  const go = (n: number) => {
    if (animating.current) return;
    // в будущее не листаем: только мягкий «отскок»
    if (!canGo(dateRef.current, n, todayKey())) { settle(); return; }
    animating.current = true;
    const w = wRef.current;
    Animated.timing(slide, { toValue: -n * w, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setDate((d) => clampDay(addDays(d, n), todayKey()));
      slide.setValue(n * w);
      Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => { animating.current = false; });
    });
  };
  const goRef = useRef(go); goRef.current = go;
  const [composing, setComposing] = useState(false); // панель ввода раскрыта
  const onComposerOpen = useRef((o: boolean) => { setComposing(o); }).current;
  const [chatOpen, setChatOpen] = useState(false); // полноэкранный чат открыт — день не листается
  const onChatOpen = useRef((o: boolean) => { setChatOpen(o); }).current;
  const settle = () => Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 0 }).start();
  const settleRef = useRef(settle); settleRef.current = settle;
  // Свайп по дню — жест react-native-gesture-handler. Горизонтальные списки внутри (таблетки меню, пузырьки, шкалы)
  // — ScrollView из gesture-handler: они активируются раньше (меньший порог) и отменяют свайп дня, в том числе на iPhone.
  const swipe = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .enabled(!chatOpen)
    .activeOffsetX([-25, 25])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      if (animating.current) return;
      const toFuture = e.translationX < 0 && !canGo(dateRef.current, 1, todayKey());
      // в будущее — сильное сопротивление (видно, что дальше нельзя)
      slide.setValue(toFuture ? e.translationX * 0.15 : e.translationX - Math.sign(e.translationX) * 10);
    })
    .onEnd((e) => {
      if (animating.current) return;
      const w = wRef.current;
      if (e.translationX < -w * 0.22 || e.velocityX < -600) goRef.current(1);
      else if (e.translationX > w * 0.22 || e.velocityX > 600) goRef.current(-1);
      else settleRef.current();
    })
    .onFinalize((_e, success) => { if (!success && !animating.current) settleRef.current(); }),
  [chatOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageStyle = {
    flex: 1,
    opacity: slide.interpolate({ inputRange: [-W, 0, W], outputRange: [0.2, 1, 0.2], extrapolate: 'clamp' as const }),
    transform: [{ translateX: slide }],
  };

  const entries = useMemo(() => data.entries.filter((e) => e.date === date).sort((a, b) => a.time - b.time), [data.entries, date]);
  const tot = sum(entries);
  // меню, привязанные к этому дню: сколько блюд ещё не отмечено
  const dayMenus = useMemo(() => data.menus.filter((m) => m.dates.includes(date)), [data.menus, date]);
  const menuLeft = useMemo(() => menuLeftCount(dayMenus, data.entries, date), [dayMenus, data.entries, date]);
  // «реклама» блюд меню на карточке; состав перетасовывается при смене дня, меню или остатка
  const slideKey = dayMenus.map((m) => m.id + ':' + m.items.length + ':' + (m.closed || []).join('|')).join(',') + '@' + date + '#' + menuLeft;
  const slides = useMemo(() => carouselSlides(dayMenus, data.entries, date), [slideKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseFromMenu = () => {
    if (dayMenus.length) setTab('menu');
    else setChooseOpen(true);
  };
  const askMenu = (kind: 'attach' | 'upload' | 'manual') => { setChooseOpen(false); setMenuReq({ n: Date.now(), kind }); setTab('menu'); };
  // сколько записей за неделю без калорий/БЖУ — число на вкладке «Дополнить»
  const gaps = useMemo(() => {
    const from = addDays(todayKey(), -6);
    return data.entries.filter((e) => e.date >= from && (() => { const k = known(e.item); return !(k.kcal && k.protein && k.fat && k.carbs); })()).length;
  }, [data.entries]);
  const tg = data.targets;
  const left = tg.kcal - tot.kcal;
  const water = data.water[date] || 0;

  // под вводом — только блюда со звездой
  const quick = useMemo(() => favoriteBubbles(data), [data.favorites]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeFor = () => {
    const now = new Date();
    if (date === todayKey()) return now.getTime();
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).getTime();
  };
  const defaultMeal = (): MealType => mealByTime();

  const submit = async (text: string, photos: Picked[]): Promise<boolean> => {
    const provider = data.ai.provider;
    const key = await getKey(provider);
    if (!key) {
      // без ИИ — сразу ручной ввод
      setReview({ mode: 'manual', source: 'manual', photo: photos[0]?.uri,
        drafts: [{ item: { name: text }, portion: 1, on: true }] });
      if (!data.onboarded || !text) toast({ text: 'Чтобы ИИ считал сам, добавьте ключ', action: 'Настроить', onAction: openSettings });
      return true;
    }
    setBusy(true);
    try {
      const res = await analyzeFood(data.ai, key, text, photos.map((p) => ({ base64: p.base64, mime: p.mime })), { mode: 'eat', menus: data.menus.filter((m) => m.dates.includes(date)), presets: data.favorites.map((f) => f.item) });
      if (!res.items.length) {
        Alert.alert('Еда не найдена', res.comment || 'Попробуйте описать блюдо подробнее.');
        return false;
      }
      play('ai');
      setReview({
        mode: 'ai', source: photos.length ? 'ai-photo' : 'ai-text', comment: res.comment, photo: photos[0]?.uri,
        drafts: res.items.map(({ portion, time, meal, ...item }: any) => {
          // отдельные записи из одного текста: своё время / часть дня, если ИИ их нашёл
          const minutes = typeof time === 'string' ? parseTime(time) ?? undefined : undefined;
          const mk = meal ? mealFromSection(meal) : undefined;
          return { item, portion: portion || 1, on: !res.isMenu || res.items.length <= 2, minutes, meal: mk || (minutes !== undefined ? mealAtMinutes(minutes) : undefined) };
        }),
        meal: mealForItems(res.items),
      });
      return true;
    } catch (e: any) {
      Alert.alert('Не получилось', e?.message || String(e), [
        { text: 'Ввести вручную', onPress: () => setReview({ mode: 'manual', source: 'manual', drafts: [{ item: { name: text }, portion: 1, on: true }] }) },
        { text: 'OK' },
      ]);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const menuIdFor = (name: string) => {
    const n = name.trim().toLowerCase();
    return data.menus.filter((m) => m.dates.includes(date)).find((m) => m.items.some((i) => i.name.trim().toLowerCase() === n))?.id;
  };

  // если блюда из меню дня — приём пищи берём из раздела меню
  const mealForItems = (items: FoodItem[]): MealType | undefined => {
    const meals = items.map((it) => {
      const n = it.name.trim().toLowerCase();
      for (const m of data.menus) if (m.dates.includes(date)) {
        const f = m.items.find((x) => x.name.trim().toLowerCase() === n);
        if (f) return mealFromSection(f.section);
      }
      return undefined;
    });
    return meals[0] && meals.every((x) => x === meals[0]) ? meals[0] : undefined;
  };

  const addFromMenu = (item: FoodItem, portion: number, menu: Menu) => {
    play('add');
    store.addEntries([{ date, time: timeFor(), meal: mealFromSection(item.section) || defaultMeal(), item, portion, source: 'menu', menuId: menu.id }]);
    toast({ text: `${item.name}${portion !== 1 ? ' · ' + amountLabel(portion, item.grams) : ''} — ${kcalText(item, portion)}`, action: 'Отменить', onAction: () => {
      store.update((d) => {
        const last = [...d.entries].reverse().find((e) => e.menuId === menu.id && e.item.name === item.name && e.date === date);
        return last ? { ...d, entries: d.entries.filter((e) => e !== last) } : d;
      });
    } });
  };

  const addAllFromMenu = (items: FoodItem[], menu: Menu) => {
    const base = timeFor();
    store.addEntries(items.map((item, i) => ({ date, time: base + i, meal: mealFromSection(item.section) || defaultMeal(), item, portion: 1, source: 'menu' as const, menuId: menu.id })));
    play('add');
    const ids = new Set(items.map((i) => i.name));
    toast({ text: `Добавлено блюд: ${items.length}`, action: 'Отменить', onAction: () => {
      store.update((d) => ({ ...d, entries: d.entries.filter((e) => !(e.date === date && e.menuId === menu.id && e.time >= base && e.time < base + items.length && ids.has(e.item.name))) }));
    } });
  };

  const quickAdd = (item: FoodItem) => {
    const meal = defaultMeal();
    play('add');
    store.addEntries([{ date, time: timeFor(), meal, item, portion: 1, source: 'repeat' }]);
    Keyboard.dismiss();
    toast({ text: `${item.name} — ${kcalText(item)}`, action: 'Отменить', onAction: () => {
      store.update((d) => {
        const last = [...d.entries].reverse().find((e) => e.item.name === item.name && e.date === date);
        return last ? { ...d, entries: d.entries.filter((e) => e !== last) } : d;
      });
    } });
  };

  const remove = (e: Entry) => {
    play('remove');
    store.removeEntry(e.id);
    toast({ text: `Удалено: ${e.item.name}`, action: 'Вернуть', onAction: () => store.restoreEntry(e) });
  };

  const repeat = (e: Entry) => {
    play('add');
    store.addEntries([{ date, time: timeFor(), meal: e.meal, item: e.item, portion: e.portion, source: 'repeat' }]);
    toast({ text: `Добавлено ещё: ${e.item.name}` });
  };

  const save = (drafts: Draft[], meal: MealType, minutes: number) => {
    if (!review) return;
    if (review.mode === 'edit') {
      const d = drafts[0];
      const e = review.entry;
      // время не менялось — оставляем точную метку (порядок записей внутри минуты не ломается)
      const time = entryTimestamp(e.time, e.date, minutes);
      store.updateEntry(e.id, { item: d.item, portion: d.portion, meal, time });
    } else {
      const photo = review.photo ? persistPhoto(review.photo) : undefined;
      const now = timeFor();
      const base = entryTimestamp(now, date, minutes);
      store.addEntries(drafts.map((d, i) => ({
        date,
        time: d.minutes !== undefined ? timestampAt(date, d.minutes) + i : base + i,
        meal: d.meal || (d.minutes !== undefined && data.autoMeal !== false ? mealAtMinutes(d.minutes) : meal),
        item: d.item, portion: d.portion, source: review.source, photo, menuId: menuIdFor(d.item.name),
      })));
      play('add');
    }
    setReview(null);
  };

  const navBottom = Math.max(ins.bottom, 10);
  const pct = tg.kcal ? tot.kcal / tg.kcal : 0;
  const isToday = date === todayKey();

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      {tab === 'fill' ? (
        <View style={{ flex: 1, paddingBottom: kbH }}><FillScreen topInset={ins.top} /></View>
      ) : tab === 'stats' || tab === 'settings' ? (
        <View style={{ flex: 1, paddingTop: ins.top + 14, paddingBottom: kbH ? kbH : navBottom + 70 }}>
          <Text style={[T.h1, { paddingHorizontal: 20, paddingBottom: 10 }]}>{tab === 'stats' ? 'Статистика' : 'Настройки'}</Text>
          {tab === 'stats' ? <StatsScreen onFill={() => setTab('fill')} /> : <SettingsScreen />}
        </View>
      ) : tab === 'chats' ? (
        <View style={{ flex: 1, paddingTop: ins.top + 14 }}>
          <ChatsScreen navSpace={navBottom + 70} />
        </View>
      ) : tab === 'menu' ? (
        <GestureDetector gesture={swipe}>
          <Animated.View collapsable={false} style={pageStyle}>
            <MenuScreen date={date} go={go} canNext={date < today} openCalendar={() => setCalOpen(true)} topInset={ins.top} bottom={kbH ? kbH : navBottom + 70} request={menuReq} onAdd={addFromMenu} onAddAll={addAllFromMenu} onAddDish={quickAdd} />
          </Animated.View>
        </GestureDetector>
      ) : (
      <>
      {/* шапка */}
      <View style={[st.top, { paddingTop: ins.top + 6 }]}>
        <IconBtn name="left" onPress={() => go(-1)} size={24} />
        <Pressable onPress={() => setCalOpen(true)} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }} hitSlop={6}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={T.h2} numberOfLines={1}>{humanDate(date)}</Text>
            <Icon name="calendar" size={17} color={C.muted} />
          </View>
          {!isToday ? <Text style={[T.small, { color: C.accent }]}>вернуться к сегодня — «Дневник»</Text> : null}
        </Pressable>
        <IconBtn name="right" label="Следующий день" onPress={() => go(1)} size={24} color={isToday ? C.line : C.inkSoft} style={isToday ? { opacity: 0.35 } : undefined} />
      </View>

      <GestureDetector gesture={swipe}>
      <Animated.View collapsable={false} style={pageStyle}>
        <ScrollView contentContainerStyle={{ paddingBottom: 210 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScrollBeginDrag={closeOpenRow} onTouchStart={closeOpenRow}>
          {/* итог дня */}
          <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={T.label}>{left >= 0 ? 'Осталось' : 'Сверх нормы'}</Text>
                <Text style={[T.big, { color: left >= 0 ? C.ink : C.over }]}>
                  {fmt(Math.abs(left))}<Text style={[T.h3, { color: C.muted }]}> ккал</Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
                <Text style={[T.body, T.num, { fontWeight: '600' }]}>{fmt(tot.kcal)}{tot.unk.kcal ? <Unk /> : null} <Text style={{ color: C.muted, fontWeight: '400' }}>/ {fmt(tg.kcal)}</Text></Text>
                <Text style={T.small}>съедено · {r0(pct * 100)}%</Text>
              </View>
            </View>
            <Bar value={tot.kcal} max={tg.kcal} height={6} style={{ marginTop: 10 }} />

            <View style={{ flexDirection: 'row', gap: 14, marginTop: 18 }}>
              <Macro label="Белки" v={tot.protein} t={tg.protein} color={C.protein} unk={tot.unk.protein} />
              <Macro label="Жиры" v={tot.fat} t={tg.fat} color={C.fat} unk={tot.unk.fat} />
              <Macro label="Углеводы" v={tot.carbs} t={tg.carbs} color={C.carbs} unk={tot.unk.carbs} />
            </View>
            {tot.unk.any ? (
              <View style={st.unkNote}>
                <View style={st.unkDot}><Text style={{ fontSize: 11, fontWeight: '700', color: C.muted }}>?</Text></View>
                <Text style={[T.small, { flex: 1 }]}>
                  {[tot.unk.kcal ? `${tot.unk.kcal} ${plural(tot.unk.kcal, 'запись', 'записи', 'записей')} без калорий` : '',
                    tot.unk.anyMacro ? `${tot.unk.anyMacro} без БЖУ` : ''].filter(Boolean).join(' · ')} — в итог не входят
                </Text>
              </View>
            ) : null}
          </View>

          {/* вода — одна строка, крупные кнопки */}
          <View style={st.water}>
            <Icon name="drop" color={C.water} size={22} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[T.body, { fontWeight: '600' }]}>Вода · {(water * 0.25).toFixed(water % 4 === 0 ? 0 : 2).replace('.', ',')} л</Text>
              <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
                {Array.from({ length: Math.max(tg.waterGlasses, water) }).map((_, i) => (
                  <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < water ? C.water : C.line }} />
                ))}
              </View>
            </View>
            <Pressable onPress={() => { if (water > 0) play('waterLess'); store.setWater(date, water - 1); }} style={st.wBtn} hitSlop={4}>
              <Text style={st.wTxt}>−</Text>
            </Pressable>
            <Pressable onPress={() => { play('water'); store.setWater(date, water + 1); }} style={[st.wBtn, { backgroundColor: '#E3EFF6' }]} hitSlop={4}>
              <Text style={[st.wTxt, { color: C.water }]}>+</Text>
            </Pressable>
          </View>

          {/* выбор блюда из меню дня (при раскрытой панели «+» карточка остаётся на месте) */}
          <View>
          <Pressable onPress={chooseFromMenu} style={({ pressed }) => [st.next, pressed && { opacity: 0.75 }]}>
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>Выбрать с меню</Text>
              {slides.length ? <MenuAd slides={slides} multi={dayMenus.length > 1} /> : null}
              <Text style={[T.small, { marginTop: slides.length ? 6 : 3 }]}>
                {dayMenus.length
                  ? `${dayMenus.length === 1 ? 'Меню на этот день' : `Меню на этот день: ${dayMenus.length}`} · осталось блюд: ${menuLeft}`
                  : 'Меню на этот день пока нет — добавить'}
              </Text>
            </View>
            <View style={st.nextPlus}><Icon name={dayMenus.length ? 'list' : 'plus'} size={26} color={C.white} stroke={2.2} /></View>
          </Pressable>
          </View>

          {/* приёмы пищи */}
          {entries.length === 0 ? (
            <View style={{ paddingHorizontal: 28, paddingTop: 36, alignItems: 'center' }}>
              <Text style={[T.h3, { color: C.inkSoft, textAlign: 'center' }]}>Пока пусто</Text>
              <Text style={[T.small, { textAlign: 'center', marginTop: 8, lineHeight: 19 }]}>
                Загрузите меню доставки во вкладке «Меню» — или напишите, что съели («йогурт 140 г»), или сфотографируйте тарелку.
              </Text>
              <Text style={[T.small, { textAlign: 'center', marginTop: 14 }]}>← свайп — другой день →</Text>
            </View>
          ) : (
            [...getMeals(), OTHER_MEAL].map((m) => {
              const list = entries.filter((e) => e.meal === m.key || (m.key === OTHER_MEAL.key && !getMeals().some((x) => x.key === e.meal)));
              if (!list.length) return null;
              const s = sum(list);
              return (
                <View key={m.key} style={{ marginTop: 22 }}>
                  <View style={st.mealHead}>
                    <Text style={[T.h3, { flex: 1 }]}>{m.label}</Text>
                    <Text style={[T.small, T.num]}>{fmt(s.kcal)} ккал{s.unk.kcal ? <Unk /> : null}</Text>
                  </View>
                  {list.map((e) => (
                    <SwipeRow key={e.id} onLeft={() => remove(e)} onRight={() => repeat(e)}>
                      <EntryRow e={e} onPress={() => setReview({ mode: 'edit', entry: e })} onIcon={() => setIconFor(e.item)} />
                    </SwipeRow>
                  ))}
                </View>
              );
            })
          )}
          {entries.length > 0 && entries.length < 4 ? (
            <Text style={[T.small, { textAlign: 'center', marginTop: 18 }]}>Удерживайте запись — появятся «Повторить» и «Удалить»</Text>
          ) : null}
        </ScrollView>
      </Animated.View>
      </GestureDetector>
      </>
      )}

      {tab === 'day' ? <Composer onOpen={onComposerOpen} onChatOpen={onChatOpen} onMenu={chooseFromMenu} busy={busy} onSubmit={submit} quick={quick} onQuick={quickAdd} bottomInset={kb ? 8 : navBottom + 72} chatTop={ins.top + 72}
        onManual={() => setReview({ mode: 'manual', source: 'manual', drafts: [{ item: { name: '' }, portion: 1, on: true }] })} /> : null}

      {DEMO ? <KbDebug /> : null}
      {/* плавающая навигация */}
      {!kb ? (
        <View style={[st.nav, { bottom: navBottom }]}>
          <NavBtn icon="book" label="Дневник" on={tab === 'day'} onPress={() => { if (tab === 'day') setDate(todayKey()); setTab('day'); }} />
          <NavBtn icon="list" label="Меню" on={tab === 'menu'} onPress={() => setTab('menu')} />
          <NavBtn icon="pen" label="Дополнить" on={tab === 'fill'} badge={gaps} onPress={() => setTab('fill')} />
          <NavBtn icon="chart" label="Статистика" on={tab === 'stats'} onPress={() => setTab('stats')} />
          <NavBtn icon="chat" label="Чаты" on={tab === 'chats'} onPress={() => setTab('chats')} />
          <NavBtn icon="gear" label="Настройки" on={tab === 'settings'} onPress={() => setTab('settings')} />
        </View>
      ) : null}

      {review ? (
        <ReviewSheet
          visible
          onClose={() => setReview(null)}
          mode={review.mode}
          initial={review.mode === 'edit' ? [{ item: review.entry.item, portion: review.entry.portion, on: true }] : review.drafts}
          meal={review.mode === 'edit' ? review.entry.meal : review.meal || defaultMeal()}
          minutes={review.mode === 'edit' ? minutesOf(review.entry.time) : minutesOf(timeFor())}
          comment={review.mode === 'edit' ? undefined : review.comment}
          photo={review.mode === 'edit' ? review.entry.photo : review.photo}
          onSave={save}
          onDelete={review.mode === 'edit' ? () => { const e = review.entry; setReview(null); remove(e); } : undefined}
          isFav={store.isFavorite}
          onFav={store.toggleFavorite}
        />
      ) : null}
      {chooseOpen ? (
        <Sheet visible onClose={() => setChooseOpen(false)} title="Меню на этот день">
          <Text style={[T.bodySoft, { marginBottom: 14 }]}>На {humanDate(date).toLowerCase()} меню ещё нет. Добавьте его — и сможете выбирать блюда одним тапом.</Text>
          <Btn label="Загрузить меню (фото или текст)" icon="camera" onPress={() => askMenu('upload')} style={{ paddingVertical: 16 }} />
          <ActBtn label="Взять из прошлых" icon="calendar" onPress={() => askMenu('attach')} style={{ flex: 0, marginTop: 10, minHeight: 54 }} />
          <ActBtn label="Собрать вручную" icon="pen" onPress={() => askMenu('manual')} style={{ flex: 0, marginTop: 10, minHeight: 54 }} />
        </Sheet>
      ) : null}
      {iconFor ? <IconPicker item={iconFor} onClose={() => setIconFor(null)} /> : null}
      {calOpen ? <CalendarSheet visible onClose={() => setCalOpen(false)} value={date} onPick={(k) => setDate(clampDay(k, todayKey()))} /> : null}
    </View>
  );
}

/** Только в CI-сборке: значения события клавиатуры — чтобы на скриншоте эмулятора было видно, откуда берётся отступ. */
function KbDebug() {
  const ins = useSafeAreaInsets();
  const { height: wh } = useWindowDimensions();
  const [v, setV] = useState('kb: —');
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e: any) =>
      setV(`kb h=${Math.round(e.endCoordinates?.height)} y=${Math.round(e.endCoordinates?.screenY)} win=${Math.round(wh)} scr=${Math.round(Dimensions.get('screen').height)} insB=${Math.round(ins.bottom)}`));
    return () => a.remove();
  }, [wh, ins.bottom]);
  return <Text pointerEvents="none" style={{ position: 'absolute', top: ins.top, left: 4, fontSize: 10, color: '#B5523F', backgroundColor: 'rgba(255,255,255,0.8)', zIndex: 99 }}>{v}</Text>;
}

function Macro({ label, v, t, color, unk }: { label: string; v: number; t: number; color: string; unk?: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={T.small}>{label}</Text>
      <Text style={[T.body, T.num, { fontWeight: '600', marginVertical: 3 }]}>
        {r0(v)}{unk ? <Unk /> : null}<Text style={{ color: C.muted, fontWeight: '400' }}> / {t} г</Text>
      </Text>
      <Bar value={v} max={t} color={color} height={4} />
    </View>
  );
}

function EntryRow({ e, onPress, onLongPress, delayLongPress, rowOpen, onCloseRow, onIcon }: { e: Entry; onPress: () => void; onLongPress?: () => void; delayLongPress?: number; rowOpen?: boolean; onCloseRow?: () => void; onIcon?: () => void }) {
  const n = scaled(e);
  const k = known(e.item);
  const d = new Date(e.time);
  return (
    <Pressable onPress={rowOpen ? onCloseRow : onPress} onLongPress={onLongPress} delayLongPress={delayLongPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.accentTint }]}>
      {e.photo ? <Image source={{ uri: e.photo }} style={st.ph} /> : <View style={{ marginRight: 12 }}><DishIcon name={e.item.name} emoji={e.item.emoji} en={e.item.en} where="diary" onLongPress={onIcon} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={[T.body, { fontWeight: '500' }]} numberOfLines={2}>{e.item.name}</Text>
        <Text style={[T.small, { marginTop: 2 }]}>
          {e.portion !== 1 ? `${amountLabel(e.portion, e.item.grams)} · ` : ''}{macroText(e.item, e.portion, true)}
          {'  ·  '}{`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`}
        </Text>
      </View>
      <Text style={[T.body, T.num, { fontWeight: '600', marginLeft: 10 }, !k.kcal && { color: C.muted }]}>{k.kcal ? fmt(n.kcal) : '—'}</Text>
    </Pressable>
  );
}

function NavBtn({ icon, label, on, onPress, badge }: { icon: any; label: string; on?: boolean; onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.navBtn, pressed && { opacity: 0.6 }]} hitSlop={4}>
      <View>
        <Icon name={icon} size={23} color={on ? C.accent : C.inkSoft} stroke={on ? 2 : 1.7} />
        {badge ? (
          <View style={st.badge}><Text style={{ fontSize: 10, fontWeight: '700', color: C.white }}>{badge > 99 ? '99+' : badge}</Text></View>
        ) : null}
      </View>
      <Text style={{ fontSize: 10, marginTop: 2, color: on ? C.accent : C.muted, fontWeight: on ? '700' : '500' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 6, backgroundColor: C.paper },
  water: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 20, padding: 12, paddingLeft: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, gap: 6 },
  wBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper },
  wTxt: { fontSize: 24, color: C.inkSoft, marginTop: -2 },
  mealHead: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, marginHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line, minHeight: 60 },
  ph: { width: 42, height: 42, borderRadius: 9, marginRight: 12, backgroundColor: C.line },
  nav: {
    position: 'absolute', left: 12, right: 12, height: 60, borderRadius: 30, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, shadowColor: '#0F2A1C', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  next: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: C.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, gap: 12 },
  nextPlus: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  unkNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.line },
  unkDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -12, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
