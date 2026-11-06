import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from '../ui/RNText';
import { C, T } from '../theme';
import { Icon } from '../ui/Icon';
import { useStore } from '../store';
import { DEFAULT_MODELS } from '../ai';
import { modelChoices } from '../logic';
import { Provider } from '../types';

/** Чип текущей модели: ✦ имя ⌄ — тап раскрывает ModelPopup (клавиатура не закрывается). */
export function ModelPill({ onPress, open, style }: { onPress: () => void; open?: boolean; style?: ViewStyle }) {
  const { data } = useStore();
  const model = data.ai.provider === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  return (
    <Pressable accessibilityLabel="Модель ИИ" onPress={onPress} hitSlop={6} style={[s.pill, open && s.pillOn, style]}>
      <Icon name="sparkle" size={14} color={C.accent} />
      <Text style={{ color: C.inkSoft, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{model || DEFAULT_MODELS[data.ai.provider]}</Text>
      <Icon name={open ? 'up' : 'down'} size={12} color={C.muted} />
    </Pressable>
  );
}

/**
 * Небольшое плавающее окошко со списком моделей над кнопкой выбора. Не модальное: клавиатура остаётся открытой.
 * Показывает любимые модели (если выбраны), иначе все; прокручивается. Родитель кладёт его позицией absolute над кнопкой.
 */
export function ModelPopup({ onClose, style }: { onClose: () => void; style?: ViewStyle }) {
  const { data, update } = useStore();
  const [prov, setProv] = useState<Provider>(data.ai.provider);
  const cur = prov === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  const { list: choices } = modelChoices(data.ai, prov);
  const list = choices.length ? choices : [cur || DEFAULT_MODELS[prov]];
  const choose = (m: string) => {
    update((d) => ({ ...d, ai: { ...d.ai, provider: prov, [prov === 'claude' ? 'claudeModel' : 'geminiModel']: m } }));
    onClose();
  };
  return (
    <View style={[s.pop, style]} accessibilityLabel="Выбор модели">
      <View style={s.provRow}>
        {(['gemini', 'claude'] as Provider[]).map((p) => (
          <Pressable key={p} onPress={() => setProv(p)} style={[s.prov, prov === p && s.provOn]} hitSlop={4}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: prov === p ? C.white : C.inkSoft }}>{p === 'gemini' ? 'Gemini' : 'Claude'}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 190 }} keyboardShouldPersistTaps="always" nestedScrollEnabled showsVerticalScrollIndicator>
        {list.map((m) => {
          const on = m === cur && prov === data.ai.provider;
          return (
            <Pressable key={m} onPress={() => choose(m)} style={({ pressed }) => [s.row, on && { backgroundColor: C.accentSoft }, pressed && { opacity: 0.7 }]}>
              <Text style={[T.body, { fontSize: 13.5, flex: 1, fontWeight: on ? '700' : '500', color: on ? C.accentDark : C.ink }]} numberOfLines={1}>{m}</Text>
              {on ? <Icon name="check" size={16} color={C.accent} stroke={2.4} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 17, flexShrink: 1, alignSelf: 'flex-start', maxWidth: 220,
    backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
  },
  pillOn: { borderColor: C.accent, backgroundColor: C.accentTint },
  pop: {
    width: 250, backgroundColor: C.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, padding: 6, zIndex: 50,
    shadowColor: '#0F2A1C', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  provRow: { flexDirection: 'row', gap: 6, paddingBottom: 6, paddingHorizontal: 2 },
  prov: { paddingHorizontal: 12, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper },
  provOn: { backgroundColor: C.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: 9 },
});
