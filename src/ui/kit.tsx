import React from 'react';
import { Keyboard, TextInput as RNInput, useWindowDimensions } from 'react-native';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInputProps, View, ViewStyle,
} from 'react-native';
import { focusBus, Text, TextInput } from './RNText';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, noOutline, RADIUS, T, TabTone, TABS } from '../theme';
import { Icon, IconName } from './Icon';
import { LayerRoot } from './Layer';

/** Цвета текущей вкладки для общих кнопок/вкладок/чипов (по умолчанию — зелёный дневника). */
export const ToneCtx = React.createContext<TabTone>(TABS.day);
export const useTone = () => React.useContext(ToneCtx);

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[s.card, style as any]}>{children}</View>;
}

export function Hair({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: C.lineStrong }, style]} />;
}

/** Вкладки с подчёркиванием — как в списках на референсе. */
export function Tabs<K extends string>({ items, value, onChange, style }: {
  items: { key: K; label: string; n?: number | string }[]; value: K; onChange: (k: K) => void; style?: ViewStyle;
}) {
  const tone = useTone();
  return (
    <View style={[{ flexDirection: 'row', gap: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong }, style]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} hitSlop={6}
            style={{ paddingVertical: 9, borderBottomWidth: 2, borderColor: on ? tone.accent : 'transparent', marginBottom: -1 }}>
            <Text style={[T.body, { fontSize: 14, color: on ? C.ink : C.muted, fontWeight: on ? '600' : '400' }]}>
              {it.label}
              {it.n !== undefined ? <Text style={[T.small, { fontWeight: '400' }]}>  {it.n}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Компактный сегментированный переключатель. */
export function Seg<K extends string | number>({ items, value, onChange, style, big }: {
  items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; style?: ViewStyle; big?: boolean;
}) {
  return (
    <View style={[s.seg, style]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={String(it.key)} onPress={() => onChange(it.key)} style={[s.segItem, big && { paddingVertical: 12 }, on && s.segOn]}>
            <Text style={[T.body, { fontSize: big ? 15 : 13, color: on ? C.ink : C.muted, fontWeight: on ? '600' : '500' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, small }: { label: string; on?: boolean; onPress?: () => void; small?: boolean }) {
  const tone = useTone();
  return (
    <Pressable onPress={onPress} style={[s.chip, small && { paddingHorizontal: 10, paddingVertical: 4 }, on && s.chipOn, on && { backgroundColor: tone.accent, borderColor: tone.accent }]}>
      <Text style={[T.body, { fontSize: small ? 13 : 14, color: on ? C.white : C.inkSoft, fontWeight: on ? '600' : '500' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Btn({ label, onPress, kind = 'primary', icon, disabled, style }: {
  label: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'soft' | 'danger'; icon?: IconName; disabled?: boolean; style?: ViewStyle;
}) {
  const tone = useTone();
  const bg = kind === 'primary' ? tone.accent : kind === 'soft' ? tone.soft : 'transparent';
  const fg = kind === 'primary' ? C.white : kind === 'danger' ? C.over : tone.accent;
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'ghost' || kind === 'danger' ? { borderWidth: 1, borderColor: C.lineStrong } : null, style]}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[T.body, { color: fg, fontWeight: '600', fontSize: 15, flexShrink: 1, textAlign: 'center' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </Pressable>
  );
}

/** Крупная вторичная кнопка с иконкой (вместо текстовых ссылок). */
export function ActBtn({ label, icon, onPress, danger, on, style, textColor }: { label: string; icon?: IconName; onPress: () => void; danger?: boolean; on?: boolean; style?: ViewStyle | ViewStyle[]; textColor?: string }) {
  const tone = useTone();
  const fg = textColor || (danger ? C.over : tone.accent);
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label || undefined}
      style={({ pressed }) => [{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
        backgroundColor: danger ? C.overSoft : on ? tone.soft : tone.tint, borderWidth: StyleSheet.hairlineWidth, borderColor: danger ? '#E9C9C0' : C.lineStrong, opacity: pressed ? 0.7 : 1 }, style,
        // кнопка фиксированной ширины (звезда, корзина): на вебе flex:0 давал нулевую ширину
        (style as any)?.width !== undefined ? { flexBasis: 'auto' as any, flexShrink: 0 } : null]}>
      {icon ? <View style={{ width: 20, height: 20, flexShrink: 0 }}><Icon name={icon} size={20} color={fg} /></View> : null}
      {label ? <Text style={{ color: fg, fontWeight: '600', fontSize: 14.5, flexShrink: 1, minWidth: 0 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text> : null}
    </Pressable>
  );
}

export function LinkBtn({ label, onPress, color = C.inkSoft }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[T.link, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function IconBtn({ name, onPress, color = C.inkSoft, size = 20, style, label }: { name: IconName; onPress: () => void; color?: string; size?: number; style?: ViewStyle; label?: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [{ padding: 6, borderRadius: 8, opacity: pressed ? 0.5 : 1 }, style]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Field({ label, suffix, style, ...props }: TextInputProps & { label?: string; suffix?: string; style?: ViewStyle }) {
  return (
    <View style={style}>
      {label ? <Text style={[T.small, { marginBottom: 5 }]}>{label}</Text> : null}
      <View style={s.field}>
        <TextInput placeholderTextColor={C.muted} {...props} style={[T.body, { flex: 1, paddingVertical: 9, fontVariant: ['tabular-nums'] }, noOutline]} />
        {suffix ? <Text style={[T.small, { marginLeft: 6 }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

type NumFieldProps = { label?: string; suffix?: string; placeholder?: string; style?: ViewStyle } & (
  | { optional: true; value: number | undefined; onChange: (n: number | undefined) => void }
  | { optional?: false; value: number; onChange: (n: number) => void }
);

/**
 * Числовое поле. Пока поле в фокусе, текст принадлежит только самому полю —
 * родитель его не перезаписывает (раньше из-за этого терялась первая цифра).
 * optional: пустое поле = «не указано» (undefined), а не 0.
 */
export function NumField(props: NumFieldProps) {
  const { value, label, suffix, placeholder, style } = props;
  const show = (v: number | undefined) => (v === undefined || v === null || (!props.optional && !v) ? '' : String(Math.round(v * 10) / 10));
  const [txt, setTxt] = React.useState(show(value));
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (focused.current) return;
    setTxt(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (t: string) => {
    const clean = t.replace(',', '.');
    const n = parseFloat(clean);
    if (props.optional) props.onChange(clean.trim() === '' || !isFinite(n) ? undefined : n);
    else props.onChange(isFinite(n) ? n : 0);
  };
  return (
    <Field label={label} suffix={suffix} style={style} value={txt} keyboardType="decimal-pad"
      placeholder={placeholder ?? (props.optional ? '—' : '0')}
      // на Android selectTextOnFocus съедает первый введённый символ
      selectTextOnFocus={Platform.OS === 'ios'}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setTxt(show(value)); }}
      onChangeText={(t) => { setTxt(t); commit(t); }} />
  );
}

/** Высота экранной клавиатуры (на Android Modal её сам не учитывает). */
/**
 * Сколько снизу окна перекрывает клавиатура. На Android (edge-to-edge) React Native сообщает высоту
 * клавиатуры БЕЗ панели навигации, а окно не ужимается — поэтому добавляем нижний системный отступ
 * (иначе поле ввода торчит над клавиатурой только наполовину). Поправку можно переопределить для отладки.
 */
export const KB = { androidAddNav: true };
export const keyboardOverlap = (o: { os: string; height: number; screenY?: number; winH?: number; navInset: number; addNav?: boolean }) => {
  if (o.height <= 0) return 0;
  if (o.os !== 'android') return o.height;
  return o.height + ((o.addNav ?? KB.androidAddNav) ? o.navInset : 0);
};
export function useKeyboardHeight() {
  const [h, setH] = React.useState(0);
  const ins = useSafeAreaInsets();
  const navRef = React.useRef(ins.bottom); navRef.current = ins.bottom;
  React.useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (e: any) =>
      setH(keyboardOverlap({ os: Platform.OS, height: e.endCoordinates?.height || 0, screenY: e.endCoordinates?.screenY, navInset: navRef.current })));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

/** Окно даёт вложенным блокам возможность «подъехать» к видимой части: reveal(ref) прокручивает блок к верху окна. */
export const SheetCtx = React.createContext<{ reveal: (node: any, topGap?: number) => void } | null>(null);
export const useSheetReveal = () => React.useContext(SheetCtx)?.reveal;

/**
 * Нижнее окно: затемнение появляется на месте (плавно), а само окно выезжает снизу.
 * Клавиатура: если окно целиком помещается над ней — поднимается целиком (как раньше); если оно высокое,
 * то остаётся на месте (кнопки внизу не «подпрыгивают» вместе с клавиатурой), а над клавиатурой прокручивается
 * только само поле ввода.
 */
export function Sheet({ visible, onClose, title, children, footer, scrollEnabled = true }: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; scrollEnabled?: boolean;
}) {
  const ins = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { height: H } = useWindowDimensions();
  const full = H - ins.top - 24;
  const [contentH, setContentH] = React.useState(0);
  const [footH, setFootH] = React.useState(0);
  const scroll = React.useRef<any>(null);
  const scrollY = React.useRef(0);
  const kbRef = React.useRef(0); kbRef.current = kb;
  // окно поднимается целиком, только если и так помещается над клавиатурой
  const natural = contentH + footH + (title ? 56 : 0) + 56;
  const lift = kb > 0 && natural + kb <= full ? kb : 0;
  const stay = kb > 0 && !lift;
  const avail = full - lift;
  // Modal без своей анимации: фон плавно проявляется на месте, лист выезжает снизу (раньше на iPhone вместе с листом «въезжало» и затемнение)
  const [shown, setShown] = React.useState(visible);
  const a = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (visible) {
      setShown(true);
      a.setValue(0);
      Animated.timing(a, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (shown) {
      Animated.timing(a, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const close = () => (kb ? Keyboard.dismiss() : onClose());

  // поле в фокусе должно быть над клавиатурой
  const ensureVisible = React.useCallback(() => {
    const f: any = (RNInput as any).State?.currentlyFocusedInput?.();
    if (!f?.measureInWindow || !scroll.current) return;
    f.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const limit = H - kbRef.current - 14;
      if (kbRef.current > 0 && y + h > limit) scroll.current?.scrollTo?.({ y: scrollY.current + (y + h - limit), animated: true });
    });
  }, [H]);
  React.useEffect(() => { if (stay) { const t = setTimeout(ensureVisible, 90); return () => clearTimeout(t); } }, [stay, kb, ensureVisible]);
  React.useEffect(() => {
    const f = () => { if (kbRef.current > 0) setTimeout(ensureVisible, 90); };
    focusBus.add(f);
    return () => { focusBus.delete(f); };
  }, [ensureVisible]);

  const reveal = React.useCallback((node: any, topGap = 10) => {
    if (!node?.measureInWindow || !scroll.current?.measureInWindow) return;
    scroll.current.measureInWindow((_sx: number, sy: number) => {
      node.measureInWindow((_x: number, y: number) => {
        scroll.current?.scrollTo?.({ y: Math.max(0, scrollY.current + (y - sy) - topGap), animated: true });
      });
    });
  }, []);
  const ctx = React.useMemo(() => ({ reveal }), [reveal]);

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <LayerRoot>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,24,19,0.32)', opacity: a }]} />
      <View style={{ flex: 1, paddingBottom: lift }}>
        <Pressable accessibilityLabel="Закрыть" style={{ flex: 1 }} onPress={close} />
        <Animated.View style={[s.sheet, { paddingBottom: kb ? 10 : ins.bottom + 10, maxHeight: Math.max(240, avail),
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [Math.max(400, H * 0.6), 0] }) }] }]}>
          <View style={s.grab} />
          {title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 }}>
              <Text style={[T.h2, { flex: 1 }]} numberOfLines={2}>{title}</Text>
              <IconBtn name="close" label="Закрыть окно" onPress={onClose} />
            </View>
          ) : null}
          <SheetCtx.Provider value={ctx}>
            <ScrollView ref={scroll} scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}
              scrollEventThrottle={16} onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
              onContentSizeChange={(_w, h) => setContentH(h)}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: stay ? kb + 24 : 12 }}>
              {children}
            </ScrollView>
          </SheetCtx.Provider>
          {footer ? <View onLayout={(e) => setFootH(e.nativeEvent.layout.height)} style={{ paddingHorizontal: 20, paddingTop: 8 }}>{footer}</View> : null}
        </Animated.View>
      </View>
      </LayerRoot>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function Bar({ value, max, color, height = 4, style }: { value: number; max: number; color?: string; height?: number; style?: ViewStyle }) {
  const tone = useTone();
  const col = color || tone.accent;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max * 1.05;
  return (
    <View style={[{ height, backgroundColor: C.line, borderRadius: height, overflow: 'hidden' }, style]}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: over ? C.over : col, borderRadius: height }} />
    </View>
  );
}

/** «+?» — к числу добавлено что-то, у чего данных нет. */
export function Unk({ style }: { style?: any }) {
  return <Text style={[{ color: C.muted, fontWeight: '400' }, style]}> +?</Text>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View style={{ paddingVertical: 28, alignItems: 'center' }}>
      <Text style={[T.h3, { color: C.inkSoft }]}>{title}</Text>
      {text ? <Text style={[T.small, { textAlign: 'center', marginTop: 6, maxWidth: 280 }]}>{text}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: RADIUS, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, padding: 16 },
  seg: { flexDirection: 'row', backgroundColor: C.paper, borderRadius: 9, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 7 },
  segOn: { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  chip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 18, borderRadius: RADIUS },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong, borderRadius: 8, paddingHorizontal: 11, backgroundColor: C.surface },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.lineStrong, alignSelf: 'center', marginTop: 8, marginBottom: 12 },
});
