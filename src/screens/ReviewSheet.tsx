import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, TextInput } from '../ui/RNText';
import { C, T } from '../theme';
import { ActBtn, Btn, Hair, NumField, Seg, Sheet } from '../ui/kit';
import { AmountPicker } from '../ui/Amount';
import { Icon } from '../ui/Icon';
import { FoodItem, MealType } from '../types';
import { fmt, formatTimeInput, known, macroText, getMeals, mealAtMinutes, minutesLabel, parseTime, r0, shiftMinutes } from '../utils';
import { DishPicker } from './Dishes';
import { useStore } from '../store';
import { mergeItems } from '../logic';
import { DishAssist, ExplainButton } from './DishAssist';
import { noOutline } from '../theme';

export interface Draft {
  item: FoodItem; portion: number; on: boolean;
  /** своё время (минут от полуночи) и приём пищи — у отдельных записей из одного текста («утром… в обед…») */
  minutes?: number; meal?: MealType;
  /** после слияния: из каких блюд собрано (для «Разделить») */
  parts?: Draft[];
}

const blank = (): FoodItem => ({ name: '' });

/** Проверка результата ИИ / ручной ввод / редактирование записи. */
export function ReviewSheet({ visible, onClose, initial, meal: meal0, minutes: minutes0, comment, photo, mode, onSave, onDelete, isFav, onFav, date }: {
  /** день записи — для разбивки списка «Заменить на…» (меню этого дня / другие меню) */
  date?: string;
  visible: boolean;
  onClose: () => void;
  initial: Draft[];
  meal: MealType;
  /** время приёма пищи, минут от полуночи */
  minutes: number;
  comment?: string;
  photo?: string;
  mode: 'ai' | 'manual' | 'edit';
  onSave: (drafts: Draft[], meal: MealType, minutes: number) => void;
  onDelete?: () => void;
  isFav?: (i: FoodItem) => boolean;
  onFav?: (i: FoodItem) => void;
}) {
  const { data } = useStore();
  const autoMeal = data.autoMeal !== false;
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [meal, setMeal] = useState<MealType>(meal0);
  const [timeText, setTimeText] = useState(minutesLabel(minutes0));
  // категорию пересчитываем по времени, только пока пользователь не выбрал её сам
  const [mealPicked, setMealPicked] = useState(false);
  const minutes = parseTime(timeText);
  const changeTime = (text: string) => {
    setTimeText(text);
    const m = parseTime(text);
    if (m !== null && !mealPicked && autoMeal) setMeal(mealAtMinutes(m));
  };
  const [open, setOpen] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setDrafts(initial.length ? initial : [{ item: blank(), portion: 1, on: true }]);
      setMeal(meal0);
      setTimeText(minutesLabel(minutes0));
      setMealPicked(false);
      setOpen(mode === 'manual' ? 0 : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const set = (i: number, patch: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setItem = (i: number, patch: Partial<FoodItem>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, item: { ...x.item, ...patch } } : x)));

  // ---- слияние перетаскиванием: долгое нажатие на блюдо, тащим на другое, отпускаем — одно блюдо ----
  const [undo, setUndo] = useState<{ before: Draft[]; label: string } | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const rects = useRef<Record<number, { y: number; h: number }>>({});
  const cardRefs = useRef<Record<number, any>>({});
  const dragY = useRef(new Animated.Value(0)).current;
  const merge = (from: number, into: number) => {
    if (from === into) return;
    const before = drafts;
    const a = drafts[into], b = drafts[from];
    const parts = [...(a.parts || [a]), ...(b.parts || [b])];
    const item = mergeItems(parts.map((p) => ({ item: p.item, portion: p.portion })));
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setDrafts(drafts.map((d, j) => (j === into ? { item, portion: 1, on: true, minutes: a.minutes, meal: a.meal, parts } : d)).filter((_, j) => j !== from));
    setUndo({ before, label: `Объединено: ${a.item.name} + ${b.item.name}` });
    setOpen(null);
  };
  const split = (i: number) => {
    const d = drafts[i];
    if (!d.parts) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setDrafts([...drafts.slice(0, i), ...d.parts, ...drafts.slice(i + 1)]);
    setUndo(null);
  };
  const measureAll = () => {
    for (const [k, r] of Object.entries(cardRefs.current)) r?.measureInWindow?.((_x: number, y: number, _w: number, h: number) => { rects.current[+k] = { y, h }; });
  };
  const overAt = (absY: number, from: number) => {
    for (const [k, r] of Object.entries(rects.current)) if (+k !== from && absY >= r.y && absY <= r.y + r.h) return +k;
    return null;
  };
  const canMerge = mode !== 'edit' && drafts.length > 1;
  const dragGesture = (i: number) => Gesture.Pan()
    .runOnJS(true)
    .enabled(canMerge)
    .activateAfterLongPress(320)
    .onStart(() => { measureAll(); dragY.setValue(0); setDrag({ from: i, over: null }); })
    .onUpdate((e) => { dragY.setValue(e.translationY); const o = overAt(e.absoluteY, i); setDrag((d) => (d && d.over !== o ? { ...d, over: o } : d)); })
    .onEnd((e) => { const o = overAt(e.absoluteY, i); if (o !== null) merge(i, o); })
    .onFinalize(() => { setDrag(null); Animated.spring(dragY, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 0 }).start(); });

  const chosen = drafts.filter((d) => d.on && d.item.name.trim());
  const total = chosen.reduce((a, d) => a + (known(d.item).kcal ? d.item.kcal! * d.portion : 0), 0);
  const unkCount = chosen.filter((d) => !known(d.item).kcal).length;
  const many = drafts.length > 1;

  const title = mode === 'edit' ? 'Запись' : mode === 'manual' ? 'Добавить вручную' : many ? `Найдено: ${drafts.length}` : 'Проверьте';

  return (
    <Sheet visible={visible} onClose={onClose} title={title} scrollEnabled={!drag}
      footer={
        <View style={{ gap: 10 }}>
          <Btn label={chosen.length ? `${mode === 'edit' ? 'Обновить в дневнике' : 'Добавить в дневник'} · ${fmt(total)} ккал${unkCount ? ' +?' : ''}` : 'Ничего не выбрано'}
            disabled={!chosen.length || minutes === null} onPress={() => onSave(chosen, meal, minutes ?? minutes0)} style={{ paddingVertical: 16 }} />
          {onDelete ? <ActBtn label="Удалить запись" icon="trash" danger onPress={onDelete} style={{ flex: 0 }} /> : null}
        </View>
      }>
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 150, borderRadius: 12, marginBottom: 12 }} /> : null}
      {comment ? <Text style={[T.bodySoft, { marginBottom: 12, fontStyle: 'italic' }]}>{comment}</Text> : null}

      <Seg items={getMeals().map((m) => ({ key: m.key, label: m.label }))} value={meal} onChange={(k) => { setMeal(k); setMealPicked(true); }} style={{ marginBottom: 12 }} />

      <View style={st.timeRow}>
        <Text style={[T.body, { flex: 1 }]}>Время</Text>
        <Pressable accessibilityLabel="Раньше на 15 минут" onPress={() => changeTime(minutesLabel(shiftMinutes(minutes ?? minutes0, -15)))} style={st.timeBtn} hitSlop={4}>
          <Text style={st.timeBtnT}>−</Text>
        </Pressable>
        <TextInput
          value={timeText}
          onChangeText={(t) => changeTime(formatTimeInput(t))}
          keyboardType="number-pad"
          placeholder="ЧЧ:ММ"
          placeholderTextColor={C.muted}
          maxLength={5}
          selectTextOnFocus
          style={[T.h3, st.timeInput, minutes === null && { borderColor: C.over, color: C.over }]}
        />
        <Pressable accessibilityLabel="Позже на 15 минут" onPress={() => changeTime(minutesLabel(shiftMinutes(minutes ?? minutes0, 15)))} style={st.timeBtn} hitSlop={4}>
          <Text style={st.timeBtnT}>+</Text>
        </Pressable>
      </View>

      {many ? (
        <Text style={[T.small, { marginBottom: 6 }]}>Отметьте, что съели, и выберите порцию.{canMerge ? ' Чтобы объединить блюда в одно — удерживайте блюдо и перетащите на другое.' : ''}</Text>
      ) : null}
      {undo ? (
        <View style={st.undo}>
          <Text style={[T.body, { flex: 1, fontSize: 14 }]} numberOfLines={2}>{undo.label}</Text>
          <Pressable accessibilityLabel="Отменить объединение" onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity')); setDrafts(undo.before); setUndo(null); }} style={st.undoBtn}>
            <Text style={{ color: C.accent, fontWeight: '700' }}>Отменить</Text>
          </Pressable>
        </View>
      ) : null}

      {drafts.map((d, i) => {
        const kn = known(d.item);
        const expanded = open === i;
        const dragging = drag?.from === i;
        const target = drag && drag.over === i;
        return (
          <GestureDetector key={i} gesture={dragGesture(i)}>
          <Animated.View ref={(r: any) => { cardRefs.current[i] = r; }} collapsable={false} testID={`draft-${i}`}
            style={[st.item, !d.on && { opacity: 0.5 }, target && st.itemTarget, dragging && st.itemDrag, dragging && { transform: [{ translateY: dragY }, { scale: 1.02 }] }]}>
            {target ? <Text style={[T.small, { color: C.accent, fontWeight: '700', marginBottom: 6 }]}>Отпустите — объединить в одно блюдо</Text> : null}
            {d.minutes !== undefined || d.meal ? (
              <Text style={[T.small, { marginBottom: 6, color: C.accentDark, fontWeight: '600' }]}>
                {[d.meal ? getMeals().find((m) => m.key === d.meal)?.label : '', d.minutes !== undefined ? minutesLabel(d.minutes) : ''].filter(Boolean).join(' · ')} — отдельная запись
              </Text>
            ) : null}
            {onFav && d.item.name ? (
              <Pressable accessibilityLabel={isFav?.(d.item) ? 'Убрать из избранного' : 'Сохранить в избранное'} onPress={() => onFav(d.item)} hitSlop={6}
                style={({ pressed }) => [st.favTop, isFav?.(d.item) && st.favTopOn, pressed && { opacity: 0.75 }]}>
                <Icon name={isFav?.(d.item) ? 'starFill' : 'star'} size={26} color={isFav?.(d.item) ? C.fat : C.inkSoft} stroke={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: isFav?.(d.item) ? '#8A6A1F' : C.inkSoft }}>{isFav?.(d.item) ? 'В избранном' : 'В избранное'}</Text>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              {many ? (
                <Pressable onPress={() => set(i, { on: !d.on })} hitSlop={10} style={[st.check, d.on && st.checkOn]}>
                  {d.on ? <Icon name="check" size={16} color={C.white} stroke={2.6} /> : null}
                </Pressable>
              ) : null}
              <Pressable style={{ flex: 1 }} onPress={() => setOpen(expanded ? null : i)}>
                {expanded ? (
                  <TextInput value={d.item.name} onChangeText={(t) => setItem(i, { name: t })} placeholder="Название"
                    placeholderTextColor={C.muted} style={[T.h3, st.nameInput]} autoFocus={mode === 'manual'} />
                ) : (
                  <Text style={T.h3}>{d.item.name || 'Без названия'}</Text>
                )}
                <Text style={[T.small, { marginTop: 3 }]}>
                  {macroText(d.item, d.portion, true)}
                  {d.item.grams ? `  ·  ${r0(d.item.grams * d.portion)} г` : ''}
                </Text>
                {d.item.note && !expanded ? <Text style={[T.small, { marginTop: 2, color: C.inkSoft }]}>{d.item.note}</Text> : null}
              </Pressable>
              <InlineKcal value={kn.kcal ? d.item.kcal! * d.portion : undefined}
                onChange={(v) => setItem(i, { kcal: v === undefined ? undefined : d.portion > 0 ? Math.round(v / d.portion) : v })} />
            </View>

            <View style={{ marginTop: 12 }}>
              <AmountPicker value={d.portion} onChange={(v) => set(i, { portion: v, on: true })}
                gramsPerPortion={d.item.grams} kcalPerPortion={d.item.kcal} onGramsKnown={(g) => setItem(i, { grams: g })} />
            </View>

            {expanded ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                <Text style={T.small}>Значения на 1 полную порцию. Пустое поле = «не указано»: оно не считается нулём и не входит в итоги.</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <NumField optional label="Ккал" value={d.item.kcal} onChange={(n) => setItem(i, { kcal: n })} style={{ flex: 1 }} />
                  <NumField label="Вес" suffix="г" value={d.item.grams || 0} onChange={(n) => setItem(i, { grams: n })} style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <NumField optional label="Белки" suffix="г" value={d.item.protein} onChange={(n) => setItem(i, { protein: n })} style={{ flex: 1 }} />
                  <NumField optional label="Жиры" suffix="г" value={d.item.fat} onChange={(n) => setItem(i, { fat: n })} style={{ flex: 1 }} />
                  <NumField optional label="Углев." suffix="г" value={d.item.carbs} onChange={(n) => setItem(i, { carbs: n })} style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <NumField label="Клетчатка" suffix="г" value={d.item.fiber || 0} onChange={(n) => setItem(i, { fiber: n })} style={{ flex: 1 }} />
                  <NumField label="Сахар" suffix="г" value={d.item.sugar || 0} onChange={(n) => setItem(i, { sugar: n })} style={{ flex: 1 }} />
                  
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <ActBtn label={expanded ? 'Готово' : 'Изменить'} icon={expanded ? 'check' : 'edit'} onPress={() => setOpen(expanded ? null : i)} />
              <ActBtn label="Заменить" icon="repeat" onPress={() => setPicker(i)} />
            </View>
            {d.parts ? <ActBtn label="Разделить обратно" icon="repeat" onPress={() => split(i)} style={{ flex: 0, marginTop: 8 }} /> : null}
          </Animated.View>
          </GestureDetector>
        );
      })}

      <View style={{ gap: 8, marginTop: 4 }}>
        <ExplainButton items={drafts.map((d) => d.item)} />
      </View>
      <DishAssist items={drafts.map((d) => d.item)} onItems={(items) => setDrafts((cur) => {
        // ИИ вернул столько же блюд — меняем по порядку (доли и отметки сохраняем); другое число — новый список
        if (items.length === cur.length) return cur.map((d, j) => ({ ...d, item: { ...items[j] } }));
        return items.map((it) => ({ item: it, portion: 1, on: true }));
      })} />

      {mode !== 'edit' ? (
        <ActBtn label="Ещё блюдо" icon="plus" onPress={() => { setDrafts((d) => [...d, { item: blank(), portion: 1, on: true }]); setOpen(drafts.length); }} style={{ flex: 0, marginTop: 4 }} />
      ) : null}
      <Hair style={{ opacity: 0 }} />
      {picker !== null ? (
        <DishPicker visible title="Заменить на…" date={date} onClose={() => setPicker(null)}
          onPick={(item) => { set(picker, { item: { ...item }, on: true }); setPicker(null); }} />
      ) : null}
    </Sheet>
  );
}

