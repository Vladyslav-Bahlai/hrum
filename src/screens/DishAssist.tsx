import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../ui/RNText';
import { C, noOutline, T } from '../theme';
import { ActBtn, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useStore } from '../store';
import { ChatTurn, dishTalk } from '../ai';
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

/**
 * Уточнение блюда с ИИ прямо в окне записи/правки: «съел только мясо», «порция была 300 г», «почему так много?».
 * В запрос уходит история этого мини-разговора и текущие блюда. ИИ может ответить текстом и/или вернуть исправленные блюда —
 * они сразу подставляются в окно (записать в дневник можно только после этого, обычной кнопкой).
 * В «Чаты» разговор не сохраняется: живёт, пока открыто окно.
 */
export function DishAssist({ items, onItems, placeholder = 'Уточнить для ИИ: «съел только мясо», «порция 300 г»…' }: {
  items: FoodItem[]; onItems: (items: FoodItem[]) => void; placeholder?: string;
}) {
  const { data } = useStore();
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<(ChatTurn & { err?: boolean; changed?: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const key = await getKey(data.ai.provider);
    const hist = [...turns.filter((t) => !t.err), { role: 'user' as const, text: q }];
    setTurns((x) => [...x, { role: 'user', text: q }]);
    setText('');
    if (!key) { setTurns((x) => [...x, { role: 'ai', text: 'Добавьте ключ ИИ в настройках — тогда можно уточнять блюда.', err: true }]); return; }
    setBusy(true);
    try {
      const r = await dishTalk(data.ai, key, items, hist.map(({ role, text: t }) => ({ role, text: t })));
      if (r.items?.length) onItems(r.items);
      setTurns((x) => [...x, { role: 'ai', text: r.reply, changed: !!r.items?.length }]);
    } catch (e: any) {
      setTurns((x) => [...x, { role: 'ai', text: e?.message || String(e), err: true }]);
      setText(q);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={st.box}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: turns.length ? 8 : 6 }}>
        <Icon name="sparkle" size={16} color={C.accent} />
        <Text style={[T.label, { flex: 1 }]}>Уточнить с ИИ</Text>
      </View>
      {turns.map((t, i) => (
        <View key={i} style={[st.msg, t.role === 'user' ? st.mine : t.err ? st.err : st.ai]}>
          {t.role === 'user' || t.err ? <Text style={[T.body, { fontSize: 14.5 }, t.role === 'user' && { color: C.white }, t.err && { color: C.over }]}>{t.text}</Text> : <RichText text={t.text} />}
          {t.changed ? <Text style={[T.small, { color: C.accent, fontWeight: '700', marginTop: 4 }]}>✓ блюдо обновлено</Text> : null}
        </View>
      ))}
      <View style={st.inputRow}>
        <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={C.muted} multiline
          accessibilityLabel="Уточнить для ИИ" style={[T.body, st.input, noOutline]} />
        <Pressable accessibilityLabel="Отправить уточнение" onPress={send} disabled={!text.trim() || busy}
          style={[st.send, (!text.trim() || busy) && { backgroundColor: C.accentSoft }]}>
          {busy ? <ActivityIndicator color={C.accent} /> : <Icon name="send" size={20} color={text.trim() ? C.white : C.accent} stroke={2.2} />}
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
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
