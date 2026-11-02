import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, T } from '../theme';
import { Icon } from '../ui/Icon';
import { fromCamera, fromGallery, Picked } from '../media';
import { FoodItem } from '../types';
import { known, r0 } from '../utils';
import { useStore } from '../store';
import { Chip, Seg, Sheet, ActBtn } from '../ui/kit';
import { getKey } from '../storage';
import { DEFAULT_MODELS, listModels } from '../ai';
import { Provider } from '../types';

/** Плавающая панель ввода: текст, камера, галерея и быстрые блюда. */
export function Composer({ busy, onSubmit, quick, onQuick, bottomInset, onManual }: {
  onManual: () => void;
  busy: boolean;
  onSubmit: (text: string, photos: Picked[]) => Promise<boolean>;
  quick: FoodItem[];
  onQuick: (item: FoodItem) => void;
  bottomInset: number;
}) {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [focus, setFocus] = useState(false);
  const [picking, setPicking] = useState(false);
  const { data } = useStore();
  const [modelOpen, setModelOpen] = useState(false);
  const model = data.ai.provider === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  const canSend = (text.trim().length > 0 || photos.length > 0) && !busy;

  const add = async (src: 'camera' | 'gallery') => {
    if (picking) return;
    setPicking(true);
    try {
      const p = src === 'camera' ? await fromCamera() : await fromGallery(4 - photos.length);
      if (p.length) setPhotos((x) => [...x, ...p].slice(0, 4));
    } finally {
      setPicking(false);
    }
  };

  const send = async () => {
    if (!canSend) return;
    Keyboard.dismiss();
    const ok = await onSubmit(text.trim(), photos);
    if (ok) {
      setText('');
      setPhotos([]);
    }
  };

  const showQuick = focus && !text && !photos.length && quick.length > 0;

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(bottomInset, 12) }]}>
      {showQuick ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
          {quick.map((q, i) => (
            <Pressable key={i} onPress={() => onQuick(q)} style={s.quick}>
              <Text style={[T.body, { fontSize: 14, fontWeight: '600' }]} numberOfLines={1}>{q.name}</Text>
              <Text style={[T.small, { marginLeft: 6 }]}>{known(q).kcal ? r0(q.kcal!) : '—'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Pressable onPress={() => setModelOpen(true)} style={s.model} hitSlop={6}>
        <Icon name="sparkle" size={14} color={C.accent} />
        <Text style={{ color: C.inkSoft, fontSize: 12.5, fontWeight: '600', maxWidth: 220 }} numberOfLines={1}>
          {data.ai.provider === 'claude' ? 'Claude' : 'Gemini'} · {model || DEFAULT_MODELS[data.ai.provider]}
        </Text>
        <Icon name="down" size={14} color={C.muted} />
      </Pressable>
      <View style={s.bar}>
        {photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 10, paddingBottom: 0 }}>
            {photos.map((p, i) => (
              <View key={i}>
                <Image source={{ uri: p.uri }} style={s.thumb} />
                <Pressable hitSlop={8} style={s.thumbX} onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))}>
                  <Icon name="close" size={12} color={C.white} stroke={2.4} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 6, gap: 4 }}>
          <Pressable onPress={() => add('camera')} style={s.round} hitSlop={4}>
            <Icon name="camera" size={24} color={C.accent} />
          </Pressable>
          <Pressable onPress={() => add('gallery')} style={s.round} hitSlop={4}>
            <Icon name="image" size={24} color={C.accent} />
          </Pressable>
          <Pressable onPress={onManual} style={s.round} hitSlop={4}>
            <Icon name="pen" size={22} color={C.accent} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder={photos.length ? 'Уточните, если нужно…' : 'Что вы съели?'}
            placeholderTextColor={C.muted}
            multiline
            style={[T.body, s.input]}
          />
          <Pressable onPress={send} style={[s.send, { backgroundColor: canSend ? C.accent : C.line }]}>
            {busy ? <ActivityIndicator color={C.white} /> : <Icon name="send" size={24} color={canSend ? C.white : C.muted} stroke={2.2} />}
          </Pressable>
        </View>
      </View>
      <ModelSheet visible={modelOpen} onClose={() => setModelOpen(false)} />
    </View>
  );
}

/** Смена провайдера и модели прямо из чата; список берётся из кэша последней проверки ключа. */
function ModelSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, update, cacheModels } = useStore();
  const [prov, setProv] = useState<Provider>(data.ai.provider);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (visible) setProv(data.ai.provider); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = prov === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  const cached = data.ai.models?.[prov] || [];
  const list = cached.length ? cached : [cur || DEFAULT_MODELS[prov]];
  const choose = (m: string) => {
    update((d) => ({ ...d, ai: { ...d.ai, provider: prov, [prov === 'claude' ? 'claudeModel' : 'geminiModel']: m } }));
    onClose();
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const key = await getKey(prov);
      if (!key) { Alert.alert('Нет ключа', 'Добавьте ключ этого провайдера в настройках.'); return; }
      cacheModels(prov, await listModels(prov, key));
    } catch (e: any) {
      Alert.alert('Не удалось обновить список', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Модель ИИ">
      <Seg items={[{ key: 'gemini' as Provider, label: 'Google Gemini' }, { key: 'claude' as Provider, label: 'Anthropic Claude' }]} value={prov} onChange={setProv} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {list.slice(0, 20).map((m) => <Chip key={m} label={m} on={m === cur && prov === data.ai.provider} onPress={() => choose(m)} />)}
      </View>
      <Text style={[T.small, { marginTop: 12 }]}>
        {cached.length ? 'Список запомнен при последней проверке ключа.' : 'Список появится после проверки ключа в настройках — или обновите его здесь.'}
      </Text>
      <ActBtn label={busy ? 'Обновляю…' : 'Обновить список моделей'} icon="repeat" onPress={refresh} style={{ flex: 0, marginTop: 10, marginBottom: 6 }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  model: {
    alignSelf: 'flex-start', marginLeft: 20, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 15,
    backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
  },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    marginHorizontal: 12, backgroundColor: C.surface, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
    shadowColor: '#0F2A1C', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTint },
  input: { flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: 10, paddingTop: 13, paddingBottom: 12 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: C.line },
  thumbX: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  quick: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, paddingHorizontal: 14, height: 40, borderRadius: 20, maxWidth: 220,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, shadowColor: '#0F2A1C', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
});