/** Калории справа от названия: тап — то же число становится редактируемым (без рамки, на том же фоне). */
function InlineKcal({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const ref = useRef<any>(null);
  const start = () => { setTxt(value === undefined ? '' : String(Math.round(value))); setEdit(true); setTimeout(() => ref.current?.focus(), 30); };
  const commit = () => {
    setEdit(false);
    const n = parseFloat(txt.replace(',', '.'));
    onChange(txt.trim() === '' || !isFinite(n) ? undefined : Math.max(0, n));
  };
  return (
    <Pressable accessibilityLabel="Изменить калории" onPress={edit ? undefined : start} hitSlop={8} style={{ alignItems: 'flex-end', minWidth: 64, maxWidth: 110, flexShrink: 0 }}>
      {edit ? (
        <TextInput ref={ref} value={txt} onChangeText={(t) => setTxt(t.replace(/[^0-9.,]/g, ''))} onBlur={commit} onSubmitEditing={commit}
          keyboardType="number-pad" returnKeyType="done" selectTextOnFocus={Platform.OS === 'ios'} placeholder="—" placeholderTextColor={C.muted}
          style={[T.h2, T.num, st.inlineKcal, noOutline]} />
      ) : (
        <Text style={[T.h2, T.num, { fontFamily: T.h2.fontFamily }, value === undefined && { color: C.muted }]}>{value === undefined ? '—' : fmt(value)}</Text>
      )}
      <Text style={[T.small, edit && { color: C.accent }]}>{edit ? 'ккал · готово ↵' : value === undefined ? 'не указано' : 'ккал'}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  inlineKcal: { padding: 0, margin: 0, textAlign: 'right', width: 92, fontFamily: T.h2.fontFamily, borderWidth: 0, backgroundColor: 'transparent' },
  favTop: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end', height: 44, paddingHorizontal: 14, borderRadius: 22, marginBottom: 8, backgroundColor: C.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  favTopOn: { backgroundColor: '#F8EFD5', borderColor: '#E6CF8E' },
  itemTarget: { borderColor: C.accent, borderWidth: 2, backgroundColor: C.accentTint },
  itemDrag: { shadowColor: '#0F2A1C', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, zIndex: 10 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingLeft: 14, borderRadius: 12, backgroundColor: C.accentSoft, marginBottom: 10 },
  undoBtn: { height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  timeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  timeBtnT: { fontSize: 24, color: C.accent, marginTop: -2 },
  timeInput: { width: 92, height: 44, textAlign: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, paddingVertical: 0 },
  item: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  nameInput: { borderBottomWidth: 1, borderColor: C.accent, paddingVertical: 2 },
  portions: { flexDirection: 'row', gap: 6, marginTop: 12 },
  pBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  pOn: { backgroundColor: C.accent, borderColor: C.accent },
});
