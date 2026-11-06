import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from '../ui/RNText';
import { C, T, TABS, shade } from '../theme';
import { ActBtn, Btn, Field, NumField, Seg, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { IconView } from '../ui/DishIcon';
import { useStore } from '../store';
import { IconSettings, TargetRecord } from '../types';
import {
  defaultIconSettings, dropIndex, hiddenOnlineSets, moveSourceTo, downloadPack, fmtBytes, fromSource, iconKey, moveSet, moveSource, normalizeIconSettings, packOf, PACKS, resolveIcon, sourceTitle, toggleSet, toggleSource,
} from '../iconify';
import { packStore } from '../storage';
import { minutesLabel, parseTime, toKey, uid, fromKey, timestampAt, formatTimeInput } from '../utils';
import { sortLog } from '../logic';
const X = TABS.settings;
const XD = shade(X.accent, 0.72);

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={() => onChange(!on)} style={st.row}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={T.body}>{label}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      <View style={[st.sw, on && { backgroundColor: X.accent, borderColor: X.accent }]}>
        <Text style={{ color: on ? C.white : C.muted, fontWeight: '700', fontSize: 14 }}>{on ? 'Да' : 'Нет'}</Text>
      </View>
    </Pressable>
  );
}

function RoundBtn({ icon, label, onPress, disabled, on }: { icon: any; label: string; onPress: () => void; disabled?: boolean; on?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} onPress={disabled ? undefined : onPress} hitSlop={4}
      style={({ pressed }) => [st.round, on && { backgroundColor: X.accent, borderColor: X.accent }, (disabled || pressed) && { opacity: disabled ? 0.3 : 0.6 }]}>
      <Icon name={icon} size={20} color={on ? C.white : X.accent} stroke={2} />
    </Pressable>
  );
}

// ---------------- иконки блюд ----------------

type DL = { p: number; abort: AbortController } | { err: string };

