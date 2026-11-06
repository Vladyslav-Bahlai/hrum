import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, TextInput } from '../ui/RNText';
import { C, noOutline, T } from '../theme';
import { ActBtn, Sheet, useSheetReveal } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useStore } from '../store';
import { ChatTurn, dishTalk, isCancelled } from '../ai';
import { fmt, kcalText, known, macroText, r0 } from '../utils';
import { ModelPill, ModelPopup } from './ModelPopup';
import { getKey } from '../storage';
import { FoodItem } from '../types';
import { RichText } from './ChatSlot';

/** Кнопка «Как посчитано» → окно с полным объяснением ИИ (чтобы числа не появлялись из ниоткуда). */
export function ExplainButton({ items }: { items: FoodItem[] }) {
  const [open, setOpen] = useState(false);
  const texts = Array.from(new Set(items.map((i) => i.explain?.trim()).filter(Boolean) as string[]));
  if (!texts.length) return null;
  return (
    <>
      <ActBtn label="Как посчитано" icon="sparkle" onPress={() => setOpen(true)} style={{ flex: 0, minHeight: 48 }} />
      {open ? (
        <Sheet visible onClose={() => setOpen(false)} title="Как ИИ посчитал">
          {texts.map((t, i) => (
            <View key={i} style={[st.explain, i > 0 && { marginTop: 10 }]}>
              {texts.length > 1 || items.length > 1 ? <Text style={[T.label, { marginBottom: 6 }]}>{items.filter((x) => x.explain?.trim() === t).map((x) => x.name).join(', ')}</Text> : null}
              <RichText text={t} />
            </View>
          ))}
        </Sheet>
      ) : null}
    </>
  );
}

interface Version { items: FoodItem[] }

const kcalSum = (its: FoodItem[]) => its.reduce((a, i) => a + (known(i).kcal ? i.kcal! : 0), 0);

/**
 * Уточнение блюда с ИИ прямо в окне записи/правки: «съел только мясо», «порция была 300 г», «почему так много?».
 * Ответ ИИ не подставляется сам: появляется подсвеченное жёлтым окно «Уточнено с ИИ» с предложенной версией, камера
 * прокручивается к нему. «Обновить» переносит версию в редактор (с анимацией) — окно показывает прежнюю версию
 * («Оригинальная версия») и больше не светится; «Удалить» убирает показанную версию из истории. Версий может быть несколько
 * (повторные уточнения) — между ними листаем свайпом или стрелками. В дневник попадает только то, что сохранит нижняя кнопка окна.
 * В «Чаты» разговор не сохраняется.
 */
