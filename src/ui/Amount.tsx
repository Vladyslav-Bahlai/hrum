import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './RNText';
import { C, T } from '../theme';
import { fmt, r0 } from '../utils';
import { Seg } from './kit';
import { PortionWheel } from './PortionWheel';

/**
 * Выбор количества: порциями (¼…2) или граммами — переключается одним тапом.
 * value — доля полной порции. gramsPerPortion — вес полной порции (если известен).
 */
export function AmountPicker({ value, onChange, gramsPerPortion, kcalPerPortion, onGramsKnown, big }: {
  value: number;
  onChange: (portion: number) => void;
  gramsPerPortion?: number;
  kcalPerPortion?: number;
  /** если вес порции неизвестен — можно задать его здесь */
  onGramsKnown?: (g: number) => void;
  big?: boolean;
}) {
  const [mode, setMode] = useState<'portion' | 'grams'>('portion');
  const g0 = gramsPerPortion || 0;
  const [gText, setGText] = useState(g0 ? String(r0(g0 * value)) : '');

  useEffect(() => {
    if (mode === 'grams' && g0) {
      const cur = parseFloat(gText.replace(',', '.')) || 0;
      if (Math.abs(cur - g0 * value) > 0.6) setGText(String(r0(g0 * value)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, g0, mode]);

  const setGrams = (g: number) => {
    const v = Math.max(0, Math.round(g));
    setGText(String(v));
    if (g0) onChange(v / g0);
  };

  const h = big ? 60 : 48;

  return (
    <View>
      <Seg items={[{ key: 'portion', label: 'Порция' }, { key: 'grams', label: g0 ? `Граммы · ${r0(g0)} г = 1` : 'Граммы' }]}
        value={mode} onChange={(m) => { setMode(m); if (m === 'grams' && g0) setGText(String(r0(g0 * value))); }} />
      {mode === 'portion' ? (
        <View style={{ marginTop: 12 }}>
          <PortionWheel value={value} onChange={onChange} kcalPerPortion={kcalPerPortion} gramsPerPortion={g0 || undefined} />
        </View>
      ) : g0 ? (
        <View style={{ marginTop: 10 }}>
          <View style={st.gRow}>
            <Pressable onPress={() => setGrams((parseFloat(gText) || 0) - 10)} style={[st.step, { height: h }]}><Text style={st.stepT}>−10</Text></Pressable>
            <View style={[st.gInput, { height: h }]}>
              <TextInput value={gText} keyboardType="number-pad" selectTextOnFocus={Platform.OS === 'ios'}
                onChangeText={(t) => { setGText(t); const n = parseFloat(t.replace(',', '.')); if (isFinite(n)) onChange(n / g0); }}
                style={[T.h2, { textAlign: 'center', minWidth: 60, fontVariant: ['tabular-nums'] }]} />
              <Text style={[T.bodySoft, { marginLeft: 4 }]}>г</Text>
            </View>
            <Pressable onPress={() => setGrams((parseFloat(gText) || 0) + 10)} style={[st.step, { height: h }]}><Text style={st.stepT}>+10</Text></Pressable>
          </View>
          <View style={[st.grid, { marginTop: 8 }]}>
            {[50, 100, 150, 200, 250, 300].map((g) => {
              const on = Math.abs(g - g0 * value) < 0.6;
              return (
                <Pressable key={g} onPress={() => setGrams(g)} style={[st.cell, { height: 44 }, on && st.on]}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: on ? C.white : C.inkSoft }}>{g}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[T.small, { textAlign: 'center', marginTop: 8 }]}>{kcalPerPortion === undefined ? 'калорийность не указана' : `${fmt(kcalPerPortion * value)} ккал`}</Text>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Text style={[T.small, { marginBottom: 8 }]}>Вес полной порции неизвестен — укажите его, и можно будет считать в граммах:</Text>
          <View style={st.grid}>
            {[100, 150, 200, 250, 300, 400].map((g) => (
              <Pressable key={g} onPress={() => onGramsKnown?.(g)} style={[st.cell, { height: 44 }]}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.inkSoft }}>{g} г</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  cell: { flexBasis: '30%', flexGrow: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong },
  on: { backgroundColor: C.accent, borderColor: C.accent },
  gRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  step: { width: 72, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontSize: 17, fontWeight: '700', color: C.accent },
  gInput: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.lineStrong },
});