/** «Иконки блюд»: цепочка источников (вкл/выкл, порядок), паки с весом (скачать/удалить), онлайн-поиск, размер, где показывать. */
export function IconsSection() {
  const { data, setIconSettings, clearIconCache, setPackDownloaded } = useStore();
  const st0 = data.icons || normalizeIconSettings(undefined);
  const set = (s: IconSettings) => setIconSettings(s);
  const [dl, setDl] = useState<Record<string, DL>>({});
  const [check, setCheck] = useState(false);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const heights = useRef<Record<string, number>>({});
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const dlRef = useRef(dl); dlRef.current = dl;

  const download = async (prefix: string) => {
    const m = packOf(prefix);
    if (!m) return;
    const abort = new AbortController();
    setDl((x) => ({ ...x, [prefix]: { p: 0, abort } }));
    try {
      const { json, bytes } = await downloadPack(m, (p) => setDl((x) => ({ ...x, [prefix]: { p, abort } })), abort.signal);
      await packStore.save(prefix, json);
      setPackDownloaded(prefix, { bytes, at: Date.now() });
      setDl((x) => { const n = { ...x }; delete n[prefix]; return n; });
    } catch (e: any) {
      if (abort.signal.aborted) setDl((x) => { const n = { ...x }; delete n[prefix]; return n; });
      else setDl((x) => ({ ...x, [prefix]: { err: e?.message || 'Ошибка сети' } }));
    }
  };
  const remove = async (prefix: string) => {
    await packStore.remove(prefix);
    setPackDownloaded(prefix, null);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={T.small}>Источники иконок по порядку: для каждого блюда берётся первая найденная иконка сверху вниз. Включайте, выключайте и двигайте источники. Долгое нажатие на иконку блюда — выбрать вручную.</Text>
      {st0.sources.map((s, i) => {
        const isPack = s.id.startsWith('pack:');
        const prefix = isPack ? s.id.slice(5) : '';
        const m = isPack ? packOf(prefix) : undefined;
        const have = isPack ? data.iconPacks?.[prefix] : undefined;
        const d = isPack ? dl[prefix] : undefined;
        const expandable = isPack || s.id === 'online';
        const expanded = expandable && s.on && openIds.includes(s.id);
        const sub = !isPack ? (s.id === 'openmoji' ? `${PACKS.find((p) => p.builtin)?.count} иконок` : s.id === 'online' ? 'нужен интернет' : s.id === 'ai-emoji' ? 'эмодзи от ИИ' : s.id === 'emoji' ? 'по словарю блюд' : 'если ничего не нашлось')
          : d && 'err' in d ? 'ошибка скачивания'
          : d ? `скачивается ${Math.round(d.p * 100)}%`
          : `${m?.count} иконок`;
        const dragging = drag?.id === s.id;
        const pan = Gesture.Pan().runOnJS(true).activeOffsetY([-4, 4])
          .onUpdate((e) => setDrag({ id: s.id, dy: e.translationY }))
          .onEnd((e) => {
            const ids = st0.sources.map((x) => x.id);
            const hs = ids.map((id) => heights.current[id] || 60);
            set(moveSourceTo(st0, i, dropIndex(hs, i, e.translationY, 10)));
            setDrag(null);
          })
          .onFinalize(() => setDrag(null));
        return (
          <View key={s.id} onLayout={(e) => { heights.current[s.id] = e.nativeEvent.layout.height; }}
            style={[st.src, !s.on && { opacity: 0.6 }, dragging && { transform: [{ translateY: drag!.dy }, { scale: 1.02 }], zIndex: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, borderColor: X.accent }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <GestureDetector gesture={pan}>
                <View accessibilityLabel={`Перетащить: ${sourceTitle(s.id)}`} style={st.handle} hitSlop={6}>
                  <Icon name="grip" size={22} color={C.muted} />
                </View>
              </GestureDetector>
              <Pressable disabled={!expandable || !s.on} style={{ flex: 1 }}
                onPress={() => setOpenIds((x) => x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id])}>
                <Text style={[T.body, { fontWeight: '600' }]} numberOfLines={1}>{sourceTitle(s.id)}</Text>
                <Text style={[T.small, { fontSize: 12 }]}>{sub}</Text>
              </Pressable>
              {expandable && s.on ? <Icon name={expanded ? 'down' : 'right'} size={18} color={C.muted} /> : null}
              <Pressable accessibilityLabel={`${s.on ? 'Выключить' : 'Включить'}: ${sourceTitle(s.id)}`} onPress={() => set(toggleSource(st0, s.id))} style={[st.sw, s.on && { backgroundColor: X.accent, borderColor: X.accent }]}>
                <Text style={{ color: s.on ? C.white : C.muted, fontWeight: '700', fontSize: 14 }}>{s.on ? 'Вкл' : 'Выкл'}</Text>
              </Pressable>
            </View>
            {expanded && isPack ? (
              <View style={{ marginTop: 8, gap: 8 }}>
                <Text style={T.small}>{have ? `скачан · ${fmtBytes(have.bytes)}` : `не скачан · ${fmtBytes(m?.bytes || 0)}`}{m ? ` · ${m.license}` : ''}{d && 'err' in d ? ` · ошибка: ${d.err}` : ''}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {d && 'p' in d ? (
                    <>
                      <View style={st.prog}><View style={[st.progIn, { width: `${Math.round(d.p * 100)}%` }]} /></View>
                      <ActBtn label="Отмена" icon="close" onPress={() => d.abort.abort()} style={{ flex: 0 }} />
                    </>
                  ) : have ? (
                    <ActBtn label={`Удалить · освободит ${fmtBytes(have.bytes)}`} icon="trash" danger onPress={() => remove(prefix)} />
                  ) : (
                    <ActBtn label={d && 'err' in d ? 'Повторить скачивание' : `Скачать · ${fmtBytes(m?.bytes || 0)}`} icon="down" onPress={() => download(prefix)} />
                  )}
                </View>
              </View>
            ) : null}
            {expanded && s.id === 'online' ? <OnlineSettings st={st0} set={set} hidden={hiddenOnlineSets(st0, data.iconPacks)} /> : null}
          </View>
        );
      })}

      <Text style={[T.label, { marginTop: 8 }]}>Что пробовать первым</Text>
      <Seg big items={[{ key: 'dict', label: 'Словарь (рус.)' }, { key: 'ai', label: 'Название от ИИ' }]} value={st0.first} onChange={(v) => set({ ...st0, first: v })} />
      <Text style={T.label}>Размер иконок</Text>
      <Seg big items={[{ key: 'S', label: 'S' }, { key: 'M', label: 'M' }, { key: 'L', label: 'L' }]} value={st0.size} onChange={(v) => set({ ...st0, size: v })} />
      <Toggle label="Иконки в дневнике" on={st0.show.diary} onChange={(v) => set({ ...st0, show: { ...st0.show, diary: v } })} />
      <Toggle label="Иконки в меню" on={st0.show.menu} onChange={(v) => set({ ...st0, show: { ...st0.show, menu: v } })} />
      <Toggle label="Иконки в карусели «Выбрать с меню»" on={st0.show.carousel} onChange={(v) => set({ ...st0, show: { ...st0.show, carousel: v } })} />

      <ActBtn label="Проверить иконки" icon="search" onPress={() => setCheck(true)} style={{ flex: 0, marginTop: 6 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ActBtn label="По умолчанию" icon="repeat" onPress={() => set({ ...defaultIconSettings(), manual: st0.manual })} />
        <ActBtn label="Сбросить кэш иконок" icon="trash" onPress={() => { clearIconCache(); Alert.alert('Готово', 'Онлайн-иконки будут найдены заново.'); }} />
      </View>
      {Object.keys(st0.manual).length ? (
        <ActBtn label={`Сбросить ручные иконки (${Object.keys(st0.manual).length})`} icon="close" danger onPress={() => set({ ...st0, manual: {} })} style={{ flex: 0 }} />
      ) : null}
      <Text style={[T.small, { marginTop: 6 }]}>Иконки: OpenMoji (CC BY-SA 4.0) · Fluent Emoji, Microsoft (MIT) · Noto Emoji, Google (Apache 2.0) · Twemoji (CC BY 4.0) · Emoji One (CC BY 4.0) · поиск и загрузка — Iconify (api.iconify.design).</Text>
      {check ? <IconCheckSheet onClose={() => setCheck(false)} /> : null}
    </View>
  );
}

function OnlineSettings({ st: s0, set, hidden }: { st: IconSettings; set: (s: IconSettings) => void; hidden: Set<string> }) {
  const o = s0.online;
  const shown = o.sets.filter((x) => !hidden.has(x.prefix));
  return (
    <View style={{ marginTop: 10, gap: 8, paddingLeft: 8, borderLeftWidth: 2, borderColor: X.soft }}>
      <Text style={T.label}>Наборы для онлайн-поиска</Text>
      {shown.length === 0 ? <Text style={T.small}>Все наборы уже скачаны или стоят выше в списке.</Text> : null}
      {shown.map((x, i) => (
        <View key={x.prefix} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: x.on ? 1 : 0.6 }}>
          <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{packOf(x.prefix)?.title || x.prefix}</Text>
          <RoundBtn icon="up" label={`Онлайн выше: ${x.prefix}`} onPress={() => set({ ...s0, online: { ...o, sets: moveSet(o.sets, x.prefix, -1) } })} disabled={i === 0} />
          <RoundBtn icon="down" label={`Онлайн ниже: ${x.prefix}`} onPress={() => set({ ...s0, online: { ...o, sets: moveSet(o.sets, x.prefix, 1) } })} disabled={i === shown.length - 1} />
          <Pressable accessibilityLabel={`Онлайн ${x.on ? 'выключить' : 'включить'}: ${x.prefix}`} onPress={() => set({ ...s0, online: { ...o, sets: toggleSet(o.sets, x.prefix) } })} style={[st.sw, x.on && { backgroundColor: X.accent, borderColor: X.accent }]}>
            <Text style={{ color: x.on ? C.white : C.muted, fontWeight: '700', fontSize: 14 }}>{x.on ? 'Вкл' : 'Выкл'}</Text>
          </Pressable>
        </View>
      ))}
      <Toggle label="Только цветные иконки" hint="если в выбранных наборах нет — искать по всем, но только цветные" on={o.coloredOnly} onChange={(v) => set({ ...s0, online: { ...o, coloredOnly: v } })} />
      <Text style={T.label}>Сколько результатов смотреть</Text>
      <Seg items={[16, 32, 64, 128].map((n) => ({ key: n, label: String(n) }))} value={o.limit} onChange={(n) => set({ ...s0, online: { ...o, limit: n } })} />
    </View>
  );
}

/** «Проверить иконки»: что вернёт каждый источник для названия (отладка). */
function IconCheckSheet({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const st0 = data.icons || normalizeIconSettings(undefined);
  const [name, setName] = useState('Борщ со сметаной');
  const [aiEmoji, setAiEmoji] = useState('');
  const [en, setEn] = useState('');
  const ctx = { settings: st0, downloaded: data.iconPacks, onlineCache: data.iconCache };
  const res = resolveIcon(name, aiEmoji || undefined, en || undefined, ctx);
  return (
    <Sheet visible onClose={onClose} title="Проверить иконки">
      <Field label="Название блюда" value={name} onChangeText={setName} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Field label="Эмодзи от ИИ" value={aiEmoji} onChangeText={setAiEmoji} style={{ flex: 1 }} />
        <Field label="Англ. название от ИИ" value={en} onChangeText={setEn} style={{ flex: 2 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <IconView r={res.ref} size={48} />
        <Text style={[T.body, { flex: 1 }]}>Итог: {res.source === 'manual' ? 'выбрана вручную' : res.source ? sourceTitle(res.source) : 'ничего'}{res.needOnline ? ' (онлайн ещё не искали)' : ''}</Text>
      </View>
      {st0.sources.filter((s) => !s.id.startsWith('pack:') || !!data.iconPacks?.[s.id.slice(5)]).map((s) => {
        const r = fromSource(s.id, name, aiEmoji || undefined, en || undefined, ctx);
        return (
          <View key={s.id} style={[st.row, { opacity: s.on ? 1 : 0.5 }]}>
            <Text style={[T.body, { flex: 1 }]}>{sourceTitle(s.id)}{s.on ? '' : ' (выкл)'}</Text>
            {r && r !== 'pending' ? <IconView r={r} size={34} /> : <Text style={T.small}>{r === 'pending' ? 'не искали' : 'нет'}</Text>}
          </View>
        );
      })}
      <Text style={[T.small, { marginTop: 8 }]}>Ключ кэша: {iconKey(name, en)}</Text>
    </Sheet>
  );
}

// ---------------- история нормы ----------------

const dateLabel = (ts: number) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${minutesLabel(d.getHours() * 60 + d.getMinutes())}`; };
const parseDate = (t: string): string | null => {
  const m = t.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getMonth() === +m[2] - 1 ? toKey(d) : null;
};

/** «История нормы»: когда и на что менялась дневная норма; правка даты/времени и чисел, удаление, добавление. */
export function TargetHistorySection() {
  const { data, saveTargetRecord, deleteTargetRecord } = useStore();
  const log = sortLog(data.targetLog || []);
  const [edit, setEdit] = useState<TargetRecord | null>(null);
  return (
    <View style={{ gap: 8 }}>
      <Text style={T.small}>При каждом изменении нормы записывается дата и новое значение. Статистика может считать каждый день по норме, которая действовала в тот день.</Text>
      {[...log].reverse().map((r, i) => (
        <Pressable key={r.id} accessibilityLabel={`Изменить запись нормы ${dateLabel(r.at)}`} onPress={() => setEdit(r)} style={({ pressed }) => [st.hist, pressed && { backgroundColor: X.tint }]}>
          <View style={{ flex: 1 }}>
            <Text style={[T.body, { fontWeight: '600' }]}>{r.kcal} ккал{i === 0 ? '  · сейчас' : ''}</Text>
            <Text style={T.small}>с {dateLabel(r.at)}{r.protein !== undefined ? ` · Б ${r.protein} Ж ${r.fat ?? '—'} У ${r.carbs ?? '—'}` : ''}</Text>
          </View>
          <Icon name="edit" size={18} color={C.muted} />
        </Pressable>
      ))}
      <ActBtn label="Добавить запись" icon="plus" onPress={() => setEdit({ id: uid(), at: Date.now(), kcal: data.targets.kcal, protein: data.targets.protein, fat: data.targets.fat, carbs: data.targets.carbs })} style={{ flex: 0 }} />
      {edit ? <TargetRecordSheet rec={edit} canDelete={log.length > 1 && log.some((r) => r.id === edit.id)} onClose={() => setEdit(null)}
        onSave={(r) => { saveTargetRecord(r); setEdit(null); }} onDelete={() => { deleteTargetRecord(edit.id); setEdit(null); }} /> : null}
    </View>
  );
}

function TargetRecordSheet({ rec, canDelete, onClose, onSave, onDelete }: { rec: TargetRecord; canDelete: boolean; onClose: () => void; onSave: (r: TargetRecord) => void; onDelete: () => void }) {
  const d0 = new Date(rec.at);
  const [dateT, setDateT] = useState(`${String(d0.getDate()).padStart(2, '0')}.${String(d0.getMonth() + 1).padStart(2, '0')}.${d0.getFullYear()}`);
  const [timeT, setTimeT] = useState(minutesLabel(d0.getHours() * 60 + d0.getMinutes()));
  const [r, setR] = useState(rec);
  const day = parseDate(dateT);
  const min = parseTime(timeT);
  const ok = !!day && min !== null && r.kcal > 0;
  return (
    <Sheet visible onClose={onClose} title="Запись нормы"
      footer={<View style={{ gap: 8 }}>
        <Btn label="Сохранить" disabled={!ok} onPress={() => onSave({ ...r, at: timestampAt(day!, min!) })} style={{ paddingVertical: 16 }} />
        {canDelete ? <ActBtn label="Удалить запись" icon="trash" danger onPress={onDelete} style={{ flex: 0 }} /> : null}
      </View>}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Дата (ДД.ММ.ГГГГ)" value={dateT} onChangeText={setDateT} keyboardType="numbers-and-punctuation" style={{ flex: 3 }} />
        <Field label="Время" value={timeT} onChangeText={(t) => setTimeT(formatTimeInput(t))} keyboardType="number-pad" style={{ flex: 2 }} />
      </View>
      {!day ? <Text style={[T.small, { color: C.over, marginTop: 4 }]}>Дата в формате 31.10.2026</Text> : null}
      <NumField label="Калории в день" suffix="ккал" value={r.kcal} onChange={(n) => setR({ ...r, kcal: Math.round(n) })} style={{ marginTop: 10 }} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <NumField optional label="Белки" suffix="г" value={r.protein} onChange={(n) => setR({ ...r, protein: n })} style={{ flex: 1 }} />
        <NumField optional label="Жиры" suffix="г" value={r.fat} onChange={(n) => setR({ ...r, fat: n })} style={{ flex: 1 }} />
        <NumField optional label="Углев." suffix="г" value={r.carbs} onChange={(n) => setR({ ...r, carbs: n })} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 6 },
  sw: { minWidth: 64, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface },
  handle: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: X.tint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  src: { padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  prog: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.line, overflow: 'hidden', alignSelf: 'center' },
  progIn: { height: 10, backgroundColor: X.accent },
  hist: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
});
