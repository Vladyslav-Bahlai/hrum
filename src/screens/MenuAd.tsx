import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { C, T } from '../theme';
import { AdSlide, fmt, known } from '../utils';
import { AD_MS, nextSlide } from '../logic';

export { AD_MS };

/** Карусель блюд меню дня: блюдо выскакивает, висит 3 секунды и резко сменяется следующим — как задорная реклама. */
export function MenuAd({ slides, multi }: { slides: AdSlide[]; multi: boolean }) {
  const [i, setI] = useState(0);
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => { setI(0); }, [slides]);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setI((c) => nextSlide(slides.length, c, multi)), AD_MS);
    return () => clearInterval(id);
  }, [slides, multi]);
  useEffect(() => {
    // вылет без плавного исчезновения: быстрое «пружинистое» появление нового блюда
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 190, useNativeDriver: true }).start();
  }, [i, slides, pop]);

  const sl = slides[Math.min(i, slides.length - 1)];
  if (!sl) return null;
  const it = sl.item;
  const k = known(it);
  return (
    <View style={s.box}>
      <Animated.View
        style={[s.row, {
          opacity: pop.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '0deg'] }) },
          ],
        }]}>
        <Text style={s.emoji}>{it.emoji || '🍽️'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[T.body, { fontWeight: '700', color: C.accentDark }]} numberOfLines={1}>{it.name}</Text>
          <Text style={T.small} numberOfLines={1}>
            {k.kcal ? `${fmt(it.kcal!)} ккал` : 'ккал не указаны'}{multi ? ` · ${sl.menuTitle}` : it.section ? ` · ${it.section}` : ''}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: 46, marginTop: 8, overflow: 'hidden', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 30, lineHeight: 36, width: 38, textAlign: 'center' },
});
