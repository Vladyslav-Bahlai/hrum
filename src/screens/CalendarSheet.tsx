import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, Text, View } from 'react-native';
import { C, T } from '../theme';
import { ActBtn, IconBtn, Sheet } from '../ui/kit';
import { useStore } from '../store';
import { fmt, MONTHS, pad, sum, todayKey } from '../utils';

/** Месяц с отметками: зелёная точка — в норме, красная — перебор. Свайп — смена месяца. */
export function CalendarSheet({ visible, onClose, value, onPick }: { visible: boolean; onClose: () => void; value: string; onPick: (k: string) => void }) {
  const { data } = useStore();
  const [y0, m0] = value.split('-').map(Number);
  const [ym, setYm] = useState({ y: y0, m: m0 - 1 });
  const shift = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const shiftRef = useRef(shift); shiftRef.current = shift;

  // плавная смена месяца: сетка уезжает, меняется и возвращается с другой стороны
  const x = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const swipeTo = (dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    Animated.timing(x, { toValue: -dir * 70, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      shiftRef.current(dir);
      x.setValue(dir * 70);
      Animated.timing(x, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => { busy.current = false; });
    });
  };
  const swipeRef = useRef(swipeTo); swipeRef.current = swipeTo;
  const settle = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 0 }).start();

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !busy.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderMove: (_, g) => x.setValue((g.dx - Math.sign(g.dx) * 10) * 0.5),
    onPanResponderRelease: (_, g) => { if (g.dx < -50 || g.vx < -0.6) swipeRef.current(1); else if (g.dx > 50 || g.vx > 0.6) swipeRef.current(-1); else settle(); },
    onPanResponderTerminate: settle,
  })).current;

  const byDay = useMemo(() => {
    const map: Record<string, { kcal: number; unk: number }> = {};
    const prefix = `${ym.y}-${pad(ym.m + 1)}`;
    const groups: Record<string, any[]> = {};
    for (const e of data.entries) if (e.date.startsWith(prefix)) (groups[e.date] ||= []).push(e);
    for (const k in groups) { const t = sum(groups[k]); map[k] = { kcal: t.kcal, unk: t.unk.kcal }; }
    return map;
  }, [data.entries, ym]);

  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7; // понедельник — первый
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const t = todayKey();
  const target = data.targets.kcal;
  const logged = Object.keys(byDay).length;
  const avg = logged ? Object.values(byDay).reduce((a, b) => a + b.kcal, 0) / logged : 0;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View {...pan.panHandlers}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <IconBtn name="left" onPress={() => swipeTo(-1)} size={24} />
          <Text style={[T.h2, { flex: 1, textAlign: 'center' }]}>{MONTHS[ym.m]} {ym.y}</Text>
          <IconBtn name="right" onPress={() => swipeTo(1)} size={24} />
        </View>
        <Animated.View style={{ transform: [{ translateX: x }], opacity: x.interpolate({ inputRange: [-70, 0, 70], outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' }) }}>
        <View style={{ flexDirection: 'row' }}>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
            <Text key={d} style={[T.small, { flex: 1, textAlign: 'center', marginBottom: 6 }]}>{d}</Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 52 }} />;
            const k = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
            const info = byDay[k];
            const kcal = info?.kcal || 0;
            const sel = k === value;
            const isToday = k === t;
            const over = kcal > target * 1.05 && !info?.unk;
            return (
              <Pressable key={i} onPress={() => { onPick(k); onClose(); }} style={{ width: `${100 / 7}%`, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: sel ? C.accent : 'transparent', borderWidth: isToday && !sel ? 1 : 0, borderColor: C.accent }}>
                  <Text style={[T.body, { color: sel ? C.white : k > t ? C.muted : C.ink, fontWeight: sel || isToday ? '700' : '400' }]}>{d}</Text>
                </View>
                <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 1, backgroundColor: !info ? 'transparent' : info.unk ? 'transparent' : over ? C.over : C.accent, borderWidth: info?.unk ? 1 : 0, borderColor: C.muted, borderStyle: 'dashed' }} />
              </Pressable>
            );
          })}
        </View>
        </Animated.View>
        <Text style={[T.small, { textAlign: 'center', marginTop: 10 }]}>
          {logged ? `Записано дней: ${logged} · в среднем ${fmt(avg)} ккал` : 'В этом месяце пока нет записей'}
        </Text>
        <ActBtn label="Сегодня" icon="calendar" onPress={() => { onPick(t); onClose(); }} style={{ flex: 0, marginTop: 12 }} />
      </View>
    </Sheet>
  );
}
