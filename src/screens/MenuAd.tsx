import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { C, T } from '../theme';
import { AdSlide, fmt, known } from '../utils';
import { AD_MS, deckStep, newDeck } from '../logic';

export { AD_MS };
const FADE_MS = 400;

function Row({ sl, multi }: { sl: AdSlide; multi: boolean }) {
  const it = sl.item;
  const k = known(it);
  return (
    <>
      <Text style={s.emoji}>{it.emoji || '🍽️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[T.body, { fontWeight: '700', color: C.accentDark }]} numberOfLines={1}>{it.name}</Text>
        <Text style={T.small} numberOfLines={1}>
          {k.kcal ? `${fmt(it.kcal!)} ккал` : 'ккал не указаны'}{multi ? ` · ${sl.menuTitle}` : it.section ? ` · ${it.section}` : ''}
        </Text>
      </View>
    </>
  );
}

/** Карусель блюд меню дня: «колода» — все блюда по разу в случайном порядке, потом заново; смена плавным кроссфейдом, блюдо висит ~3 с. */
export function MenuAd({ slides, multi }: { slides: AdSlide[]; multi: boolean }) {
  const deck = useRef({ order: newDeck(slides.length), pos: 0 });
  const [cur, setCur] = useState<AdSlide | undefined>(() => slides[deck.current.order[0]]);
  const [prev, setPrev] = useState<AdSlide | undefined>(undefined);
  const f = useRef(new Animated.Value(1)).current; // 0 — виден старый, 1 — новый

  const show = (next: AdSlide | undefined, from?: AdSlide) => {
    setPrev(from); setCur(next);
    if (!from) { f.setValue(1); return; }
    f.setValue(0);
    Animated.timing(f, { toValue: 1, duration: FADE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(({ finished }) => { if (finished) setPrev(undefined); });
  };
  const curRef = useRef(cur); curRef.current = cur;

  // состав изменился (день, меню, съели блюдо) — новая колода, без кроссфейда
  useEffect(() => {
    deck.current = { order: newDeck(slides.length), pos: 0 };
    show(slides[deck.current.order[0]]);
  }, [slides]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      deck.current = deckStep(deck.current);
      show(slides[deck.current.order[deck.current.pos]], curRef.current);
    }, AD_MS);
    return () => clearInterval(id);
  }, [slides]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) return null;
  const inY = f.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const outY = f.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  return (
    <View style={s.box}>
      {prev ? (
        <Animated.View style={[s.row, { opacity: f.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: outY }] }]}>
          <Row sl={prev} multi={multi} />
        </Animated.View>
      ) : null}
      <Animated.View style={[s.row, { opacity: f, transform: [{ translateY: inY }] }]}>
        <Row sl={cur} multi={multi} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: 46, marginTop: 8, overflow: 'hidden' },
  row: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 30, lineHeight: 36, width: 38, textAlign: 'center' },
});
