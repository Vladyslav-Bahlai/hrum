import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../ui/RNText';
import { play } from '../sound';
import { C, T } from '../theme';
import { ActBtn, Btn, NumField, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useStore } from '../store';
import { analyzeFood } from '../ai';
import { getKey } from '../storage';
import { FoodItem } from '../types';
import { addDays, known, plural, todayKey } from '../utils';

type F = 'kcal' | 'protein' | 'fat' | 'carbs';
const FIELDS: { k: F; label: string }[] = [
  { k: 'kcal', label: 'Ккал' }, { k: 'protein', label: 'Белки' }, { k: 'fat', label: 'Жиры' }, { k: 'carbs', label: 'Углев.' },
];
type Vals = Partial<Record<F, number>>;
type Period = 'today' | 'week' | 'all';

const keyOf = (name: string) => name.trim().toLowerCase();

/** Сначала сбрасываем «нули-пустышки» (БЖУ не заполнены), потом вписываем только то, что действительно ввели. */
function fillItem(item: FoodItem, vals: Vals): FoodItem {
  const k = known(item);
  const out: FoodItem = { ...item };
  for (const f of ['kcal', 'protein', 'fat', 'carbs'] as F[]) {
    if (!k[f]) out[f] = undefined; // неизвестное остаётся неизвестным, а не нулём
    if (!k[f] && typeof vals[f] === 'number') out[f] = vals[f];
  }
  return out;
}

