import React from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, T } from '../theme';
import { Icon, IconName } from '../ui/Icon';
import { Sheet } from '../ui/kit';

/** Одна кнопка «+» слева в инпуте: открывает нижнюю панель с крупными плитками (камера, галерея, вручную…). */
export function PlusBtn({ onPress, on }: { onPress: () => void; on?: boolean }) {
  return (
    <Pressable accessibilityLabel="Добавить" onPress={() => { Keyboard.dismiss(); onPress(); }} hitSlop={4} style={[s.plus, on && { backgroundColor: C.accentSoft }]}>
      <Icon name="plus" size={26} color={C.accent} stroke={2.2} />
    </Pressable>
  );
}

export interface AttachTile { key: string; label: string; icon: IconName; onPress: () => void }

/** Нижний лист с плитками: выбор плитки закрывает лист и выполняет действие. */
export function AttachSheet({ visible, onClose, tiles }: { visible: boolean; onClose: () => void; tiles: AttachTile[] }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={s.grid}>
        {tiles.map((t) => (
          <Pressable key={t.key} accessibilityLabel={t.label} onPress={() => { onClose(); t.onPress(); }} style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}>
            <View style={s.ic}><Icon name={t.icon} size={28} color={C.accent} /></View>
            <Text style={[T.body, { fontWeight: '600', marginTop: 8 }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 6 },
  tile: { width: '48%', minHeight: 104, borderRadius: 16, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  ic: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
