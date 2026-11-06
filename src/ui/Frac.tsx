import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './RNText';
import { C } from '../theme';
import { parseFrac } from '../logic';

/**
 * Дробь, нарисованная одним шрифтом: ⅓/⅔ и другие «юникодные» дроби в системном шрифте выглядят разного размера и веса.
 * Здесь числитель и знаменатель — обычные цифры, поэтому все дроби одинаковы.
 */
export function Frac({ label, size = 20, color = C.ink, weight = '700' }: { label: string; size?: number; color?: string; weight?: '400' | '600' | '700' }) {
  const f = parseFrac(label);
  const txt = { fontSize: size, lineHeight: Math.round(size * 1.15), color, fontWeight: weight } as const;
  if (!f) return <Text style={txt} maxFontSizeMultiplier={1}>{label}</Text>;
  const small = { fontSize: Math.round(size * 0.58), lineHeight: Math.round(size * 0.62), color, fontWeight: weight } as const;
  return (
    <View style={s.row}>
      {f.whole ? <Text style={[txt, { marginRight: 2 }]} maxFontSizeMultiplier={1}>{f.whole}</Text> : null}
      <View style={s.stack}>
        <Text style={small} maxFontSizeMultiplier={1}>{f.num}</Text>
        <View style={[s.bar, { backgroundColor: color, width: Math.round(size * 0.62) }]} />
        <Text style={small} maxFontSizeMultiplier={1}>{f.den}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stack: { alignItems: 'center' },
  bar: { height: 1.5, borderRadius: 1, marginVertical: 0.5 },
});