/** Быстрое заполнение пробелов: блюда без калорий/БЖУ за сегодня или неделю — одним списком. */
export function FillScreen({ topInset }: { topInset: number }) {
  const store = useStore();
  const { data } = store;
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('today');
  const [drafts, setDrafts] = useState<Record<string, Vals>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [aiSet, setAiSet] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // что уже где-то известно про блюдо с таким названием: «Мои блюда» → меню → прошлые записи
  const best = useMemo(() => {
    const map = new Map<string, Vals>();
    const feed = (item: FoodItem) => {
      const k = keyOf(item.name);
      if (!k) return;
      const kn = known(item);
      const cur = map.get(k) || {};
      for (const f of ['kcal', 'protein', 'fat', 'carbs'] as F[]) if (cur[f] === undefined && kn[f]) cur[f] = item[f];
      map.set(k, cur);
    };
    data.favorites.forEach((f) => feed(f.item));
    data.menus.forEach((m) => m.items.forEach(feed));
    [...data.entries].sort((a, b) => b.time - a.time).forEach((e) => feed(e.item));
    return map;
  }, [data.entries, data.menus, data.favorites]);

  const groups = useMemo(() => {
    const today = todayKey();
    const from = period === 'today' ? today : period === 'week' ? addDays(today, -6) : '0000-00-00';
    const map = new Map<string, { key: string; name: string; ids: string[]; dates: Set<string>; missing: Record<F, boolean>; have: Vals }>();
    for (const e of data.entries) {
      if (e.date < from || e.date > today) continue;
      const kn = known(e.item);
      if (kn.kcal && kn.protein && kn.fat && kn.carbs) continue;
      const k = keyOf(e.item.name);
      if (!k) continue;
      const g = map.get(k) || { key: k, name: e.item.name, ids: [], dates: new Set<string>(), missing: { kcal: false, protein: false, fat: false, carbs: false }, have: {} };
      g.ids.push(e.id);
      g.dates.add(e.date);
      for (const f of ['kcal', 'protein', 'fat', 'carbs'] as F[]) {
        if (!kn[f]) g.missing[f] = true;
        else if (g.have[f] === undefined) g.have[f] = e.item[f];
      }
      map.set(k, g);
    }
    return [...map.values()]
      .map((g) => {
        // подсказка — только для недостающих полей и только если она где-то уже известна
        const suggest: Vals = {};
        const b = best.get(g.key) || {};
        for (const f of ['kcal', 'protein', 'fat', 'carbs'] as F[]) if (g.missing[f] && b[f] !== undefined) suggest[f] = b[f];
        return { ...g, suggest };
      })
      .sort((a, b) => b.ids.length - a.ids.length);
  }, [data.entries, period, best]);

  const visible = groups.filter((g) => !skipped.has(g.key));
  const valsOf = (g: (typeof groups)[number]): Vals => drafts[g.key] ?? g.suggest;
  const hasVals = (g: (typeof groups)[number]) => FIELDS.some((f) => g.missing[f.k] && typeof valsOf(g)[f.k] === 'number');
  const readyGroups = visible.filter(hasVals);

  const setVal = (g: (typeof groups)[number], f: F, n: number | undefined) =>
    setDrafts((d) => ({ ...d, [g.key]: { ...(d[g.key] ?? g.suggest), [f]: n } }));

  /** Заполняет блюдо везде: в дневнике (за всё время), в меню и в «Моих блюдах» — только пустые поля. */
  const applyMany = (list: typeof groups) => {
    if (!list.length) return;
    const snap = { entries: data.entries, menus: data.menus, favorites: data.favorites };
    const byKey = new Map(list.map((g) => [g.key, valsOf(g)]));
    let touched = 0;
    store.update((d) => ({
      ...d,
      entries: d.entries.map((e) => {
        const v = byKey.get(keyOf(e.item.name));
        if (!v) return e;
        const next = fillItem(e.item, v);
        if (JSON.stringify(next) === JSON.stringify(e.item)) return e;
        touched++;
        return { ...e, item: next };
      }),
      menus: d.menus.map((m) => ({ ...m, items: m.items.map((it) => { const v = byKey.get(keyOf(it.name)); return v ? fillItem(it, v) : it; }) })),
      favorites: d.favorites.map((f) => { const v = byKey.get(keyOf(f.item.name)); return v ? { ...f, item: fillItem(f.item, v) } : f; }),
    }));
    play('saved');
    setDrafts((d) => { const n = { ...d }; list.forEach((g) => delete n[g.key]); return n; });
    toast({
      text: list.length === 1 ? `«${list[0].name}» заполнено везде` : `Заполнено блюд: ${list.length}`,
      action: 'Отменить',
      onAction: () => store.update((d) => ({ ...d, ...snap })),
    });
    void touched;
  };

  /** Одна просьба к ИИ по всем неполным блюдам сразу; результат — только предложения, их можно поправить. */
  const askAI = async () => {
    const todo = visible.filter((g) => !hasVals(g) || FIELDS.some((f) => g.missing[f.k] && valsOf(g)[f.k] === undefined));
    if (!todo.length) return;
    const key = await getKey(data.ai.provider);
    if (!key) { Alert.alert('Нет ключа ИИ', 'Добавьте ключ в настройках — или заполните значения вручную.'); return; }
    setBusy(true);
    try {
      const list = todo.slice(0, 25);
      const text = `Оцени пищевую ценность ОДНОЙ стандартной порции каждого блюда из списка. Верни РОВНО ${list.length} позиций в том же порядке, по одной на строку списка. Название оставь как есть.\n` +
        list.map((g, i) => `${i + 1}. ${g.name}`).join('\n');
      const res = await analyzeFood(data.ai, key, text, [], { mode: 'eat' });
      const byIndex = res.items.length === list.length;
      const picked = new Set(aiSet);
      const nextDrafts = { ...drafts };
      list.forEach((g, i) => {
        const it = byIndex ? res.items[i] : res.items.find((x) => keyOf(x.name) === g.key);
        if (!it) return;
        const cur = { ...(nextDrafts[g.key] ?? g.suggest) };
        let any = false;
        for (const f of ['kcal', 'protein', 'fat', 'carbs'] as F[]) {
          if (g.missing[f] && cur[f] === undefined && typeof it[f] === 'number') { cur[f] = it[f]; any = true; }
        }
        if (any) { nextDrafts[g.key] = cur; picked.add(g.key); }
      });
      setDrafts(nextDrafts);
      setAiSet(picked);
      play('ai');
    } catch (e: any) {
      Alert.alert('Не получилось', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const entriesCount = visible.reduce((a, g) => a + g.ids.length, 0);
  const periodText = period === 'today' ? 'сегодня' : period === 'week' ? 'за неделю' : 'за всё время';

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.head, { paddingTop: topInset + 10 }]}>
        <Text style={T.h2}>Дополнить данные</Text>
        <Text style={[T.small, { marginTop: 3 }]}>Блюда без калорий или БЖУ. Заполнили один раз — подставится во все такие записи.</Text>
        <Seg items={[{ key: 'today', label: 'Сегодня' }, { key: 'week', label: 'Неделя' }, { key: 'all', label: 'Всё время' }]}
          value={period} onChange={(p) => setPeriod(p)} style={{ marginTop: 12 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {visible.length ? (
          <>
            <View style={{ gap: 8, marginBottom: 12 }}>
              <ActBtn label={busy ? 'ИИ считает…' : 'Заполнить через ИИ'} icon="sparkle" onPress={askAI} style={{ flex: 0 }} />
              {readyGroups.length ? (
                <Btn label={`Применить всё · ${readyGroups.length} ${plural(readyGroups.length, 'блюдо', 'блюда', 'блюд')}`} icon="check" onPress={() => applyMany(readyGroups)} />
              ) : null}
            </View>
            <Text style={[T.small, { marginBottom: 10, marginLeft: 2 }]}>
              {visible.length} {plural(visible.length, 'блюдо', 'блюда', 'блюд')} · {entriesCount} {plural(entriesCount, 'запись', 'записи', 'записей')} {periodText}
            </Text>

            {visible.map((g) => {
              const v = valsOf(g);
              const missing = FIELDS.filter((f) => g.missing[f.k]);
              const haveTxt = [
                g.have.kcal !== undefined && !g.missing.kcal ? `${Math.round(g.have.kcal)} ккал` : '',
                !g.missing.protein && g.have.protein !== undefined ? `Б ${g.have.protein}` : '',
                !g.missing.fat && g.have.fat !== undefined ? `Ж ${g.have.fat}` : '',
                !g.missing.carbs && g.have.carbs !== undefined ? `У ${g.have.carbs}` : '',
              ].filter(Boolean).join(' · ');
              const fromLib = Object.keys(g.suggest).length > 0 && !drafts[g.key];
              const ai = aiSet.has(g.key);
              return (
                <View key={g.key} style={st.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={T.h3} numberOfLines={2}>{g.name}</Text>
                      <Text style={[T.small, { marginTop: 2 }]}>
                        {g.ids.length} {plural(g.ids.length, 'запись', 'записи', 'записей')}
                        {g.dates.size > 1 ? ` · ${g.dates.size} ${plural(g.dates.size, 'день', 'дня', 'дней')}` : ''}
                        {haveTxt ? ` · есть: ${haveTxt}` : ''}
                      </Text>
                    </View>
                    <ActBtn label="" icon="close" onPress={() => setSkipped((s) => new Set(s).add(g.key))}
                      style={{ flex: 0, flexGrow: 0, flexShrink: 0, width: 44, minHeight: 44, paddingHorizontal: 0, backgroundColor: 'transparent', borderWidth: 0 }} />
                  </View>

                  {fromLib || ai ? (
                    <View style={st.badge}>
                      <Icon name={ai ? 'sparkle' : 'star'} size={13} color={C.accent} />
                      <Text style={{ fontSize: 12.5, color: C.accent, fontWeight: '600' }}>{ai ? 'оценка ИИ — проверьте' : 'подставлено из ваших данных'}</Text>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    {missing.map((f) => (
                      <NumField key={f.k} optional label={f.label} placeholder="?" value={v[f.k]} onChange={(n) => setVal(g, f.k, n)} style={{ flex: 1 }} />
                    ))}
                  </View>

                  <Btn label={`Заполнить везде · ${g.ids.length} ${plural(g.ids.length, 'запись', 'записи', 'записей')}`} kind="soft" icon="check"
                    disabled={!hasVals(g)} onPress={() => applyMany([g])} style={{ marginTop: 12 }} />
                </View>
              );
            })}
          </>
        ) : (
          <View style={st.empty}>
            <Text style={[T.h2, { textAlign: 'center' }]}>{groups.length ? 'Всё отложено' : 'Пробелов нет ✓'}</Text>
            <Text style={[T.bodySoft, { textAlign: 'center', marginTop: 8 }]}>
              {groups.length
                ? 'Остальные блюда вы скрыли на время. Переключите период, чтобы увидеть их снова.'
                : period === 'all'
                  ? 'У всех записей указаны калории и БЖУ.'
                  : `${period === 'today' ? 'Сегодня' : 'За неделю'} все записи с полными данными. Проверьте «Всё время», если нужно.`}
            </Text>
            {groups.length ? <ActBtn label="Показать скрытые" icon="repeat" onPress={() => setSkipped(new Set())} style={{ flex: 0, alignSelf: 'stretch', marginTop: 14 }} /> : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingBottom: 6, backgroundColor: C.paper },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, backgroundColor: C.accentSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  empty: { backgroundColor: C.surface, borderRadius: 16, padding: 24, marginTop: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
});