export function DishAssist({ items, onItems, placeholder = 'Уточнить для ИИ: «съел только мясо», «порция 300 г»…' }: {
  items: FoodItem[]; onItems: (items: FoodItem[], isOriginal: boolean) => void; placeholder?: string;
}) {
  const { data } = useStore();
  const reveal = useSheetReveal();
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<(ChatTurn & { err?: boolean; changed?: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const [popup, setPopup] = useState(false);
  // версии блюд: [0] — исходная, дальше — предложения ИИ; applied — что сейчас в редакторе, shown — что показано в окне
  const [versions, setVersions] = useState<Version[]>([]);
  const [applied, setApplied] = useState(0);
  const [shown, setShown] = useState(0);
  const [glow, setGlow] = useState(false);
  const boxRef = useRef<any>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!glow) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [glow, pulse]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const key = await getKey(data.ai.provider);
    const hist = [...turns.filter((t) => !t.err), { role: 'user' as const, text: q }];
    setTurns((x) => [...x, { role: 'user', text: q }]);
    setText('');
    setPopup(false);
    if (!key) { setTurns((x) => [...x, { role: 'ai', text: 'Добавьте ключ ИИ в настройках — тогда можно уточнять блюда.', err: true }]); return; }
    setBusy(true);
    const c = new AbortController();
    ctl.current = c;
    try {
      const r = await dishTalk(data.ai, key, items, hist.map(({ role, text: t }) => ({ role, text: t })), [], c.signal);
      if (r.items?.length) {
        const got = r.items;
        LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'));
        setVersions((v) => {
          const base = v.length ? v : [{ items: items.map((i) => ({ ...i })) }];
          const next = [...base, { items: got }];
          setShown(next.length - 1);
          return next;
        });
        setGlow(true);
        setTimeout(() => reveal?.(boxRef.current, 8), 160); // «камера» к окну уточнения
      }
      setTurns((x) => [...x, { role: 'ai', text: r.reply, changed: !!r.items?.length }]);
    } catch (e: any) {
      if (isCancelled(e)) setTurns((x) => [...x, { role: 'ai', text: 'Запрос отменён.', err: true }]);
      else setTurns((x) => [...x, { role: 'ai', text: e?.message || String(e), err: true }]);
      setText(q);
    } finally {
      ctl.current = null;
      setBusy(false);
    }
  };

  const apply = () => {
    if (shown === applied || !versions[shown]) return;
    const prev = applied;
    LayoutAnimation.configureNext(LayoutAnimation.create(260, 'easeInEaseOut', 'opacity'));
    onItems(versions[shown].items.map((i) => ({ ...i })), shown === 0);
    setApplied(shown);
    setShown(prev); // окно показывает то, что заменили («Оригинальная версия»), и больше не светится
    setGlow(false);
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 1200, useNativeDriver: false }).start();
  };
  const remove = () => {
    if (shown === 0) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    const next = versions.filter((_, i) => i !== shown);
    if (next.length <= 1) { setVersions([]); setApplied(0); setShown(0); setGlow(false); if (applied === shown) onItems(versions[0].items, true); return; }
    let ap = applied;
    if (applied === shown) { ap = 0; onItems(versions[0].items.map((i) => ({ ...i })), true); } else if (applied > shown) ap = applied - 1;
    setVersions(next);
    setApplied(ap);
    setShown(Math.min(shown, next.length - 1));
    setGlow(false);
  };
  const go = (d: number) => {
    const n = Math.max(0, Math.min(versions.length - 1, shown + d));
    if (n === shown) return;
    setShown(n);
    if (n !== versions.length - 1 || n === applied) setGlow(false);
  };
  const goRef = useRef(go); goRef.current = go;
  const swipe = useMemo(() => Gesture.Pan().runOnJS(true).activeOffsetX([-14, 14]).failOffsetY([-12, 12])
    .onEnd((e) => { if (e.translationX < -40) goRef.current(1); else if (e.translationX > 40) goRef.current(-1); }), []);

  const cur = versions[shown];
  const isOrig = shown === 0;
  const isApplied = shown === applied;
  const label = isApplied ? 'Сейчас в окне' : isOrig ? 'Оригинальная версия' : glow && shown === versions.length - 1 ? 'Уточнено с ИИ' : 'Версия ИИ';
  const delta = cur ? kcalSum(cur.items) - kcalSum(versions[applied]?.items || items) : 0;
  const glowBorder = pulse.interpolate({ inputRange: [0, 1], outputRange: ['#E9D27A', '#F2B705'] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.7] });

  return (
    <View style={st.box}>
      <View style={st.head}>
        <Icon name="sparkle" size={16} color={C.accent} />
        <Text style={[T.label, { flex: 1 }]}>Уточнить с ИИ</Text>
        <View style={{ zIndex: 20 }}>
          <ModelPill onPress={() => setPopup((x) => !x)} open={popup} style={{ height: 30 }} />
          {popup ? <ModelPopup onClose={() => setPopup(false)} style={{ position: 'absolute', right: 0, top: 36 }} /> : null}
        </View>
      </View>

      {cur && versions.length > 1 ? (
        <GestureDetector gesture={swipe}>
          <Animated.View ref={boxRef} collapsable={false} testID="refine-box"
            style={[st.ver, glow && { borderColor: glowBorder, borderWidth: 2, backgroundColor: '#FFF9E0' }, !glow && { backgroundColor: C.surface }]}>
            {glow ? <Animated.View pointerEvents="none" style={[st.glow, { opacity: glowOpacity }]} /> : null}
            <Animated.View pointerEvents="none" style={[st.flash, { opacity: flash }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => go(-1)} hitSlop={8} disabled={shown === 0} style={{ opacity: shown === 0 ? 0.25 : 1 }} accessibilityLabel="Предыдущая версия"><Icon name="left" size={20} color={C.inkSoft} /></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[T.label, { color: glow ? '#8A6A00' : C.muted }]}>{label}</Text>
                <Text style={T.small}>версия {shown + 1} из {versions.length}{glow ? ' · свайп — другие версии' : ''}</Text>
              </View>
              <Pressable onPress={() => go(1)} hitSlop={8} disabled={shown === versions.length - 1} style={{ opacity: shown === versions.length - 1 ? 0.25 : 1 }} accessibilityLabel="Следующая версия"><Icon name="right" size={20} color={C.inkSoft} /></Pressable>
            </View>
            {cur.items.map((it, i) => (
              <View key={i} style={{ marginTop: 8 }}>
                <Text style={[T.h3, { fontSize: 16 }]} numberOfLines={2}>{it.name}</Text>
                <Text style={[T.small, { marginTop: 2 }]}>{kcalText(it)}{it.grams ? ` · ${r0(it.grams)} г` : ''} · {macroText(it)}</Text>
                {it.note ? <Text style={[T.small, { color: C.inkSoft, marginTop: 1 }]} numberOfLines={2}>{it.note}</Text> : null}
              </View>
            ))}
            {!isApplied && Math.abs(delta) >= 1 ? <Text style={[T.small, { marginTop: 8, fontWeight: '700', color: delta > 0 ? C.over : C.accent }]}>{delta > 0 ? '+' : '−'}{fmt(Math.abs(delta))} ккал к тому, что в окне</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <ActBtn label="Обновить" icon="check" onPress={apply} style={[{ backgroundColor: isApplied ? C.line : C.accent, borderColor: isApplied ? C.line : C.accent, opacity: isApplied ? 0.5 : 1 }, st.btnFill] as any} textColor={isApplied ? C.muted : C.white} />
              <ActBtn label="Удалить" icon="trash" danger onPress={remove} style={{ opacity: isOrig ? 0.4 : 1 }} />
            </View>
            <Text style={[T.small, { marginTop: 8 }]}>«Обновить» меняет только окно. В дневник попадает то, что вы сохраните кнопкой внизу.</Text>
          </Animated.View>
        </GestureDetector>
      ) : null}

      {turns.map((t, i) => (
        <View key={i} style={[st.msg, t.role === 'user' ? st.mine : t.err ? st.err : st.ai]}>
          {t.role === 'user' || t.err ? <Text style={[T.body, { fontSize: 14.5 }, t.role === 'user' && { color: C.white }, t.err && { color: C.over }]}>{t.text}</Text> : <RichText text={t.text} />}
          {t.changed ? <Text style={[T.small, { color: C.accent, fontWeight: '700', marginTop: 4 }]}>✓ предложена новая версия — см. окно выше</Text> : null}
        </View>
      ))}
      <View style={st.inputRow}>
        <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={C.muted} multiline
          accessibilityLabel="Уточнить для ИИ" style={[T.body, st.input, noOutline]} />
        <Pressable accessibilityLabel={busy ? 'Отменить запрос' : 'Отправить уточнение'} onPress={busy ? () => ctl.current?.abort() : send} disabled={!busy && !text.trim()}
          style={[st.send, !busy && !text.trim() && { backgroundColor: C.accentSoft }]}>
          {busy ? (
            <>
              <ActivityIndicator color={C.white} style={{ position: 'absolute' }} />
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: C.white }} />
            </>
          ) : <Icon name="send" size={20} color={text.trim() ? C.white : C.accent} stroke={2.2} />}
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, zIndex: 20 },
  ver: { padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, marginBottom: 10, overflow: 'hidden' },
  glow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#FFE680' },
  flash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.accentSoft },
  btnFill: { flex: 1 },
  box: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: C.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: C.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  msg: { maxWidth: '92%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginBottom: 6 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.accent },
  ai: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  err: { alignSelf: 'flex-start', backgroundColor: C.overSoft },
  explain: { padding: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
});
