import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../ui/RNText';
import { C, T } from '../theme';
import { ChatMsg } from '../types';
import { Icon } from '../ui/Icon';
import { parseMarkdown } from '../markdown';
import { ASK_HINT_MS, ASK_HINTS, nextAskHint } from '../chat';
import { ChatApi } from './useChat';

const hhmm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

const body = [T.body, { fontSize: 14.5, lineHeight: 20 }];
/** Ответ ИИ с лёгким markdown: жирный, списки, абзацы. */
export function RichText({ text }: { text: string }) {
  return (
    <View>
      {parseMarkdown(text).map((b, i) => b.kind === 'gap' ? <View key={i} style={{ height: 6 }} /> : (
        <View key={i} style={b.kind === 'li' ? { flexDirection: 'row', paddingLeft: 2, marginTop: 2 } : undefined}>
          {b.kind === 'li' ? <Text style={[...body, { width: b.marker === '•' ? 16 : 22, color: C.accentDark }]}>{b.marker}</Text> : null}
          <Text selectable style={[...body, b.kind === 'li' && { flex: 1 }]}>
            {b.spans.map((sp, j) => <Text key={j} style={sp.bold ? { fontWeight: '700' } : undefined}>{sp.text}</Text>)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Bubble({ m }: { m: ChatMsg }) {
  const mine = m.role === 'user';
  return (
    <View style={[s.bubble, mine ? s.mine : m.error ? s.err : s.ai]}>
      {m.photos?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6, justifyContent: 'flex-end' }}>
          {m.photos.map((u, i) => <Image key={i} source={{ uri: u }} accessibilityLabel="Фото к вопросу" style={s.photo} />)}
        </View>
      ) : null}
      {mine || m.error ? (
        <Text selectable style={[T.body, { fontSize: 14.5, lineHeight: 20 }, mine && { color: C.white }, m.error && { color: C.over }]}>{m.text}</Text>
      ) : <RichText text={m.text} />}
      <Text style={[T.small, { fontSize: 11, marginTop: 3, textAlign: mine ? 'right' : 'left' }, mine && { color: '#D6E8DC' }]}>{hhmm(m.at)}</Text>
    </View>
  );
}

/** Лента сообщений; сама прокручивается вниз при новых сообщениях. */
export function Messages({ chat, maxHeight, empty }: { chat: ChatApi; maxHeight?: number; empty?: React.ReactNode }) {
  const ref = useRef<any>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(t); }, [chat.messages.length, chat.sending, chat.id]);
  return (
    <ScrollView ref={ref} style={maxHeight ? { maxHeight } : { flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, flexGrow: 1 }}>
      {chat.messages.length === 0 && !chat.sending ? empty : null}
      {chat.messages.map((m) => <Bubble key={m.id} m={m} />)}
      {chat.sending ? <View style={[s.bubble, s.ai, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}><ActivityIndicator size="small" color={C.accent} /><Text style={T.small}>ИИ думает…</Text></View> : null}
    </ScrollView>
  );
}

/** Подсказка-«пример вопроса» для пустого инпута: плавно меняется каждые ~4 секунды. */
export function useAskHint(active: boolean) {
  const [i, setI] = useState(0);
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { setI(0); a.setValue(1); return; }
    const id = setInterval(() => {
      Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setI((x) => nextAskHint(x));
        Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, ASK_HINT_MS);
    return () => clearInterval(id);
  }, [active, a]);
  return { text: ASK_HINTS[i], opacity: a };
}

/** Серый текст поверх пустого поля ввода (кладётся внутрь контейнера поля, не перехватывает касания). */
export function AskHint({ hint, left = 8, top = 11 }: { hint: { text: string; opacity: Animated.Value }; left?: number; top?: number }) {
  return <Animated.Text pointerEvents="none" numberOfLines={1} style={[T.body, { position: 'absolute', left, right: 8, top, color: C.muted, opacity: hint.opacity }]}>{hint.text}</Animated.Text>;
}

export const emptyChatHint = (
  <View style={{ paddingVertical: 14, alignItems: 'center' }}>
    <Text style={[T.small, { textAlign: 'center', lineHeight: 18 }]}>Спросите про питание, меню или статистику — ИИ видит дневник, меню дня и итоги недели, но ничего не меняет.</Text>
  </View>
);

/** Свёрнутый чат: компактная полоска над панелью ввода (заголовок, последний ответ одной строкой, «вверх» и ✕). */
export function ChatMini({ chat, onExpand, onClose }: { chat: ChatApi; onExpand: () => void; onClose: () => void }) {
  const last = chat.messages[chat.messages.length - 1];
  return (
    <Pressable onPress={onExpand} accessibilityLabel="Развернуть чат" style={s.mini}>
      <View style={{ flex: 1, paddingLeft: 16, paddingVertical: 8 }}>
        <Text style={T.label}>Чат · {chat.title}</Text>
        <Text style={[T.bodySoft, { fontSize: 13.5, marginTop: 1 }]} numberOfLines={1}>
          {chat.sending ? 'ИИ думает…' : last ? last.text : 'Сообщений пока нет'}
        </Text>
      </View>
      <Pressable accessibilityLabel="Развернуть" onPress={onExpand} hitSlop={6} style={s.miniBtn}><Icon name="up" size={22} color={C.accent} /></Pressable>
      <Pressable accessibilityLabel="Закрыть чат" onPress={onClose} hitSlop={6} style={s.miniBtn}><Icon name="close" size={20} color={C.inkSoft} /></Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '86%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.accent, borderBottomRightRadius: 6 },
  ai: { alignSelf: 'flex-start', backgroundColor: C.accentTint, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  photo: { width: 96, height: 96, borderRadius: 12, backgroundColor: C.line },
  err: { alignSelf: 'flex-start', backgroundColor: C.overSoft, borderBottomLeftRadius: 6 },
  mini: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 8, paddingRight: 4, minHeight: 56, backgroundColor: C.surface, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  miniBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
