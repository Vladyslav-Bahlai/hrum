import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from './RNText';
import { Frac } from './Frac';
import { C, T } from '../theme';
import { fracLabel, markAtOffset, portionMarks, stepPortion, valueForX, xForValue } from '../logic';
import { decimalOn, fmt } from '../utils';

const BIG_GAP = 62; // 0…2: крупные метки с удобным расстоянием
const SMALL_GAP = 34; // 2½…10: шаг ½ плотнее
const HEIGHT = 76;

/**
 * «Руль» выбора доли порции 0…10: горизонтальная шкала, крутится пальцем влево/вправо и защёлкивается на метках.
 * Жест — только горизонтальный (failOffsetY): вертикальное движение пальца уходит окну и листает его, а не шкалу,
 * поэтому шкала больше не «подпрыгивает» и не перехватывает обычную прокрутку. Кнопки − / + меняют долю мелким шагом
 * (в режиме дробей — 1/8, в десятичном — 0.1).
 */
export function PortionWheel({ value, onChange, kcalPerPortion, gramsPerPortion }: { value: number; onChange: (v: number) => void; kcalPerPortion?: number; gramsPerPortion?: number }) {
  const marks = useMemo(() => portionMarks(BIG_GAP, SMALL_GAP), []);
  const total = marks[marks.length - 1].x;
  const [w, setW] = useState(0);
  const pos = useRef(new Animated.Value(xForValue(marks, value))).current;
  const posNow = useRef(xForValue(marks, value));
  const start = useRef(0);
  const dragging = useRef(false);
  const [live, setLive] = useState(value);
  const lastEmit = useRef(value);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  useEffect(() => {
    const id = pos.addListener(({ value: x }) => { posNow.current = x; if (dragging.current || anim.current) setLive(valueForX(marks, x)); });
    return () => pos.removeListener(id);
  }, [pos, marks]);
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const moveTo = (x: number, emit: boolean, fast = false) => {
    anim.current?.stop();
    const a = Animated.timing(pos, { toValue: x, duration: fast ? 140 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.current = a;
    a.start(({ finished }) => {
      if (!finished) return;
      anim.current = null;
      const v = valueForX(marks, x);
      setLive(v);
      if (emit && Math.abs(v - lastEmit.current) > 0.001) { lastEmit.current = v; onChangeRef.current(v); }
    });
  };

  // внешнее изменение (граммы, кнопки, другая запись) — докручиваем шкалу
  useEffect(() => {
    if (dragging.current) return;
    if (Math.abs(value - lastEmit.current) > 0.001 || Math.abs(posNow.current - xForValue(marks, value)) > 1) {
      lastEmit.current = value;
      moveTo(xForValue(marks, value), false, true);
      setLive(value);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-10, 10])
    .onBegin(() => { anim.current?.stop(); anim.current = null; })
    .onStart(() => { dragging.current = true; start.current = posNow.current; })
    .onUpdate((e) => {
      let x = start.current - e.translationX;
      // за краями — сопротивление
      if (x < 0) x = x * 0.35; else if (x > total) x = total + (x - total) * 0.35;
      pos.setValue(x);
    })
    .onEnd((e) => {
      dragging.current = false;
      const projected = posNow.current - e.velocityX * 0.16;
      const m = markAtOffset(marks, Math.max(0, Math.min(total, projected)));
      moveTo(m.x, true);
    })
    .onFinalize((_e, ok) => { if (!ok) { dragging.current = false; } }),
  [marks, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (dir: 1 | -1) => {
    const cur = valueForX(marks, posNow.current);
    const v = Math.min(10, stepPortion(Math.abs(cur - lastEmit.current) < 0.001 ? lastEmit.current : cur, dir));
    lastEmit.current = v;
    moveTo(xForValue(marks, v), false, true);
    setLive(v);
    onChangeRef.current(v);
  };

  const label = fracLabel(live);
  const tx = Animated.multiply(pos, -1);
  const fine = decimalOn() ? '0.1' : '1/8';
  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <View style={{ height: 50, justifyContent: 'center' }} accessibilityLabel={`Доля порции ${label}`}>
          <Frac label={label} size={38} color={C.ink} weight="600" />
        </View>
        <Text style={T.small}>
          {live < 0.005 ? 'ничего' : Math.abs(live - 1) < 0.005 ? 'целая порция' : 'порции'}
          {kcalPerPortion !== undefined ? ` · ${fmt(kcalPerPortion * live)} ккал` : ''}
          {gramsPerPortion ? ` · ${fmt(gramsPerPortion * live)} г` : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityLabel={`Меньше на ${fine}`} onPress={() => step(-1)} style={({ pressed }) => [st.step, pressed && { opacity: 0.6 }]} hitSlop={4}>
          <Text style={st.stepT}>−</Text>
        </Pressable>
        <View style={[st.track, { flex: 1 }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {w ? (
            <GestureDetector gesture={pan}>
              <Animated.View testID="portion-wheel" collapsable={false} style={{ height: HEIGHT }}>
                <Animated.View style={{ width: total + w, height: HEIGHT, transform: [{ translateX: tx }] }}>
                  {marks.map((m) => (
                    <View key={m.label + m.v} style={[st.mark, { left: w / 2 + m.x - 30 }]} pointerEvents="none">
                      <View style={[st.tick, m.big ? st.tickBig : st.tickSmall, Number.isInteger(m.v) && st.tickWhole]} />
                      <View style={{ marginTop: m.big ? 8 : 6, height: 26, justifyContent: 'center' }}>
                        <Frac label={fracLabel(m.v)} size={m.big ? 19 : 14} weight={m.big ? '700' : '600'}
                          color={Math.abs(m.v - live) < 0.02 ? C.accent : m.big ? C.ink : C.muted} />
                      </View>
                    </View>
                  ))}
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          ) : null}
          <View pointerEvents="none" style={[st.center, { left: w / 2 - 1.5 }]} />
        </View>
        <Pressable accessibilityLabel={`Больше на ${fine}`} onPress={() => step(1)} style={({ pressed }) => [st.step, pressed && { opacity: 0.6 }]} hitSlop={4}>
          <Text style={st.stepT}>+</Text>
        </Pressable>
      </View>
      <Text style={[T.small, { textAlign: 'center', marginTop: 6 }]}>← крутите шкалу → · кнопки ± — шаг {fine}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: 16, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, overflow: 'hidden' },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontSize: 24, color: C.accent, marginTop: -2 },
  mark: { position: 'absolute', top: 0, width: 60, height: HEIGHT, alignItems: 'center' },
  tick: { width: 2, backgroundColor: C.lineStrong, borderRadius: 1 },
  tickBig: { height: 22, marginTop: 8 },
  tickSmall: { height: 12, marginTop: 8 },
  tickWhole: { width: 3, height: 26, backgroundColor: C.inkSoft },
  center: { position: 'absolute', top: 0, height: 36, width: 3, backgroundColor: C.accent, borderRadius: 2 },
});
