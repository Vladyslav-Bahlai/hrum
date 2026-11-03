import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui/RNText';
import { C, T } from '../theme';
import { ActBtn, Btn, Field, Seg, Sheet } from '../ui/kit';
import { IconView } from '../ui/DishIcon';
import { useStore } from '../store';
import { FoodItem, IconRef } from '../types';
import { emojiHex, RULES } from '../icons';
import { OPENMOJI, OPENMOJI_NAMES } from '../openmojiData';
import { manualKey, normalizeIconSettings, packAvailable, packOf, PACKS, resolveIcon, sourceTitle } from '../iconify';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/** Эмодзи еды, подходящие под слово: по русским основам словаря и английским названиям эмодзи. */
export function iconCandidates(q: string): string[] {
  const n = norm(q);
  const all = Object.keys(OPENMOJI).filter((h) => !h.startsWith('E')).map((h) => String.fromCodePoint(...h.split('-').map((x) => parseInt(x, 16))));
  if (!n) return all;
  const hits = new Set<string>();
  for (const [emoji, stems] of RULES) for (const st of stems) {
    const [ru, en] = st.split('=');
    if (norm(ru).startsWith(n) || n.startsWith(norm(ru)) || (en && norm(en).includes(n))) hits.add(emoji);
  }
  for (const [hex, ann] of Object.entries(OPENMOJI_NAMES)) if (norm(ann).includes(n)) hits.add(String.fromCodePoint(...hex.split('-').map((x) => parseInt(x, 16))));
  return Array.from(hits);
}

/** Ручной выбор иконки блюда: из встроенного OpenMoji, скачанных паков, системных эмодзи и онлайн-поиска. Запоминается для названия. */
export function IconPicker({ item, onClose }: { item: FoodItem; onClose: () => void }) {
  const { data, setManualIcon } = useStore();
  const st = data.icons || normalizeIconSettings(undefined);
  const key = manualKey(item.name);
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<string>('auto');
  const [online, setOnline] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const sources = ['openmoji', ...PACKS.filter((p) => !p.builtin && packAvailable(p.prefix, data.iconPacks)).map((p) => 'pack:' + p.prefix), 'emoji', 'online'];
  const cands = useMemo(() => iconCandidates(q), [q]);
  const auto = resolveIcon(item.name, item.emoji, item.en, { settings: { ...st, manual: {} }, downloaded: data.iconPacks, onlineCache: data.iconCache });
  const cur = st.manual[key];

  const refFor = (emoji: string): IconRef | null => {
    const hex = emojiHex(emoji);
    if (src === 'emoji') return { kind: 'emoji', emoji };
    if (src.startsWith('pack:')) { const name = packOf(src.slice(5))?.icons[hex]; return name ? { kind: 'pack', prefix: src.slice(5), name } : null; }
    if (src === 'openmoji' || src === 'auto') return OPENMOJI[hex] ? { kind: 'openmoji', hex } : { kind: 'emoji', emoji };
    return null;
  };
  const choose = (r: IconRef) => { setManualIcon(key, r); onClose(); };
  const searchOnline = async () => {
    setBusy(true);
    try {
      const sets = st.online.sets.filter((s) => s.on).map((s) => s.prefix).join(',');
      const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q || item.en || item.name)}&limit=${st.online.limit}${sets ? `&prefixes=${sets}` : ''}`);
      const j = await r.json();
      setOnline(Array.isArray(j?.icons) ? j.icons : []);
    } catch { setOnline([]); } finally { setBusy(false); }
  };

  return (
    <Sheet visible onClose={onClose} title="Иконка блюда">
      <Text style={[T.bodySoft, { marginBottom: 10 }]} numberOfLines={2}>{item.name}</Text>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <IconView r={auto.ref} size={44} />
        <Text style={[T.small, { flex: 1 }]}>Автоматически: {auto.source ? sourceTitle(auto.source) : '—'}{cur ? ' · сейчас выбрана вручную' : ''}</Text>
      </View>
      {cur ? <ActBtn label="Сбросить — снова автоматически" icon="repeat" onPress={() => { setManualIcon(key, null); onClose(); }} style={{ flex: 0, marginBottom: 12, minHeight: 50 }} /> : null}
      <Field placeholder="Поиск: «суп», «рыба», «cake»…" value={q} onChangeText={(t) => { setQ(t); setOnline(null); }} />
      <Seg items={[{ key: 'auto', label: 'Авто' }, ...sources.filter((x) => x !== 'online').map((x) => ({ key: x, label: x === 'openmoji' ? 'OpenMoji' : x === 'emoji' ? 'Эмодзи' : (packOf(x.slice(5))?.title || x).replace(/ \(.*\)/, '') }))]}
        value={src} onChange={setSrc} style={{ marginTop: 10 }} />
      <View style={s.grid}>
        {cands.map((e) => {
          const r = src === 'auto' ? resolveIcon(e, e, undefined, { settings: { ...st, manual: {}, sources: st.sources.filter((x) => x.id !== 'online') }, downloaded: data.iconPacks }).ref : refFor(e);
          if (!r) return null;
          return (
            <Pressable key={e} accessibilityLabel={`Иконка ${e}`} onPress={() => choose(r)} style={({ pressed }) => [s.cell, pressed && { backgroundColor: C.accentSoft }]}>
              <IconView r={r} size={36} />
            </Pressable>
          );
        })}
      </View>
      {!cands.length ? <Text style={[T.small, { marginTop: 10 }]}>По этому слову в библиотеке ничего нет — попробуйте онлайн-поиск.</Text> : null}
      <Btn label={busy ? 'Ищу в Iconify…' : 'Искать онлайн (Iconify)'} kind="soft" icon="search" onPress={searchOnline} disabled={busy} style={{ marginTop: 14 }} />
      {busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} /> : null}
      {online ? (
        online.length ? (
          <View style={s.grid}>
            {online.map((icon) => (
              <Pressable key={icon} accessibilityLabel={icon} onPress={() => choose({ kind: 'online', icon })} style={({ pressed }) => [s.cell, pressed && { backgroundColor: C.accentSoft }]}>
                <IconView r={{ kind: 'online', icon }} size={36} />
              </Pressable>
            ))}
          </View>
        ) : <Text style={[T.small, { marginTop: 8 }]}>Онлайн ничего не нашлось (или нет сети).</Text>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  cell: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
});
