import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Text } from './RNText';
import { C, T } from '../theme';
import { markAtOffset, markForValue, portionMarks } from '../logic';
import { fmt } from '../utils';

const BIG_GAP = 62; // 0…2: крупные метки с удобным расстоянием
const SMALL_GAP = 34; // 2½…10: шаг ½ плотнее

/**
 * «Руль» выбора доли порции 0…10: горизонтальная шкала, крутится пальцем влево/вправо и защёлкивается на метках.
 * До 2 — все удобные дроби (¼, ⅓, ½, ⅔, ¾, 1¼, 1½), дальше — каждые ½. Текущее значение — крупно над шкалой.
 * Шкала — ScrollView из gesture-handler: её прокрутка не листает день.
 */
export function PortionWheel({ value, onChange, kcalPerPortion, gramsPerPortion }: { value: number; onChange: (v: number) => void; kcalPerPortion?: number; gramsPerPortion?: number }) {
  const marks = useMemo(() => portionMarks(BIG_GAP, SMALL_GAP), []);
  const [w, setW] = useState(0);
  const ref = useRef<any>(null);
  const [live, setLive] = useState(markForValue(marks, value));
  const dragging = useRef(false);
  const lastEmit = useRef(value);

  // внешнее изменение (граммы, кнопки) — докручиваем шкалу
  useEffect(() => {
    const m = markForValue(marks, value);
    setLive(m);
    if (!dragging.current && w) ref.current?.scrollTo({ x: m.x, animated: Math.abs(lastEmit.current - value) > 0.001 });
    lastEmit.current = value;
  }, [value, w]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const m = markAtOffset(marks, e.nativeEvent.contentOffset.x);
    if (m.v !== live.v) setLive(m);
  };
  const settle = (x: number) => {
    const m = markAtOffset(marks, x);
    setLive(m);
    if (Math.abs(m.v - lastEmit.current) > 0.001) { lastEmit.current = m.v; onChange(m.v); }
    // на вебе snapToOffsets не работает — защёлкиваем сами
    if (Platform.OS === 'web' && Math.abs(m.x - x) > 1) ref.current?.scrollTo({ x: m.x, animated: true });
  };
  const end = useRef<any>(null);
  const total = marks[marks.length - 1].x;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <Text style={[T.big, { fontSize: 38, lineHeight: 44 }]} accessibilityLabel={`Доля порции ${live.label}`}>{live.label}</Text>
        <Text style={T.small}>
          {live.v === 0 ? 'ничего' : live.v === 1 ? 'целая порция' : 'порции'}
          {kcalPerPortion !== undefined ? ` · ${fmt(kcalPerPortion * live.v)} ккал` : ''}
          {gramsPerPortion ? ` · ${fmt(gramsPerPortion * live.v)} г` : ''}
        </Text>
      </View>
      <View style={st.track}>
        {w ? (
          <ScrollView
            ref={ref}
            testID="portion-wheel"
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToOffsets={marks.map((m) => m.x)}
            decelerationRate="fast"
            contentOffset={{ x: markForValue(marks, value).x, y: 0 }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={() => { dragging.current = true; }}
            onScrollEndDrag={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              clearTimeout(end.current);
              // если не будет инерции — закончим сами
              end.current = setTimeout(() => { dragging.current = false; settle(x); }, Platform.OS === 'web' ? 120 : 260);
            }}
            onMomentumScrollBegin={() => clearTimeout(end.current)}
            onMomentumScrollEnd={(e) => { dragging.current = false; settle(e.nativeEvent.contentOffset.x); }}
            contentContainerStyle={{ width: total + w, height: 76 }}>
            {marks.map((m) => (
              <View key={m.label} style={[st.mark, { left: w / 2 + m.x - 30 }]} pointerEvents="none">
                <View style={[st.tick, m.big ? st.tickBig : st.tickSmall, Number.isInteger(m.v) && st.tickWhole]} />
                <Text style={[m.big ? st.lblBig : st.lblSmall, Math.abs(m.v - live.v) < 0.001 && { color: C.accent }]} maxFontSizeMultiplier={1}>{m.label}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
        {/* центр-индикатор */}
        <View pointerEvents="none" style={[st.center, { left: w / 2 - 1.5 }]} />
      </View>
      <Text style={[T.small, { textAlign: 'center', marginTop: 4 }]}>← крутите шкалу →</Text>
    </View>
  );
}

const st = StyleSheet.create({
  track: { height: 76, borderRadius: 16, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, overflow: 'hidden' },
  mark: { position: 'absolute', top: 0, width: 60, height: 76, alignItems: 'center' },
  tick: { width: 2, backgroundColor: C.lineStrong, borderRadius: 1 },
  tickBig: { height: 22, marginTop: 8 },
  tickSmall: { height: 12, marginTop: 8 },
  tickWhole: { width: 3, height: 26, backgroundColor: C.inkSoft },
  lblBig: { fontSize: 20, fontWeight: '700', color: C.ink, marginTop: 6 },
  lblSmall: { fontSize: 13, fontWeight: '600', color: C.muted, marginTop: 8 },
  center: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: C.accent, borderRadius: 2 },
});
