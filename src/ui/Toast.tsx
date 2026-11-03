import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Text } from './RNText';
import { C } from '../theme';

interface ToastOpts { text: string; action?: string; onAction?: () => void; onExpire?: () => void }
const Ctx = createContext<(o: ToastOpts) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children, bottom = 110 }: { children: React.ReactNode; bottom?: number }) {
  const [t, setT] = useState<ToastOpts | null>(null);
  const a = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const cur = useRef<ToastOpts | null>(null);

  const hide = useCallback((expired: boolean) => {
    const c = cur.current;
    cur.current = null;
    if (expired) c?.onExpire?.();
    Animated.timing(a, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setT(null));
  }, [a]);

  const show = useCallback((o: ToastOpts) => {
    if (timer.current) clearTimeout(timer.current);
    cur.current?.onExpire?.();
    cur.current = o;
    setT(o);
    Animated.spring(a, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
    timer.current = setTimeout(() => hide(true), 4200);
  }, [a, hide]);

  return (
    <Ctx.Provider value={show}>
      {children}
      {t && t.action ? (
        // прозрачный экран-щит: пока видно «Отменить», интерфейс не работает, а тап мимо только прячет окошко
        <Pressable onPress={() => { if (timer.current) clearTimeout(timer.current); hide(true); }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      ) : null}
      {t ? (
        <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom, opacity: a,
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <View style={{ backgroundColor: C.ink, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: C.white, flex: 1, fontSize: 14.5 }}>{t.text}</Text>
            {t.action ? (
              <Pressable hitSlop={12} onPress={() => { if (timer.current) clearTimeout(timer.current); const c = cur.current; cur.current = null; c?.onAction?.(); hide(false); }}>
                <Text style={{ color: '#BFE3C9', fontWeight: '700', fontSize: 14.5, marginLeft: 14 }}>{t.action}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}
