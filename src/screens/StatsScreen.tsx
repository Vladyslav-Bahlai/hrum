import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { C, T } from '../theme';
import { ActBtn, Btn, Hair, NumField, Seg, Sheet, Unk } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { DayBars, Legend, LineChart, SplitBar } from '../ui/charts';
import { useStore } from '../store';
import { Entry } from '../types';
import { addDays, fmt, fromKey, hasAnyMacros, known, kcalOf, getMeals, nut, r0, r1, shortDate, sum, todayKey, WD_SHORT, plural } from '../utils';

type Period = 7 | 30 | 90;

export function StatsScreen({ onFill }: { onFill?: () => void }) {
  const store = useStore();
  const { data } = store;
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>(7);
  const [sel, setSel] = useState<string | undefined>();
  const [wOpen, setWOpen] = useState(false);
  const cw = width - 40;
  const tg = data.targets;

  const s = useMemo(() => {
    const today = todayKey();
    const from = addDays(today, -(period - 1));
    const byDay: Record<string, Entry[]> = {};
    for (const e of data.entries) if (e.date >= from && e.date <= today) (byDay[e.date] ||= []).push(e);
    const days = Array.from({ length: period }, (_, i) => addDays(from, i));
    const series = days.map((k) => {
      const t = byDay[k] ? sum(byDay[k]) : null;
      return {
        key: k,
        label: period === 7 ? WD_SHORT[fromKey(k).getDay()] : String(fromKey(k).getDate()),
        value: t?.kcal || 0,
        unk: t?.unk.kcal || 0,
        cnt: t?.count || 0,
      };
    });
    // день «с записями» — даже если в нём одни блюда без калорийности: человек что-то съел
    const logged = series.filter((d) => d.cnt > 0);
    const full = logged.filter((d) => !d.unk); // дни без пробелов по калориям — только по ним судим «в норме / перебор»
    const n = logged.length || 1;
    const all = Object.values(byDay).flat();
    const tot = sum(all);
    const inNorm = full.filter((d) => d.value >= tg.kcal * 0.85 && d.value <= tg.kcal * 1.05).length;
    const over = full.filter((d) => d.value > tg.kcal * 1.05).length;

    // по приёмам пищи
    const meals = getMeals().map((m) => { const t = sum(all.filter((e) => e.meal === m.key)); return { ...m, kcal: t.kcal, unk: t.unk.kcal, cnt: t.count }; });
    // блюда
    const cnt: Record<string, { name: string; n: number; kcal: number; unk: number }> = {};
    for (const e of all) {
      const k = e.item.name.toLowerCase();
      const c = cnt[k] || (cnt[k] = { name: e.item.name, n: 0, kcal: 0, unk: 0 });
      c.n++;
      c.kcal += nut(e.item, e.portion).kcal;
      if (!known(e.item).kcal) c.unk++;
    }
    const top = Object.values(cnt).sort((a, b) => b.n - a.n).slice(0, 5);
    const heavy = Object.values(cnt).filter((c) => c.kcal > 0).sort((a, b) => b.kcal - a.kcal).slice(0, 3);
    const noKcalDishes = Object.values(cnt).filter((c) => c.unk > 0 && c.kcal === 0).sort((a, b) => b.n - a.n).slice(0, 3);
    // по дням недели
    const wd = [1, 2, 3, 4, 5, 6, 0].map((w) => {
      const ds = logged.filter((d) => fromKey(d.key).getDay() === w);
      return { w, avg: ds.length ? ds.reduce((a, b) => a + b.value, 0) / ds.length : 0, unk: ds.some((d) => d.unk) };
    });
    // серия дней с записями (до сегодня или вчера)
    let streak = 0;
    const dates = new Set(data.entries.map((e) => e.date));
    let k = dates.has(today) ? today : addDays(today, -1);
    while (dates.has(k)) { streak++; k = addDays(k, -1); }
    // средняя «последняя еда»
    const lastTimes = Object.values(byDay).map((es) => { const d = new Date(Math.max(...es.map((e) => e.time))); return d.getHours() * 60 + d.getMinutes(); });
    const lastAvg = lastTimes.length ? lastTimes.reduce((a, b) => a + b, 0) / lastTimes.length : 0;
    const water = days.map((d) => data.water[d] || 0).filter(Boolean);
    const ai = all.filter((e) => e.source.startsWith('ai')).length;
    const balance = full.reduce((a, d) => a + (d.value - tg.kcal), 0);
    // калории блюд, у которых нет разбивки на БЖУ — серый сегмент в полосе БЖУ
    const kcalNoMacro = all.filter((e) => !hasAnyMacros(e.item)).reduce((a, e) => a + kcalOf(e.item, e.portion), 0);
    return {
      series, logged: logged.length, full: full.length, partialDays: logged.length - full.length,
      avg: logged.reduce((a, b) => a + b.value, 0) / n,
      avgP: tot.protein / n, avgF: tot.fat / n, avgC: tot.carbs / n, avgFiber: tot.fiber / n, avgSugar: tot.sugar / n,
      inNorm, over, meals, mealsTotal: tot.kcal || 1, top, heavy, noKcalDishes, wd, streak, lastAvg,
      waterAvg: water.length ? water.reduce((a, b) => a + b, 0) / water.length : 0,
      count: all.length, ai, balance, unk: tot.unk, kcalNoMacro: kcalNoMacro / n,
    };
  }, [data.entries, data.water, period, tg.kcal]);

  const weights = data.weights.filter((w) => w.date >= addDays(todayKey(), -Math.max(period, 30)));
  const wDelta = weights.length >= 2 ? weights[weights.length - 1].kg - weights[0].kg : 0;
  const selDay = sel ? s.series.find((d) => d.key === sel) : undefined;
  const pk = s.avgP * 4, fk = s.avgF * 9, ck = s.avgC * 4, uk = s.kcalNoMacro, mk = pk + fk + ck + uk || 1;
  const incomplete = s.unk.any;
  const completePct = s.count ? Math.round(((s.count - incomplete) / s.count) * 100) : 100;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <Seg items={[{ key: 7, label: 'Неделя' }, { key: 30, label: 'Месяц' }, { key: 90, label: '3 месяца' }]} value={period}
        onChange={(p) => { setPeriod(p); setSel(undefined); }} />

      {/* полнота данных — сразу видно, насколько можно доверять цифрам ниже */}
      {s.count ? (
        <View style={[st.complete, incomplete ? null : { backgroundColor: C.accentTint }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={st.qDot}><Text style={{ fontSize: 12, fontWeight: '700', color: incomplete ? C.muted : C.accent }}>{incomplete ? '?' : '✓'}</Text></View>
            <Text style={[T.body, { flex: 1, fontWeight: '600' }]}>
              {incomplete ? `Данные полные на ${completePct}%` : 'Все записи с полными данными'}
            </Text>
          </View>
          <View style={st.cBar}>
            <View style={{ flex: Math.max(completePct, 0.01), backgroundColor: C.accent }} />
            {incomplete ? <View style={{ flex: 100 - completePct, backgroundColor: C.line }} /> : null}
          </View>
          {incomplete ? (
            <>
              <Text style={[T.small, { marginTop: 8 }]}>
                {[s.unk.kcal ? `${s.unk.kcal} ${plural(s.unk.kcal, 'запись', 'записи', 'записей')} без калорий` : '',
                  s.unk.anyMacro ? `${s.unk.anyMacro} без БЖУ` : ''].filter(Boolean).join(' · ')}.
                {' '}Цифры ниже — минимум: «+?» показывает, где что-то не учтено.
              </Text>
              {onFill ? <ActBtn label="Заполнить пробелы" icon="edit" onPress={onFill} style={{ flex: 0, marginTop: 10 }} /> : null}
            </>
          ) : null}
        </View>
      ) : null}

      {/* главные числа */}
      <View style={st.grid}>
        <Stat label="В среднем" value={fmt(s.avg)} unk={!!s.unk.kcal} unit="ккал/день" />
        <Stat label="В норме" value={`${s.inNorm}`} unit={`из ${s.full} ${plural(s.full, 'дня', 'дней', 'дней')}`}
          note={s.partialDays ? `+ ${s.partialDays} ${plural(s.partialDays, 'день', 'дня', 'дней')} без части данных` : undefined} />
        <Stat label="Баланс" value={(s.balance > 0 ? '+' : '') + fmt(s.balance)} unit="ккал к норме" tone={s.balance > 0 ? C.over : C.accent}
          note={s.partialDays ? 'дни с пробелами не считаются' : undefined} />
        <Stat label="Подряд" value={`${s.streak}`} unit={plural(s.streak, 'день с записями', 'дня с записями', 'дней с записями')} />
      </View>

      {/* график */}
      <View style={st.block}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
          <Text style={[T.h3, { flex: 1 }]}>Калории по дням</Text>
          <Text style={T.small}>— норма {fmt(tg.kcal)}</Text>
        </View>
        <DayBars data={s.series} target={tg.kcal} width={cw} onPress={(k) => setSel(sel === k ? undefined : k)} selected={sel} />
        <Text style={[T.small, { marginTop: 6, minHeight: 17 }]}>
          {selDay
            ? `${shortDate(selDay.key)}: ${fmt(selDay.value)}${selDay.unk ? ' +?' : ''} ккал${selDay.unk ? ` · ${selDay.unk} ${plural(selDay.unk, 'запись', 'записи', 'записей')} без калорий` : selDay.value ? ` (${(selDay.value > tg.kcal ? '+' : '') + fmt(selDay.value - tg.kcal)} к норме)` : ' · нет записей'}`
            : 'Нажмите на столбец, чтобы увидеть день'}
        </Text>
        {s.series.some((d) => d.unk) ? <Legend items={[{ color: C.line, label: '«?» — съедено, но калорий неизвестно: столбик на деле выше', unknown: true }]} /> : null}
      </View>

      {/* БЖУ */}
      <View style={st.block}>
        <Text style={[T.h3, { marginBottom: 12 }]}>Белки, жиры, углеводы</Text>
        <SplitBar parts={[{ v: pk, color: C.protein }, { v: fk, color: C.fat }, { v: ck, color: C.carbs }, { v: uk, color: C.line, unknown: true }]} />
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <MacroStat label="Белки" v={s.avgP} t={tg.protein} share={pk / mk} color={C.protein} unk={s.unk.protein} />
          <MacroStat label="Жиры" v={s.avgF} t={tg.fat} share={fk / mk} color={C.fat} unk={s.unk.fat} />
          <MacroStat label="Углеводы" v={s.avgC} t={tg.carbs} share={ck / mk} color={C.carbs} unk={s.unk.carbs} />
        </View>
        {uk > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Legend items={[{ color: C.line, unknown: true, label: `Без разбивки на БЖУ ${r0((uk / mk) * 100)}% калорий` }]} />
          </View>
        ) : null}
        <Text style={[T.small, { marginTop: 10 }]}>
          Средние за день · клетчатка {r1(s.avgFiber)} г (норма ~25–30) · сахар {r1(s.avgSugar)} г
        </Text>
      </View>

      {/* приёмы пищи */}
      <View style={st.block}>
        <Text style={[T.h3, { marginBottom: 12 }]}>Когда вы едите</Text>
        <SplitBar parts={s.meals.map((m, i) => ({ v: m.kcal, color: [C.accent, '#6F9C7F', '#A9C4AE', C.fat][i] }))} />
        <View style={{ marginTop: 10 }}>
          <Legend items={s.meals.map((m, i) => ({
            color: [C.accent, '#6F9C7F', '#A9C4AE', C.fat][i],
            label: `${m.label} ${r0((m.kcal / s.mealsTotal) * 100)}%${m.unk ? ` +? (${m.unk} без ккал)` : ''}`,
          }))} />
        </View>
        {s.lastAvg ? (
          <Text style={[T.small, { marginTop: 10 }]}>Последний приём пищи в среднем в {Math.floor(s.lastAvg / 60)}:{String(Math.round(s.lastAvg % 60)).padStart(2, '0')}</Text>
        ) : null}
      </View>

      {/* дни недели */}
      {period > 7 ? (
        <View style={st.block}>
          <Text style={[T.h3, { marginBottom: 12 }]}>По дням недели</Text>
          {s.wd.map((d) => (
            <View key={d.w} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
              <Text style={[T.small, { width: 28 }]}>{WD_SHORT[d.w]}</Text>
              <View style={{ flex: 1, height: 8, backgroundColor: C.line, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, (d.avg / (tg.kcal * 1.4)) * 100)}%`, height: 8, backgroundColor: d.avg > tg.kcal * 1.05 ? C.over : C.accent, borderRadius: 4 }} />
              </View>
              <Text style={[T.small, T.num, { width: 64, textAlign: 'right' }]}>{d.avg || d.unk ? fmt(d.avg) : '—'}{d.unk ? <Unk /> : null}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* вес */}
      <View style={st.block}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
          <Text style={[T.h3, { flex: 1 }]}>Вес</Text>
          {weights.length >= 2 ? (
            <Text style={[T.small, { color: wDelta <= 0 ? C.accent : C.over, fontWeight: '600' }]}>{wDelta > 0 ? '+' : ''}{r1(wDelta)} кг</Text>
          ) : null}
        </View>
        {weights.length >= 2 ? (
          <LineChart width={cw} points={weights.map((w) => ({ label: shortDate(w.date), v: w.kg }))} />
        ) : (
          <Text style={T.small}>{weights.length ? `Последний: ${data.weights[data.weights.length - 1].kg} кг. Добавьте ещё одно взвешивание — появится график.` : 'Записывайте вес раз в несколько дней — здесь появится график.'}</Text>
        )}
        <Btn label="Записать вес" kind="soft" icon="scale" onPress={() => setWOpen(true)} style={{ marginTop: 12 }} />
      </View>

      {/* блюда */}
      {s.top.length ? (
        <View style={st.block}>
          <Text style={[T.h3, { marginBottom: 6 }]}>Чаще всего</Text>
          {s.top.map((t, i) => (
            <View key={i} style={st.line}>
              <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
              {t.unk ? <Text style={[T.small, { color: C.muted, marginRight: 10 }]}>{t.unk === t.n ? 'ккал —' : `ккал —  ${t.unk}/${t.n}`}</Text> : null}
              <Text style={[T.small, T.num]}>{t.n}×</Text>
            </View>
          ))}
          {s.heavy.length ? <Text style={[T.h3, { marginTop: 16, marginBottom: 6 }]}>Больше всего калорий дали</Text> : null}
          {s.heavy.map((t, i) => (
            <View key={i} style={st.line}>
              <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
              <Text style={[T.small, T.num]}>{fmt(t.kcal)}{t.unk ? <Unk /> : null} ккал · {r0((t.kcal / s.mealsTotal) * 100)}%</Text>
            </View>
          ))}
          {s.noKcalDishes.map((t, i) => (
            <View key={'u' + i} style={st.line}>
              <View style={st.qDotSm}><Text style={{ fontSize: 10, fontWeight: '700', color: C.muted }}>?</Text></View>
              <Text style={[T.body, { flex: 1, color: C.inkSoft }]} numberOfLines={1}>{t.name}</Text>
              <Text style={[T.small, { color: C.muted }]}>{t.n}× · ккал неизвестны</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Hair style={{ marginTop: 22 }} />
      <Text style={[T.small, { marginTop: 10 }]}>
        Записей за период: {s.count}{s.count ? ` · через ИИ ${r0((s.ai / s.count) * 100)}%` : ''}{incomplete ? ` · с пробелами ${incomplete}` : ''}{s.waterAvg ? ` · воды в среднем ${(s.waterAvg * 0.25).toFixed(1).replace('.', ',')} л` : ''}
      </Text>

      <WeightSheet visible={wOpen} onClose={() => setWOpen(false)} />
    </ScrollView>
  );
}

function Stat({ label, value, unit, tone, unk, note }: { label: string; value: string; unit: string; tone?: string; unk?: boolean; note?: string }) {
  return (
    <View style={st.stat}>
      <Text style={T.small}>{label}</Text>
      <Text style={[T.h1, { color: tone || C.ink, marginTop: 2 }]}>{value}{unk ? <Unk style={{ fontSize: 18 }} /> : null}</Text>
      <Text style={T.small}>{unit}</Text>
      {note ? <Text style={[T.small, { color: C.muted, marginTop: 2, fontSize: 11.5 }]}>{note}</Text> : null}
    </View>
  );
}

function MacroStat({ label, v, t, share, color, unk }: { label: string; v: number; t: number; share: number; color: string; unk?: number }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={T.small}>{label}</Text>
      </View>
      <Text style={[T.body, T.num, { fontWeight: '600', marginTop: 3 }]}>{r0(v)} г{unk ? <Unk /> : null}</Text>
      <Text style={T.small}>{r0(share * 100)}% · цель {t}</Text>
    </View>
  );
}

function WeightSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const store = useStore();
  const last = store.data.weights[store.data.weights.length - 1]?.kg || store.data.profile.weight;
  const [kg, setKg] = useState(last);
  const recent = [...store.data.weights].reverse().slice(0, 6);
  return (
    <Sheet visible={visible} onClose={onClose} title="Вес сегодня"
      footer={<Btn label="Сохранить" onPress={() => { if (kg > 20) { store.addWeight({ date: todayKey(), kg: Math.round(kg * 10) / 10 }); onClose(); } }} style={{ paddingVertical: 16 }} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => setKg((k) => Math.round((k - 0.1) * 10) / 10)} style={st.step}><Text style={st.stepT}>−</Text></Pressable>
        <NumField value={kg} onChange={setKg} suffix="кг" style={{ flex: 1 }} />
        <Pressable onPress={() => setKg((k) => Math.round((k + 0.1) * 10) / 10)} style={st.step}><Text style={st.stepT}>+</Text></Pressable>
      </View>
      {recent.length ? (
        <View style={{ marginTop: 16 }}>
          {recent.map((w) => (
            <View key={w.date} style={st.line}>
              <Text style={[T.body, { flex: 1 }]}>{shortDate(w.date)}</Text>
              <Text style={[T.body, T.num]}>{w.kg} кг</Text>
              <Pressable hitSlop={10} onPress={() => store.removeWeight(w.date)} style={{ marginLeft: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: C.overSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trash" size={18} color={C.over} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  complete: { marginTop: 18, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  cBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 10, backgroundColor: C.line },
  qDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  qDotSm: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, borderRadius: 12, overflow: 'hidden', backgroundColor: C.surface },
  stat: { width: '50%', padding: 14, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  block: { marginTop: 26 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  step: { width: 52, height: 48, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontSize: 24, color: C.accent },
});
