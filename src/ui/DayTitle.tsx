import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './RNText';
import { Icon } from './Icon';
import { C, T, TabKey, TABS } from '../theme';
import { humanDate, todayKey } from '../utils';

/** Заголовок дня: сегодняшний день в мягкой «рамке» цвета вкладки, остальные — без неё. */
export function DayTitle({ date, onPress, tab = 'day', caption }: { date: string; onPress: () => void; tab?: TabKey; caption?: string }) {
  const tone = TABS[tab];
  const today = date === todayKey();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }} hitSlop={6} accessibilityLabel="Выбрать день">
      {caption ? <Text style={T.small}>{caption}</Text> : null}
      <View style={[s.pill, today && { borderColor: tone.accent, backgroundColor: tone.soft }]}>
        {today ? <View style={[s.dot, { backgroundColor: tone.accent }]} /> : null}
        <Text style={[T.h2, today && { color: tone.accent }]} numberOfLines={1}>{humanDate(date)}</Text>
        <Icon name="calendar" size={17} color={today ? tone.accent : C.muted} />
      </View>
      {!today ? <Text style={[T.small, { color: tone.accent, marginTop: 1 }]}>вернуться к сегодня — «{tab === 'menu' ? 'Меню' : 'Дневник'}»</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 18, borderWidth: 1.5, borderColor: 'transparent' },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
