import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../ui/RNText';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { C, T } from '../theme';
import { Icon } from '../ui/Icon';
import { ActBtn, Btn, Chip, Field, Hair, NumField, Seg } from '../ui/kit';
import { useStore, defaultData } from '../store';
import { IconsSection, TargetHistorySection } from './SettingsExtra';
import { DEFAULT_MODELS, listModels, pickModel } from '../ai';
import { getKey, importSound, readTextFile, setKey, storagePath, writeBackup } from '../storage';
import { MealDef, Profile, Provider } from '../types';
import { ACTIVITY, calcTargets, DEFAULT_MEALS, kcalText, minutesLabel, uid } from '../utils';
import { buildChatContext, chatSettings, CTX_PRESETS, estimateTokens, KEEP_OPTIONS, sameCtx, tokensLabel } from '../chat';
import { ChatContextOpts } from '../types';
import { dropPlayer, EVENTS, preview, SOUND_NAMES, VOLUMES, setSoundVolume } from '../sound';

export function AISection() {
  const { data, update } = useStore();
  const provider = data.ai.provider;
  return (
    <View>
      <Seg items={[{ key: 'gemini' as Provider, label: 'Google Gemini' }, { key: 'claude' as Provider, label: 'Anthropic Claude' }]}
        value={provider} onChange={(p) => update((d) => ({ ...d, ai: { ...d.ai, provider: p } }))} />
      <KeyForm provider={provider} />
    </View>
  );
}

