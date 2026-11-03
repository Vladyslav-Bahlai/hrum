import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../ui/RNText';
import { play } from '../sound';
import { C, T } from '../theme';
import { Icon } from '../ui/Icon';
import { ActBtn, Btn, Field, NumField, Sheet } from '../ui/kit';
import { useStore } from '../store';
import { mergeItems } from '../logic';
import { DishAssist, ExplainButton } from './DishAssist';
import { buildLibrary, LibItem, searchLibrary } from '../library';
import { analyzeFood } from '../ai';
import { getKey } from '../storage';
import { fromCamera, fromGallery } from '../media';
import { FoodItem } from '../types';
import { isCollapsed } from '../logic';
import { kcalText, macroText, r0 } from '../utils';

function SearchBox({ value, onChange, autoFocus }: { value: string; onChange: (s: string) => void; autoFocus?: boolean }) {
  return (
    <View style={st.search}>
      <Icon name="search" size={18} color={C.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder="Поиск блюда" placeholderTextColor={C.muted}
        autoFocus={autoFocus} style={[T.body, { flex: 1, paddingVertical: 10, marginLeft: 8 }]} />
      {value ? <Pressable onPress={() => onChange('')} hitSlop={10}><Icon name="close" size={16} color={C.muted} /></Pressable> : null}
    </View>
  );
}

function LibRow({ l, onPress, right }: { l: LibItem; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.accentTint }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {l.presetId ? <Icon name="starFill" size={13} color={C.accent} /> : null}
          <Text style={[T.body, { fontWeight: '500', flexShrink: 1 }]} numberOfLines={2}>{l.item.name}</Text>
        </View>
        <Text style={[T.small, { marginTop: 2 }]}>
          {kcalText(l.item)}{l.item.grams ? ` · ${r0(l.item.grams)} г` : ''} · {macroText(l.item)}
          {l.count > 1 ? `  ·  ${l.count}×` : ''}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

/** Выбор блюда из «Моих блюд» и истории — для замены блюда в меню или записи. */
export function DishPicker({ visible, title = 'Выбрать блюдо', onClose, onPick, onManual }: {
  visible: boolean; title?: string; onClose: () => void; onPick: (item: FoodItem) => void; onManual?: () => void;
}) {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const lib = useMemo(() => buildLibrary(data), [data]);
  const list = searchLibrary(lib, q).slice(0, 80);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <SearchBox value={q} onChange={setQ} />
      {onManual ? (
        <ActBtn label="Ввести вручную" icon="edit" onPress={onManual} style={{ flex: 0, marginVertical: 10 }} />
      ) : <View style={{ height: 8 }} />}
      {list.length ? list.map((l) => <LibRow key={l.key} l={l} onPress={() => { onPick(l.item); }} />) : (
        <Text style={[T.small, { paddingVertical: 20, textAlign: 'center' }]}>{q ? 'Ничего не найдено' : 'Библиотека пока пуста'}</Text>
      )}
    </Sheet>
  );
}

/** Создание / редактирование пресета: вручную или через ИИ. */
export function PresetEditor({ visible, initial, presetId, onClose }: {
  visible: boolean; initial?: FoodItem; presetId?: string; onClose: () => void;
}) {
  const store = useStore();
  const blank: FoodItem = { name: '' };
  const [it, setIt] = useState<FoodItem>(initial || blank);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setIt(initial || blank); setAsk(''); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<FoodItem>) => setIt((x) => ({ ...x, ...p }));

  const fill = async (src: 'text' | 'camera' | 'gallery') => {
    const key = await getKey(store.data.ai.provider);
    if (!key) { Alert.alert('Нет ключа ИИ', 'Добавьте ключ в настройках.'); return; }
    const photos = src === 'camera' ? await fromCamera() : src === 'gallery' ? await fromGallery(2) : [];
    if (src !== 'text' && !photos.length) return;
    const text = src === 'text' ? ask || it.name : (ask || it.name || '');
    if (!text && !photos.length) return;
    setBusy(true);
    try {
      const r = await analyzeFood(store.data.ai, key, `Одно блюдо: ${text}`.trim(), photos.map((p) => ({ base64: p.base64, mime: p.mime })));
      const first = r.items[0];
      if (!first) { Alert.alert('Не распознано', r.comment || ''); return; }
      if (r.items.length > 1) {
        // несколько позиций — складываем в одно блюдо (неизвестное остаётся неизвестным)
        const m = mergeItems(r.items.map(({ portion, ...x }) => ({ item: x, portion: portion || 1 })));
        setIt({ ...m, name: it.name || m.name, explain: r.explanation, portion: undefined });
      } else setIt({ ...first, name: it.name || first.name, portion: undefined });
      play('ai');
    } catch (e: any) {
      Alert.alert('Не получилось', e?.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={presetId ? 'Моё блюдо' : 'Новое блюдо'}
      footer={
        <View style={{ gap: 6 }}>
          <Btn label="Сохранить в «Мои блюда»" disabled={!it.name.trim()} onPress={() => { store.savePreset({ ...it, name: it.name.trim() }, presetId); onClose(); }} style={{ paddingVertical: 16 }} />
          {presetId ? (
            <ActBtn label="Удалить из моих блюд" icon="trash" danger onPress={() => { store.deletePreset(presetId); onClose(); }} style={{ flex: 0 }} />
          ) : null}
        </View>
      }>
      <Field label="Название" value={it.name} onChangeText={(t) => set({ name: t })} placeholder="Например: Боул с лососем (Grow Food)" />
      <View style={st.aiBox}>
        <Text style={[T.small, { marginBottom: 8 }]}>Заполнить через ИИ — опишите состав или сфотографируйте</Text>
        <TextInput value={ask} onChangeText={setAsk} placeholder="лосось 80 г, рис 120 г, авокадо, соус терияки" placeholderTextColor={C.muted}
          multiline style={[T.body, st.ask]} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => fill('text')} style={[st.aiBtn, { flex: 1.4 }]} disabled={busy}>
            {busy ? <ActivityIndicator color={C.accent} /> : <><Icon name="sparkle" size={18} color={C.accent} /><Text style={st.aiBtnT}>Посчитать</Text></>}
          </Pressable>
          <Pressable onPress={() => fill('camera')} style={st.aiBtn} disabled={busy}><Icon name="camera" size={20} color={C.accent} /></Pressable>
          <Pressable onPress={() => fill('gallery')} style={st.aiBtn} disabled={busy}><Icon name="image" size={20} color={C.accent} /></Pressable>
        </View>
      </View>
      <View style={{ gap: 10, marginTop: 14 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumField optional label="Ккал" value={it.kcal} onChange={(n) => set({ kcal: n })} style={{ flex: 1 }} />
          <NumField label="Вес" suffix="г" value={it.grams || 0} onChange={(n) => set({ grams: n })} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumField optional label="Белки" suffix="г" value={it.protein} onChange={(n) => set({ protein: n })} style={{ flex: 1 }} />
          <NumField optional label="Жиры" suffix="г" value={it.fat} onChange={(n) => set({ fat: n })} style={{ flex: 1 }} />
          <NumField optional label="Углеводы" suffix="г" value={it.carbs} onChange={(n) => set({ carbs: n })} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumField label="Клетчатка" suffix="г" value={it.fiber || 0} onChange={(n) => set({ fiber: n })} style={{ flex: 1 }} />
          <NumField label="Сахар" suffix="г" value={it.sugar || 0} onChange={(n) => set({ sugar: n })} style={{ flex: 1 }} />
        </View>
        <Field label="Заметка" value={it.note || ''} onChangeText={(t) => set({ note: t })} placeholder="состав, откуда" />
        <ExplainButton items={[it]} />
      </View>
      {it.name.trim() ? <DishAssist items={[it]} onItems={(its) => setIt({ ...its[0], portion: undefined })} placeholder="Уточнить для ИИ: «без соуса», «порция 300 г»…" /> : null}
    </Sheet>
  );
}

/** Вкладка «Мои блюда»: пресеты + история, добавление в день одним тапом. */
export function DishesView({ onAdd }: { onAdd: (item: FoodItem) => void }) {
  const { data } = useStore();
  const store = useStore();
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ item?: FoodItem; id?: string } | null>(null);
  const lib = useMemo(() => buildLibrary(data), [data]);
  const list = searchLibrary(lib, q);
  const presets = list.filter((l) => l.presetId);
  const rest = list.filter((l) => !l.presetId);
  // секции сворачиваются тапом по заголовку; состояние запоминается. При поиске всё раскрыто, чтобы ничего не терялось
  const cPre = !q && isCollapsed(data, 'dishes:presets');
  const cRest = !q && isCollapsed(data, 'dishes:rest');
  const sections: ({ h: string; key: string; closed: boolean } | LibItem)[] = [
    ...(presets.length ? [{ h: `Мои блюда · ${presets.length}`, key: 'dishes:presets', closed: cPre }, ...(cPre ? [] : presets)] : []),
    ...(rest.length ? [{ h: 'Из меню и дневника', key: 'dishes:rest', closed: cRest }, ...(cRest ? [] : rest.slice(0, 150))] : []),
  ];
  const toggle = (key: string) => { LayoutAnimation.configureNext(LayoutAnimation.create(170, 'easeInEaseOut', 'opacity')); store.toggleCollapsed(key); };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}><SearchBox value={q} onChange={setQ} /></View>
          <Pressable onPress={() => setEditor({ item: q ? { name: q } : undefined })} style={st.newBtn}>
            <Icon name="plus" size={22} color={C.white} stroke={2.4} />
          </Pressable>
        </View>
      </View>
      <FlatList
        data={sections}
        keyExtractor={(x, i) => ('h' in x ? 'h' + i : x.key)}
        contentContainerStyle={{ paddingBottom: 230 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ padding: 30, alignItems: 'center' }}>
            <Text style={[T.h3, { textAlign: 'center' }]}>{q ? 'Ничего не найдено' : 'Здесь будут ваши блюда'}</Text>
            <Text style={[T.small, { textAlign: 'center', marginTop: 8 }]}>Создайте пресет кнопкой «+» — вручную или через ИИ. Блюда из меню и дневника появятся здесь сами.</Text>
          </View>
        }
        renderItem={({ item: x }) =>
          'h' in x ? (
            <Pressable accessibilityLabel={x.h} onPress={() => { if (!q) toggle(x.key); }} style={st.head}>
              <Text style={[T.label, { flex: 1 }]}>{x.h}</Text>
              {!q ? <Icon name={x.closed ? 'right' : 'down'} size={20} color={C.muted} /> : null}
            </Pressable>
          ) : (
            <LibRow l={x} onPress={() => setEditor({ item: x.item, id: x.presetId })}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {!x.presetId ? (
                    <Pressable hitSlop={8} onPress={() => { store.savePreset(x.item); play('preset'); }} style={{ padding: 8 }}>
                      <Icon name="star" size={20} color={C.muted} />
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => onAdd(x.item)} hitSlop={6} style={({ pressed }) => [st.plus, pressed && { transform: [{ scale: 0.92 }] }]}>
                    <Icon name="plus" size={22} color={C.white} stroke={2.4} />
                  </Pressable>
                </View>
              } />
          )
        }
      />
      <PresetEditor visible={!!editor} initial={editor?.item} presetId={editor?.id} onClose={() => setEditor(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line, minHeight: 60 },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  newBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  aiBox: { marginTop: 14, backgroundColor: C.accentTint, borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  ask: { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.lineStrong, padding: 10, minHeight: 46, maxHeight: 100, textAlignVertical: 'top' },
  aiBtn: { flex: 1, height: 46, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  aiBtnT: { color: C.accent, fontWeight: '600' },
});
