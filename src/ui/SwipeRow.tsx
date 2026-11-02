import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { C } from '../theme';
import { Icon } from './Icon';

/** Только одна строка может держать открытые кнопки; любое другое действие их закрывает. */
let closeCurrent: (() => void) | null = null;
export const closeOpenRow = () => { closeCurrent?.(); };

const anim = () => LayoutAnimation.configureNext(LayoutAnimation.create(170, 'easeInEaseOut', 'opacity'));

/**
 * Строка записи. Долгое нажатие «замораживает» под строкой две крупные кнопки —
 * «Повторить» и «Удалить». Они остаются на месте, пока на них не нажмут;
 * любое другое касание, прокрутка или свайп по экрану их убирает.
 * Горизонтальные свайпы строке больше не принадлежат — они только листают дни.
 */
export function SwipeRow({ children, onLeft, onRight, rightLabel = 'Повторить' }: {
  children: React.ReactNode; onLeft: () => void; onRight?: () => void; rightLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const self = useRef<() => void>(() => {});
  const close = useCallback(() => { anim(); setOpen(false); if (closeCurrent === self.current) closeCurrent = null; }, []);
  self.current = close;
  const show = () => {
    if (closeCurrent && closeCurrent !== close) closeCurrent();
    anim();
    setOpen(true);
    closeCurrent = close;
  };
  useEffect(() => () => { if (closeCurrent === self.current) closeCurrent = null; }, []);

  return (
    <View style={open ? { backgroundColor: C.accentTint } : undefined}>
      <View onTouchStart={() => { if (closeCurrent && closeCurrent !== close) closeCurrent(); }}>
        <LongPress onLong={show} open={open} onClose={close}>{children}</LongPress>
      </View>
      {open ? (
        <View onTouchStart={(e) => e.stopPropagation()} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 2 }}>
          {onRight ? (
            <Pressable onPress={() => { setOpen(false); closeCurrent = null; onRight(); }} style={({ pressed }) => [btn, { backgroundColor: C.accentSoft }, pressed && { opacity: 0.7 }]}>
              <Icon name="repeat" color={C.accent} size={20} />
              <Text style={{ color: C.accent, fontWeight: '700', fontSize: 15 }}>{rightLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => { closeCurrent = null; onLeft(); }} style={({ pressed }) => [btn, { backgroundColor: C.overSoft }, pressed && { opacity: 0.7 }]}>
            <Icon name="trash" color={C.over} size={20} />
            <Text style={{ color: C.over, fontWeight: '700', fontSize: 15 }}>Удалить</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const btn = { flex: 1, height: 52, borderRadius: 14, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 };

/** Обёртка: долгое нажатие открывает кнопки, обычное нажатие по открытой строке закрывает её. */
function LongPress({ children, onLong, open, onClose }: { children: React.ReactNode; onLong: () => void; open: boolean; onClose: () => void }) {
  // дочерняя строка сама обрабатывает короткий тап; долгое нажатие ловим на уровне Pressable-потомка
  return React.Children.map(children, (c) =>
    React.isValidElement(c) ? React.cloneElement(c as any, { onLongPress: onLong, delayLongPress: 380, rowOpen: open, onCloseRow: onClose }) : c,
  ) as any;
}