function KeyForm({ provider }: { provider: 'claude' | 'gemini' }) {
  const { data, update, cacheModels, toggleFavModel } = useStore();
  const [key, setK] = useState('');
  const [saved, setSaved] = useState('');
  const models = data.ai.models?.[provider] || [];
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'err'>('idle');
  const [err, setErr] = useState('');

  useEffect(() => {
    getKey(provider).then((k) => { setK(k); setSaved(k); setState('idle'); });
  }, [provider]);

  const model = provider === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  const setModel = (m: string) => update((d) => ({ ...d, ai: { ...d.ai, [provider === 'claude' ? 'claudeModel' : 'geminiModel']: m } }));

  const check = async () => {
    setState('checking'); setErr('');
    try {
      const k = key.trim();
      const list = await listModels(provider, k);
      await setKey(provider, k);
      setSaved(k);
      cacheModels(provider, list);
      if (!list.includes(model)) setModel(pickModel(provider, list));
      setState('ok');
    } catch (e: any) {
      setErr(e?.message || String(e));
      setState('err');
    }
  };

  const mask = (k: string) => (k.length > 12 ? k.slice(0, 7) + '•••' + k.slice(-4) : k);

  return (
    <View>
      <Text style={[T.small, { marginTop: 10, lineHeight: 18 }]}>
        {provider === 'gemini'
          ? 'Ключ бесплатно создаётся в Google AI Studio за минуту (есть бесплатный лимит запросов).'
          : 'Ключ создаётся в Anthropic Console; оплата по факту запросов (доли цента за фото).'}
      </Text>
      <ActBtn label={provider === 'gemini' ? 'Получить ключ Gemini' : 'Получить ключ Claude'} icon="sparkle"
        onPress={() => Linking.openURL(provider === 'gemini' ? 'https://aistudio.google.com/app/apikey' : 'https://console.anthropic.com/settings/keys')} style={{ flex: 0, marginTop: 10 }} />
      <Field value={key} onChangeText={(t) => { setK(t); setState('idle'); }} placeholder={provider === 'gemini' ? 'AIza…' : 'sk-ant-…'}
        autoCapitalize="none" autoCorrect={false} secureTextEntry={!!saved && key === saved} style={{ marginTop: 12 }} />
      {saved && key === saved ? <Text style={[T.small, { marginTop: 5 }]}>Сохранён: {mask(saved)}</Text> : null}
      <Btn label={state === 'checking' ? 'Проверяю…' : 'Проверить и сохранить'} onPress={check} disabled={!key.trim() || state === 'checking'}
        style={{ marginTop: 10 }} kind={state === 'ok' ? 'soft' : 'primary'} icon={state === 'ok' ? 'check' : undefined} />
      {state === 'checking' ? <ActivityIndicator style={{ marginTop: 8 }} color={C.accent} /> : null}
      {state === 'err' ? <Text style={[T.small, { color: C.over, marginTop: 8 }]}>{err}</Text> : null}
      {state === 'ok' ? <Text style={[T.small, { color: C.accent, marginTop: 8 }]}>Ключ работает ✓</Text> : null}

      <Text style={[T.small, { marginTop: 14, marginBottom: 6 }]}>Модель</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(models.length ? models.slice(0, 12) : [model || DEFAULT_MODELS[provider]]).map((m) => (
          <Chip key={m} small label={m} on={m === model} onPress={() => setModel(m)} />
        ))}
      </View>
      {!models.length ? <Text style={[T.small, { marginTop: 6 }]}>Нажмите «Проверить и сохранить», чтобы загрузить список доступных моделей — он запоминается, и модель можно менять прямо в чате.</Text> : null}

      {models.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={[T.small, { marginBottom: 4 }]}>Любимые модели</Text>
          <Text style={[T.small, { marginBottom: 8, lineHeight: 18 }]}>Отмеченные звёздочкой показываются в дневнике при выборе модели. Если не отмечено ничего — показываются все.</Text>
          {models.map((m) => {
            const on = !!data.ai.favModels?.[provider]?.includes(m);
            return (
              <Pressable key={m} accessibilityLabel={`Любимая модель ${m}`} onPress={() => toggleFavModel(provider, m)} style={({ pressed }) => [fav.row, on && { backgroundColor: C.accentTint }, pressed && { opacity: 0.7 }]}>
                <Text style={[T.body, { flex: 1, fontSize: 14 }]} numberOfLines={1}>{m}</Text>
                <Icon name={on ? 'starFill' : 'star'} size={26} color={on ? C.fat : C.muted} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function ProfileSection({ onApply }: { onApply?: () => void }) {
  const { data, setProfile, setTargets } = useStore();
  const [p, setP] = useState<Profile>(data.profile);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const calc = calcTargets(p, data.targets.waterGlasses);
  return (
    <View style={{ gap: 12 }}>
      <Field label="Имя (необязательно)" value={p.name} onChangeText={(t) => set({ name: t })} />
      <Seg items={[{ key: 'male', label: 'Мужчина' }, { key: 'female', label: 'Женщина' }]} value={p.sex} onChange={(v) => set({ sex: v as any })} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <NumField label="Возраст" value={p.age} onChange={(n) => set({ age: n })} style={{ flex: 1 }} />
        <NumField label="Рост" suffix="см" value={p.height} onChange={(n) => set({ height: n })} style={{ flex: 1 }} />
        <NumField label="Вес" suffix="кг" value={p.weight} onChange={(n) => set({ weight: n })} style={{ flex: 1 }} />
      </View>
      <View>
        <Text style={[T.small, { marginBottom: 6 }]}>Активность</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ACTIVITY.map((a) => <Chip key={a.v} small label={a.label} on={p.activity === a.v} onPress={() => set({ activity: a.v })} />)}
        </View>
        <Text style={[T.small, { marginTop: 5 }]}>{ACTIVITY.find((a) => a.v === p.activity)?.hint}</Text>
      </View>
      <Seg items={[{ key: 'lose', label: 'Снизить вес' }, { key: 'keep', label: 'Держать' }, { key: 'gain', label: 'Набрать' }]} value={p.goal} onChange={(v) => set({ goal: v as any })} />
      <View style={st.calc}>
        <Text style={T.small}>Рекомендуемая норма</Text>
        <Text style={[T.h2, { marginTop: 2 }]}>{calc.kcal} ккал</Text>
        <Text style={T.small}>Б {calc.protein} г · Ж {calc.fat} г · У {calc.carbs} г</Text>
      </View>
      <Btn label="Применить" onPress={() => {
        if (!p.age || !p.height || !p.weight) { Alert.alert('Заполните возраст, рост и вес'); return; }
        setProfile(p); setTargets(calc); onApply?.();
      }} />
    </View>
  );
}

function TargetsSection() {
  const { data, setTargets } = useStore();
  const t = data.targets;
  const set = (patch: Partial<typeof t>) => setTargets({ ...t, ...patch });
  return (
    <View style={{ gap: 10 }}>
      <NumField label="Калории в день" suffix="ккал" value={t.kcal} onChange={(n) => set({ kcal: Math.round(n) })} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <NumField label="Белки" suffix="г" value={t.protein} onChange={(n) => set({ protein: Math.round(n) })} style={{ flex: 1 }} />
        <NumField label="Жиры" suffix="г" value={t.fat} onChange={(n) => set({ fat: Math.round(n) })} style={{ flex: 1 }} />
        <NumField label="Углеводы" suffix="г" value={t.carbs} onChange={(n) => set({ carbs: Math.round(n) })} style={{ flex: 1 }} />
      </View>
      <NumField label="Вода (стаканов по 250 мл)" value={t.waterGlasses} onChange={(n) => set({ waterGlasses: Math.max(1, Math.round(n)) })} />
      <Text style={T.small}>Из БЖУ получается {Math.round(t.protein * 4 + t.fat * 9 + t.carbs * 4)} ккал</Text>
    </View>
  );
}

function DataSection() {
  const { data, replaceAll } = useStore();
  const exp = async () => {
    try {
      const uri = await writeBackup(data);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Резервная копия' });
      else Alert.alert('Сохранено', uri);
    } catch (e: any) { Alert.alert('Ошибка', e?.message || String(e)); }
  };
  const imp = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      const j = JSON.parse(await readTextFile(r.assets[0].uri));
      if (!Array.isArray(j.entries)) throw new Error('Это не резервная копия');
      Alert.alert('Восстановить данные?', `Записей в файле: ${j.entries.length}. Текущие данные будут заменены.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Восстановить', style: 'destructive', onPress: () => replaceAll(j) },
      ]);
    } catch (e: any) { Alert.alert('Не удалось прочитать файл', e?.message || String(e)); }
  };
  const wipe = () => Alert.alert('Удалить все записи?', 'Дневник, вес и вода будут очищены. Настройки и ключ останутся.', [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: () => replaceAll({ ...data, entries: [], weights: [], water: {}, favorites: [] }) },
  ]);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="Экспорт" kind="ghost" onPress={exp} style={{ flex: 1 }} />
        <Btn label="Импорт" kind="ghost" onPress={imp} style={{ flex: 1 }} />
      </View>
      <Text style={[T.small, { lineHeight: 18 }]}>
        Все данные хранятся только на телефоне, в папке приложения:{'\n'}{storagePath()}{'\n'}Записей: {data.entries.length} · избранных блюд: {data.favorites.length}
      </Text>
      <ActBtn label="Очистить дневник" icon="trash" danger onPress={wipe} style={{ flex: 0 }} />
    </View>
  );
}

function SoundSection() {
  const { data, update, setSoundMap } = useStore();
  const on = data.sounds !== false;
  const map = data.soundMap || {};
  const [open, setOpen] = useState('');
  const choice = (ev: string, def: string) => map[ev] || def;
  const label = (c: string) => (c === 'off' ? 'без звука' : c.startsWith('file:') ? 'свой файл' : SOUND_NAMES.find((x) => x.key === c)?.label || c);
  const pick = (ev: string, c: string) => { setSoundMap({ ...map, [ev]: c }); preview(c); };
  const own = async (ev: string) => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const uri = importSound(ev, a.uri, a.name);
      const c = 'file:' + uri;
      dropPlayer(c);
      pick(ev, c);
    } catch (e: any) { Alert.alert('Не удалось взять звук', e?.message || String(e)); }
  };
  return (
    <View style={{ gap: 12 }}>
      <Seg items={[{ key: 'on', label: 'Включены' }, { key: 'off', label: 'Выключены' }]} value={on ? 'on' : 'off'}
        onChange={(k) => update((d) => ({ ...d, sounds: k === 'on' }))} />
      <Text style={T.small}>Мягкие звуки природы вместо вибрации. Для каждого события можно выбрать свой звук, отключить его или взять свой файл (mp3, wav, m4a). Звуки слышны и при включённом беззвучном режиме — выключите их здесь, если мешают.</Text>
      <Text style={T.label}>Громкость</Text>
      <Seg items={VOLUMES.map((v) => ({ key: v.key, label: v.label }))} value={data.soundVolume || 'high'}
        onChange={(k) => { update((d) => ({ ...d, soundVolume: k })); setSoundVolume(k); preview('drop'); }} />
      {EVENTS.map((e) => {
        const c = choice(e.key, e.def);
        const isOpen = open === e.key;
        return (
          <View key={e.key} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 4 }}>
            <Pressable onPress={() => setOpen(isOpen ? '' : e.key)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{e.label}</Text>
                {e.hint ? <Text style={T.small}>{e.hint}</Text> : null}
              </View>
              <Text style={[T.small, { marginRight: 8, color: C.accent }]}>{label(c)}</Text>
              <Icon name={isOpen ? 'down' : 'right'} size={18} color={C.muted} />
            </Pressable>
            {isOpen ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 }}>
                {SOUND_NAMES.map((x) => <Chip key={x.key} label={x.label} on={c === x.key} onPress={() => pick(e.key, x.key)} />)}
                <Chip label="Без звука" on={c === 'off'} onPress={() => pick(e.key, 'off')} />
                <Chip label={c.startsWith('file:') ? 'Свой файл ✓ (другой…)' : 'Свой файл…'} on={c.startsWith('file:')} onPress={() => own(e.key)} />
              </View>
            ) : null}
          </View>
        );
      })}
      <ActBtn label="Вернуть звуки по умолчанию" icon="check" onPress={() => setSoundMap({})} style={{ flex: 0 }} />
    </View>
  );
}

/** Крупный степпер «− число +». */
function Stepper({ label, hint, value, min, max, onChange, fmtV }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void; fmtV?: (n: number) => string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 6 }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={T.body}>{label}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      <Pressable accessibilityLabel="Меньше" onPress={() => onChange(Math.max(min, value - 1))} style={[st.step, value <= min && { opacity: 0.4 }]}><Text style={st.stepT}>−</Text></Pressable>
      <Text style={[T.h3, { minWidth: 44, textAlign: 'center' }]}>{fmtV ? fmtV(value) : value}</Text>
      <Pressable accessibilityLabel="Больше" onPress={() => onChange(Math.min(max, value + 1))} style={[st.step, value >= max && { opacity: 0.4 }]}><Text style={st.stepT}>+</Text></Pressable>
    </View>
  );
}

function ToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!on)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 6 }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={T.body}>{label}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      <View style={[st.sw, on && { backgroundColor: C.accent, borderColor: C.accent }]}>
        <Text style={{ color: on ? C.white : C.muted, fontWeight: '700', fontSize: 14 }}>{on ? 'Да' : 'Нет'}</Text>
      </View>
    </Pressable>
  );
}

function ChatSection() {
  const { data, setChatSettings, clearChats } = useStore();
  const cs = chatSettings(data);
  const ctx = cs.ctx;
  const setCtx = (patch: Partial<ChatContextOpts>) => setChatSettings({ ...cs, ctx: { ...ctx, ...patch } });
  const tokens = estimateTokens(buildChatContext(data, new Date(), ctx));
  const count = data.chats?.length || 0;
  return (
    <View style={{ gap: 12 }}>
      <Text style={T.small}>В режиме «Спросить» (кнопка «+» в дневнике) ИИ отвечает с учётом ваших данных. Здесь выбирается, какие данные он видит. Он только читает и ничего не меняет в приложении. Режим «Записать» контекст не отправляет.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CTX_PRESETS.map((p) => <Chip key={p.key} label={p.label} on={sameCtx(ctx, p.ctx)} onPress={() => setCtx(p.ctx)} />)}
      </View>
      <Text style={[T.small, { color: C.accent, fontWeight: '600' }]}>Размер контекста: {tokensLabel(tokens)} на вопрос (без истории чата)</Text>
      <ToggleRow label="Дневник за сегодня" hint="блюда, время, итоги, вода" on={ctx.today} onChange={(v) => setCtx({ today: v })} />
      <ToggleRow label="Меню дня с остатками" hint="что съедено, что осталось" on={ctx.menu} onChange={(v) => setCtx({ menu: v })} />
      <ToggleRow label="Цели и профиль" hint="норма калорий и БЖУ, цель" on={ctx.profile} onChange={(v) => setCtx({ profile: v })} />
      <ToggleRow label="Избранные блюда" hint="блюда со звездой" on={ctx.favorites} onChange={(v) => setCtx({ favorites: v })} />
      <Stepper label="Итоги прошлых дней" hint="по дням, без списка блюд" value={ctx.summaryDays} min={0} max={30} onChange={(n) => setCtx({ summaryDays: n })} fmtV={(n) => (n ? `${n} дн.` : 'выкл')} />
      <Stepper label="Блюда прошлых дней" hint="подробный список за последние дни" value={ctx.detailDays} min={0} max={14} onChange={(n) => setCtx({ detailDays: n })} fmtV={(n) => (n ? `${n} дн.` : 'выкл')} />
      <Stepper label="Память чата" hint="сколько прошлых сообщений отправлять" value={ctx.history} min={0} max={60} onChange={(n) => setCtx({ history: n })} fmtV={(n) => (n ? String(n) : '0')} />
      <Stepper label="Новый чат начинается в" hint="до этого времени вопросы идут во вчерашний чат" value={cs.dayStartHour} min={0} max={11} onChange={(n) => setChatSettings({ ...cs, dayStartHour: n })} fmtV={(n) => `${String(n).padStart(2, '0')}:00`} />
      <Text style={T.label}>Хранить чаты</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KEEP_OPTIONS.map((o) => <Chip key={o.v} label={o.label} on={cs.keepDays === o.v} onPress={() => setChatSettings({ ...cs, keepDays: o.v })} />)}
      </View>
      <Text style={T.small}>Старые чаты удаляются при запуске приложения. Сегодняшний чат остаётся всегда.</Text>
      <ActBtn label={count ? `Очистить все чаты (${count})` : 'Чатов пока нет'} icon="trash" danger onPress={() => {
        if (!count) return;
        Alert.alert('Очистить все чаты?', 'Вся переписка с ИИ будет удалена. Дневник и меню не затрагиваются.', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Очистить', style: 'destructive', onPress: clearChats },
        ]);
      }} style={{ flex: 0, opacity: count ? 1 : 0.5 }} />
      <ActBtn label="Вернуть настройки чата по умолчанию" icon="check" onPress={() => setChatSettings(chatSettings({}))} style={{ flex: 0 }} />
    </View>
  );
}

function MealsSection() {
  const { data, setMeals, update } = useStore();
  const meals = data.meals || DEFAULT_MEALS;
  const upd = (i: number, patch: Partial<MealDef>) => setMeals(meals.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const hr = (m: number) => Math.round(m / 60);
  return (
    <View style={{ gap: 12 }}>
      <Text style={T.small}>Категории дневника и часы, когда они действуют. По времени приложение само предлагает нужную категорию для нового блюда. Блюда удалённой категории переедут в ближайшую по времени.</Text>
      <ToggleRow label="Подбирать приём пищи по времени" hint="при смене времени записи категория меняется сама" on={data.autoMeal !== false} onChange={(v) => update((d) => ({ ...d, autoMeal: v ? undefined : false }))} />
      {meals.map((m, i) => (
        <View key={m.key} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 12, gap: 8 }}>
          <Field label="Название" value={m.label} onChangeText={(t) => upd(i, { label: t })} />
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <NumField optional label="С (час)" value={hr(m.from)} onChange={(n) => upd(i, { from: Math.max(0, Math.min(24, n || 0)) * 60 })} style={{ flex: 1 }} />
            <NumField optional label="До (час)" value={hr(m.to)} onChange={(n) => upd(i, { to: Math.max(0, Math.min(24, n || 0)) * 60 })} style={{ flex: 1 }} />
            {meals.length > 1 ? <ActBtn label="Убрать" icon="trash" danger onPress={() => setMeals(meals.filter((_, j) => j !== i))} style={{ flex: 0 }} /> : null}
          </View>
          <Text style={T.small}>{minutesLabel(m.from)} – {minutesLabel(m.to % 1440)}</Text>
        </View>
      ))}
      <ActBtn label="Добавить категорию" icon="plus" onPress={() => setMeals([...meals, { key: 'm' + uid(), label: 'Перекус', emoji: '🍏', from: 15 * 60, to: 17 * 60 }])} style={{ flex: 0 }} />
      <ActBtn label="Только завтрак, обед, ужин" icon="check" onPress={() => setMeals(DEFAULT_MEALS)} style={{ flex: 0 }} />
    </View>
  );
}

function FavSection() {
  const { data, toggleFavorite } = useStore();
  if (!data.favorites.length) return <Text style={T.small}>Отмечайте блюда звёздочкой при добавлении — они появятся в быстрых кнопках над полем ввода.</Text>;
  return (
    <View>
      {data.favorites.map((f) => (
        <View key={f.id} style={st.line}>
          <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{f.item.name}</Text>
          <Text style={[T.small, { marginRight: 14 }]}>{kcalText(f.item)}</Text>
          <Pressable hitSlop={10} onPress={() => toggleFavorite(f.item)}><Text style={[T.small, { color: C.over }]}>убрать</Text></Pressable>
        </View>
      ))}
    </View>
  );
}

const SECTIONS = [
  { key: 'ai', title: 'Искусственный интеллект', C: AISection },
  { key: 'chat', title: 'Чат с ИИ', C: ChatSection },
  { key: 'targets', title: 'Дневная норма', C: TargetsSection },
  { key: 'history', title: 'История нормы', C: TargetHistorySection },
  { key: 'profile', title: 'Рассчитать норму', C: ProfileSection },
  { key: 'meals', title: 'Категории дневника', C: MealsSection },
  { key: 'icons', title: 'Иконки блюд', C: IconsSection },
  { key: 'sound', title: 'Звуки', C: SoundSection },
  { key: 'data', title: 'Данные', C: DataSection },
] as const;

export function SettingsScreen() {
  const [open, setOpen] = useState<string>('ai');
  const { data } = useStore();
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {SECTIONS.map((s) => {
        const on = open === s.key;
        const Comp = s.C as any;
        const sub = s.key === 'ai' ? (data.ai.provider === 'claude' ? 'Claude' : 'Gemini')
          : s.key === 'targets' ? `${data.targets.kcal} ккал`
          : s.key === 'history' ? `${(data.targetLog || []).length}`
          : s.key === 'sound' ? (data.sounds === false ? 'выкл' : 'вкл') : '';
        return (
          <View key={s.key} style={st.group}>
            <Pressable onPress={() => setOpen(on ? '' : s.key)} style={st.groupHead} hitSlop={4}>
              <Text style={[T.h3, { flex: 1 }]}>{s.title}</Text>
              {sub ? <Text style={[T.small, { marginRight: 10 }]}>{sub}</Text> : null}
              <Icon name={on ? 'down' : 'right'} size={18} color={C.muted} />
            </Pressable>
            {on ? <View style={{ paddingBottom: 18 }}><Comp /></View> : null}
          </View>
        );
      })}
      <Hair />
      <Text style={[T.small, { marginTop: 14 }]}>Хрум · версия 1.3</Text>
    </ScrollView>
  );
}

export const resetAll = () => defaultData();

const st = StyleSheet.create({
  group: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  groupHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
  step: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  stepT: { fontSize: 26, color: C.accent, marginTop: -2 },
  sw: { minWidth: 64, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface },
  calc: { backgroundColor: C.accentSoft, borderRadius: 10, padding: 14 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});

const fav = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 12, borderRadius: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
