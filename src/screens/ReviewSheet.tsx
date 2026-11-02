import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, T } from '../theme';
import { ActBtn, Btn, Hair, NumField, Seg, Sheet } from '../ui/kit';
import { AmountPicker } from '../ui/Amount';
import { Icon } from '../ui/Icon';
import { FoodItem, MealType } from '../types';
import { fmt, formatTimeInput, known, macroText, getMeals, mealAtMinutes, minutesLabel, parseTime, r0, shiftMinutes } from '../utils';
import { DishPicker } from './Dishes';

export interface Draft { item: FoodItem; portion: number; on: boolean }

const blank = (): FoodItem => ({ name: '' });

/** Проверка результата ИИ / ручной ввод / редактирование записи. */
export function ReviewSheet({ visible, onClose, initial, meal: meal0, minutes: minutes0, comment, photo, mode, onSave, onDelete, isFav, onFav }: {
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
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [meal, setMeal] = useState<MealType>(meal0);
  const [timeText, setTimeText] = useState(minutesLabel(minutes0));
  // категорию пересчитываем по времени, только пока пользователь не выбрал её сам
  const [mealPicked, setMealPicked] = useState(false);
  const minutes = parseTime(timeText);
  const changeTime = (text: string) => {
    setTimeText(text);
    const m = parseTime(text);
    if (m !== null && !mealPicked) setMeal(mealAtMinutes(m));
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

  const chosen = drafts.filter((d) => d.on && d.item.name.trim());
  const total = chosen.reduce((a, d) => a + (known(d.item).kcal ? d.item.kcal! * d.portion : 0), 0);
  const unkCount = chosen.filter((d) => !known(d.item).kcal).length;
  const many = drafts.length > 1;

  const title = mode === 'edit' ? 'Запись' : mode === 'manual' ? 'Добавить вручную' : many ? `Найдено: ${drafts.length}` : 'Проверьте';

  return (
    <Sheet visible={visible} onClose={onClose} title={title}
      footer={
        <View style={{ gap: 10 }}>
          <Btn label={chosen.length ? `${mode === 'edit' ? 'Сохранить' : 'Добавить'} · ${fmt(total)} ккал${unkCount ? ' +?' : ''}` : 'Ничего не выбрано'}
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
        <Text style={[T.small, { marginBottom: 6 }]}>Отметьте, что съели, и выберите порцию</Text>
      ) : null}

      {drafts.map((d, i) => {
        const kn = known(d.item);
        const expanded = open === i;
        return (
          <View key={i} style={[st.item, !d.on && { opacity: 0.5 }]}>
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
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[T.h2, T.num, { fontFamily: T.h2.fontFamily }, !kn.kcal && { color: C.muted }]}>{kn.kcal ? fmt(d.item.kcal! * d.portion) : '—'}</Text>
                <Text style={T.small}>{kn.kcal ? 'ккал' : 'не указано'}</Text>
              </View>
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
              {onFav && d.item.name ? (
                <ActBtn label="" icon={isFav?.(d.item) ? 'starFill' : 'star'} on={isFav?.(d.item)} onPress={() => onFav(d.item)} style={{ flex: 0, flexGrow: 0, flexShrink: 0, width: 56, paddingHorizontal: 0 }} />
              ) : null}
            </View>
          </View>
        );
      })}

      {mode !== 'edit' ? (
        <ActBtn label="Ещё блюдо" icon="plus" onPress={() => { setDrafts((d) => [...d, { item: blank(), portion: 1, on: true }]); setOpen(drafts.length); }} style={{ flex: 0, marginTop: 4 }} />
      ) : null}
      <Hair style={{ opacity: 0 }} />
      {picker !== null ? (
        <DishPicker visible title="Заменить на…" onClose={() => setPicker(null)}
          onPick={(item) => { set(picker, { item: { ...item }, on: true }); setPicker(null); }} />
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
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
