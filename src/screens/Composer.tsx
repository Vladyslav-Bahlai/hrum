import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../ui/RNText';
import { C, noOutline, T } from '../theme';
import { Icon } from '../ui/Icon';
import { fromCamera, fromGallery, Picked } from '../media';
import { FoodItem } from '../types';
import { known, r0 } from '../utils';
import { outsideTapAction, PANEL_IDLE_MS, panelIsIdle, panelParts, smallBtnMode } from '../logic';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useStore } from '../store';
import { modelChoices } from '../logic';
import { Chip, Seg, Sheet, ActBtn, useKeyboardHeight } from '../ui/kit';
import { getKey } from '../storage';
import { DEFAULT_MODELS, listModels } from '../ai';
import { Provider } from '../types';
import { AskHint, ChatMini, useAskHint } from './ChatSlot';
import { askHintVisible } from '../chat';
import { ChatScreen } from './ChatScreen';
import { AttachSheet, PlusBtn } from './AttachSheet';
import { ModelSelect } from './ModelPopup';
import { PresetEditor } from './Dishes';
import { kcalText } from '../utils';
import { useChat } from './useChat';

/**
 * Ввод еды. По умолчанию — только большая зелёная кнопка «+». По нажатию она плавно превращается
 * в панель (чат-слот, любимые блюда, модель ИИ, поле ввода, камера/галерея/вручную) и через ~8 секунд
 * бездействия так же плавно сворачивается обратно. Панель поднимается над клавиатурой.
 */
export function Composer({ busy, onSubmit, onCancel, quick, onQuick, bottomInset, onManual, onMenu, onChatOpen, onOpen, chatTop = 110 }: {
  /** отмена запроса ИИ, пока идёт ожидание */
  onCancel?: () => void;
  /** панель раскрыта (карточка «Выбрать с меню» в ленте на это время исчезает) */
  onOpen?: (open: boolean) => void;
  onManual: () => void;
  /** сообщает, открыт ли полноэкранный чат (чтобы день не листался под ним) */
  onChatOpen?: (open: boolean) => void;
  /** «Из меню» — перейти к меню дня */
  onMenu?: () => void;
  /** верхняя граница полноэкранного чата (ниже шапки дня) */
  chatTop?: number;
  busy: boolean;
  onSubmit: (text: string, photos: Picked[]) => Promise<boolean>;
  /** блюда со звездой */
  quick: FoodItem[];
  onQuick: (item: FoodItem) => void;
  bottomInset: number;
}) {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [focus, setFocus] = useState(false);
  const blurAt = useRef(0); // момент последней потери фокуса: тап по переключателю сначала снимает фокус, потом срабатывает
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [picking, setPicking] = useState(false);
  const { data } = useStore();
  const [favOpen, setFavOpen] = useState(false); // окно «Избранное»
  const [presetNew, setPresetNew] = useState(false); // создание избранного блюда прямо отсюда
  const [attachOpen, setAttachOpen] = useState(false);
  const [mode, setMode] = useState<'log' | 'ask'>('log');
  // чат: закрыт / на весь экран / свёрнут в полоску над панелью
  const [chatView, setChatView] = useState<'closed' | 'full' | 'mini'>('closed');
  const [panelH, setPanelH] = useState(0);
  // полноэкранный чат сворачивается/разворачивается плавно: слой остаётся смонтированным, пока идёт анимация
  const chatA = useRef(new Animated.Value(0)).current;
  const [chatMounted, setChatMounted] = useState(false);
  const { height: winH, width: winW } = useWindowDimensions();
  const chat = useChat();
  const ask = mode === 'ask';
  const model = data.ai.provider === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  const canSend = ask ? (text.trim().length > 0 || photos.length > 0) && !chat.sending : (text.trim().length > 0 || photos.length > 0) && !busy;

  // ---- раскрытие / сворачивание ----
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bump, setBump] = useState(0); // любое касание панели сбрасывает таймер сворачивания
  const t = useRef(new Animated.Value(0)).current; // 0 — кнопка, 1 — панель
  const ripple = useRef(new Animated.Value(0)).current; // волна от кнопки при нажатии
  const expand = () => {
    setMounted(true);
    setOpen(true);
    if (mode === 'ask') setChatView('full');
    setBump((x) => x + 1);
    ripple.setValue(0);
    Animated.timing(ripple, { toValue: 1, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    // панель «вырастает» из кнопки: пружина даёт мягкий, живой отскок
    Animated.spring(t, { toValue: 1, damping: 15, stiffness: 190, mass: 0.9, useNativeDriver: true }).start();
  };
  const collapse = () => {
    Keyboard.dismiss();
    setChatView('closed');
    setOpen(false);
    Animated.timing(t, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  };
  const collapseRef = useRef(collapse); collapseRef.current = collapse;

  useEffect(() => {
    if (!open) return;
    if (!panelIsIdle({ focus, text, photos: photos.length, busy: busy || chat.sending, sheetOpen: favOpen || presetNew || attachOpen || chatView !== 'closed', picking })) return;
    const id = setTimeout(() => collapseRef.current(), PANEL_IDLE_MS);
    return () => clearTimeout(id);
  }, [open, focus, text, photos.length, busy, chat.sending, favOpen, presetNew, attachOpen, chatView, picking, bump]);

  // ---- подъём над клавиатурой (Android в edge-to-edge окно не ужимает) ----
  const kb = useKeyboardHeight();
  const baseBottom = kb > 0 ? 8 : Math.max(bottomInset, 12);

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

  useEffect(() => { onOpen?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (chatView === 'full' && open && ask) {
      setChatMounted(true);
      Animated.timing(chatA, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (chatMounted) {
      Animated.timing(chatA, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setChatMounted(false); });
    }
  }, [chatView, open, ask]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onChatOpen?.(chatView === 'full'); return () => onChatOpen?.(false); }, [chatView]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeChat = () => { Keyboard.dismiss(); setChatView('closed'); setMode('log'); };

  const askChat = async (q: string) => {
    const ph = photos;
    setText('');
    setPhotos([]);
    setBump((x) => x + 1);
    const ok = await chat.send(q, ph);
    if (!ok) { setText((x) => x || q); setPhotos((x) => (x.length ? x : ph)); }
    setBump((x) => x + 1);
  };

  const send = async () => {
    if (!canSend) return;
    if (ask) { void askChat(text); return; }
    Keyboard.dismiss();
    const ok = await onSubmit(text.trim(), photos);
    if (ok) {
      setText('');
      setPhotos([]);
    }
  };

  const fabStyle = {
    opacity: t.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' as const }),
    transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 0.5], extrapolate: 'clamp' as const }) }],
  };
  // плюс крутится на 135° и превращается в «✕», пока панель растёт из угла кнопки
  const plusSpin = { transform: [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'], extrapolate: 'clamp' as const }) }] };
  const ph = panelH || 140;
  const panelStyle = {
    opacity: t.interpolate({ inputRange: [0, 0.3, 0.7], outputRange: [0, 0.35, 1], extrapolate: 'clamp' as const }),
    transform: [
      // масштаб считается от правого нижнего угла (там кнопка): сдвиг компенсирует центр масштабирования
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [(winW / 2 - 52) * 0.85, 0] }) },
      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [ph / 2 - 20, 0] }) },
      { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) },
    ],
  };

  const hasInput = smallBtnMode({ text, photos: photos.length }) === 'send';
  // одна кнопка: пусто — «свернуть» (✕), есть текст/фото — «отправить»; иконка меняется плавно
  const sendT = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(sendT, { toValue: hasInput ? 1 : 0, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(); }, [hasInput, sendT]);
  const { showSeg, showChip, showQuick, showSide, buttonInside } = panelParts({ focus, ask, hasQuick: true });
  // при фокусе круглая кнопка «втягивается» в инпут (одна и та же кнопка, меняется только вид)
  const inT = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(inT, { toValue: buttonInside ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [buttonInside, inT]);
  const outside = () => {
    if (outsideTapAction({ text, photos: photos.length, askMode: ask }) === 'collapse') collapse();
    else Keyboard.dismiss();
  };
  const sideAct = (fn?: () => void) => { collapse(); fn?.(); };
  const sending = ask ? chat.sending : busy;
  const cancel = () => { if (ask) chat.cancel(); else onCancel?.(); };
  const smallPress = () => { if (sending) cancel(); else if (hasInput) void send(); else collapse(); };
  const hintOn = ask && askHintVisible({ text, focus, photos: photos.length });
  const hint = useAskHint(hintOn);

  return (
    <>
      {/* тап по ленте: свернуть (или только убрать клавиатуру, если что-то введено) */}
      {mounted && open && chatView !== 'full' ? <Pressable accessibilityLabel="Свернуть панель" onPress={outside} style={StyleSheet.absoluteFill} /> : null}
      <Animated.View pointerEvents="box-none" style={[s.wrap, { bottom: kb + baseBottom }]}>
        {/* большая зелёная кнопка */}
        <Animated.View pointerEvents={open ? 'none' : 'box-none'} style={[s.fabWrap, fabStyle]}>
          <Pressable testID="fav-btn" accessibilityLabel="Избранные блюда" onPress={() => setFavOpen(true)} style={({ pressed }) => [s.favFab, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Icon name="starFill" size={24} color={C.fat} />
          </Pressable>
          <Pressable testID="fab" accessibilityLabel="Добавить еду" onPress={expand} style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Animated.View style={plusSpin}><Icon name="plus" size={34} color={C.white} stroke={2.4} /></Animated.View>
          </Pressable>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[s.ripple, { opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} />

        {mounted ? (
          <Animated.View pointerEvents={open ? 'box-none' : 'none'} style={[panelStyle, { width: '100%' }]} onTouchStart={() => setBump((x) => x + 1)} onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}>
            {/* полутень под любимыми и моделью, чтобы они читались поверх ленты */}
            {chatView !== 'full' ? (
              <LinearGradient pointerEvents="none" colors={['rgba(244,245,240,0)', 'rgba(244,245,240,0.93)', 'rgba(244,245,240,0.97)']} locations={[0, 0.38, 1]}
                style={{ position: 'absolute', left: 0, right: 0, top: -56, bottom: -(baseBottom + 40) }} />
            ) : null}

            {ask && chatView === 'mini' ? (
              <ChatMini chat={chat} onExpand={() => setChatView('full')} onClose={closeChat} />
            ) : null}

            {showQuick ? (
              <View style={s.quickWrap}>
                <GHScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
                  contentContainerStyle={{ gap: 8, paddingLeft: 16, paddingRight: 100, paddingVertical: 4 }}>
                  <Pressable accessibilityLabel={quick.length ? 'Добавить блюдо в избранное' : 'Создать избранное блюдо'} onPress={() => setPresetNew(true)} style={[s.quick, s.quickAdd]}>
                    <Icon name="plus" size={16} color={C.accent} stroke={2.4} />
                    {!quick.length ? <Text style={[T.body, { fontSize: 14, fontWeight: '600', marginLeft: 6, color: C.accent }]} numberOfLines={1}>Создать избранное</Text> : null}
                  </Pressable>
                  {quick.map((q, i) => (
                    <Pressable key={i} onPress={() => { onQuick(q); setBump((x) => x + 1); }} style={s.quick}>
                      <Icon name="starFill" size={13} color={C.fat} />
                      <Text style={[T.body, { fontSize: 14, fontWeight: '600', marginLeft: 6, flexShrink: 1 }]} numberOfLines={1}>{q.name}</Text>
                      <Text style={[T.small, { marginLeft: 6 }]}>{known(q).kcal ? r0(q.kcal!) : '—'}</Text>
                    </Pressable>
                  ))}
                </GHScrollView>
                {/* справа блюда «заползают» под боковые кружки и растворяются */}
                <LinearGradient pointerEvents="none" colors={['rgba(244,245,240,0)', 'rgba(244,245,240,0.97)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 110 }} />
              </View>
            ) : null}

            <View style={s.metaRow}>
              {showSeg ? (
                <Seg items={[{ key: 'log' as const, label: 'Записать' }, { key: 'ask' as const, label: 'Спросить' }]} value={mode} style={{ width: 150 }}
                  onChange={(m) => { const keep = focus || Date.now() - blurAt.current < 400; setMode(m); setChatView(m === 'ask' ? 'full' : 'closed'); setBump((x) => x + 1); if (keep) setTimeout(() => inputRef.current?.focus(), 0); }} />
              ) : null}
              {showChip ? (
                <ModelSelect />
              ) : null}
            </View>

            <Animated.View style={[s.bar, focus && s.barFocus, { marginRight: inT.interpolate({ inputRange: [0, 1], outputRange: [82, 12] }) }]}>
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
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 4, gap: 4 }}>
                <PlusBtn onPress={() => setAttachOpen(true)} on={attachOpen} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    ref={inputRef}
                    testID="composer-input"
                    accessibilityLabel="Поле ввода"

                    value={text}
                    onChangeText={setText}
                    onFocus={() => setFocus(true)}
                    onBlur={() => { blurAt.current = Date.now(); setFocus(false); }}
                    placeholder={ask ? (hintOn ? '' : photos.length ? 'Вопрос к фото (можно без текста)…' : 'Спросить ИИ…') : photos.length ? 'Уточните, если нужно…' : 'Что вы съели?'}
                    placeholderTextColor={C.muted}
                    multiline
                    numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                    style={[T.body, s.input, noOutline]}
                  />
                  {hintOn ? <AskHint hint={hint} /> : null}
                </View>
                <Animated.View pointerEvents={buttonInside ? 'auto' : 'none'} style={{ width: inT.interpolate({ inputRange: [0, 1], outputRange: [0, 44] }), height: 44, opacity: inT, overflow: 'hidden' }}>
                  <ActionDot hasInput={hasInput} sending={sending} sendT={sendT} size={44} onPress={smallPress} label={sending ? 'Отменить запрос' : hasInput ? 'Отправить' : 'Свернуть'} />
                </Animated.View>
              </View>
            </Animated.View>

            {/* боковые кружки: «Из меню» и «Вручную» */}
            {showSide ? (
              <View pointerEvents="box-none" style={s.side}>
                <Pressable accessibilityLabel="Из меню" onPress={() => sideAct(onMenu)} style={({ pressed }) => [s.circle, pressed && { opacity: 0.75 }]}>
                  <Icon name="list" size={24} color={C.accent} />
                  <Text style={s.circleT}>Из меню</Text>
                </Pressable>
                <Pressable accessibilityLabel="Вручную" onPress={() => sideAct(onManual)} style={({ pressed }) => [s.circle, pressed && { opacity: 0.75 }]}>
                  <Icon name="pen" size={23} color={C.accent} />
                  <Text style={s.circleT}>Вручную</Text>
                </Pressable>
              </View>
            ) : null}

            {/* малая круглая кнопка на месте большой: свернуть или отправить (при фокусе уходит внутрь инпута) */}
            <Animated.View pointerEvents={buttonInside ? 'none' : 'auto'} style={[s.small, { opacity: inT.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: inT.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }] }]}>
              <ActionDot hasInput={hasInput} sending={sending} sendT={sendT} size={52} onPress={smallPress} label={sending ? 'Отменить запрос' : hasInput ? 'Отправить' : 'Свернуть'} />
            </Animated.View>
          </Animated.View>
        ) : null}
        {favOpen ? <FavoritesSheet items={quick} onClose={() => setFavOpen(false)} onPick={(it) => { setFavOpen(false); onQuick(it); }} onNew={() => { setFavOpen(false); setPresetNew(true); }} /> : null}
        {presetNew ? <PresetEditor visible onClose={() => setPresetNew(false)} /> : null}
        <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} tiles={[
          { key: 'camera', label: 'Камера', icon: 'camera', onPress: () => { void add('camera'); } },
          { key: 'gallery', label: 'Галерея', icon: 'image', onPress: () => { void add('gallery'); } },
        ]} />
      </Animated.View>
      {chatMounted ? (
        <Animated.View pointerEvents={chatView === 'full' ? 'auto' : 'none'} onTouchStart={() => setBump((x) => x + 1)}
          style={{ position: 'absolute', left: 0, right: 0, top: chatTop, bottom: baseBottom + kb + panelH, opacity: chatA,
            transform: [{ translateY: chatA.interpolate({ inputRange: [0, 1], outputRange: [Math.max(200, winH * 0.5), 0] }) }, { scale: chatA.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
          <ChatScreen chat={chat} style={{ top: 0, bottom: 0 }} onMinimize={() => { Keyboard.dismiss(); setChatView('mini'); }} onClose={closeChat} />
        </Animated.View>
      ) : null}
    </>
  );
}

/** Круглая кнопка действия: пусто — «✕ свернуть», есть текст/фото — «стрелка отправить»; иконка и цвет меняются плавно. */
function ActionDot({ hasInput, sending, sendT, size, onPress, label }: { hasInput: boolean; sending: boolean; sendT: Animated.Value; size: number; onPress: () => void; label: string }) {
  return (
    <Pressable testID="action-dot" accessibilityLabel={label} onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, overflow: 'hidden' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: sendT.interpolate({ inputRange: [0, 1], outputRange: [C.surface, C.accent] }) }]} />
      {sending ? (
        <>
          <ActivityIndicator color={C.accent} style={{ position: 'absolute' }} />
          <View accessibilityLabel="Отменить запрос" style={{ width: size * 0.26, height: size * 0.26, borderRadius: 3, backgroundColor: C.accent }} />
        </>
      ) : (
        <>
          <Animated.View style={{ position: 'absolute', opacity: sendT.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ rotate: sendT.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }) }] }}>
            <Icon name="close" size={22} color={C.inkSoft} stroke={2.2} />
          </Animated.View>
          <Animated.View style={{ position: 'absolute', opacity: sendT, transform: [{ scale: sendT.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <Icon name="send" size={24} color={C.white} stroke={2.2} />
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

/** Окно «Избранное»: блюда со звездой — тап добавляет в дневник; сверху — создать новое. */
function FavoritesSheet({ items, onClose, onPick, onNew }: { items: FoodItem[]; onClose: () => void; onPick: (i: FoodItem) => void; onNew: () => void }) {
  return (
    <Sheet visible onClose={onClose} title="Избранные блюда">
      <ActBtn label="Создать избранное блюдо" icon="plus" onPress={onNew} style={{ flex: 0, marginBottom: 8 }} />
      {items.length ? items.map((q, i) => (
        <Pressable key={i} onPress={() => onPick(q)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line }, pressed && { backgroundColor: C.accentTint }]}>
          <Icon name="starFill" size={15} color={C.fat} />
          <Text style={[T.body, { flex: 1, fontWeight: '500' }]} numberOfLines={2}>{q.name}</Text>
          <Text style={[T.small, T.num]}>{kcalText(q)}</Text>
        </Pressable>
      )) : <Text style={[T.small, { textAlign: 'center', paddingVertical: 22 }]}>Избранных блюд пока нет — создайте первое.</Text>}
    </Sheet>
  );
}

/** Компактный чип текущей модели: иконка ✦ + имя (с обрезкой); тап — выбор модели. */
export function ModelChip({ onPress }: { onPress: () => void }) {
  const { data } = useStore();
  const model = data.ai.provider === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  return (
    <Pressable accessibilityLabel="Модель ИИ" onPress={onPress} style={[s.model, s.modelFocus]} hitSlop={6}>
      <Icon name="sparkle" size={14} color={C.accent} />
      <Text style={{ color: C.inkSoft, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{model || DEFAULT_MODELS[data.ai.provider]}</Text>
      <Icon name="down" size={12} color={C.muted} />
    </Pressable>
  );
}

/** Смена провайдера и модели прямо из чата; список берётся из кэша последней проверки ключа. */
export function ModelSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, update, cacheModels } = useStore();
  const [prov, setProv] = useState<Provider>(data.ai.provider);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (visible) setProv(data.ai.provider); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = prov === 'claude' ? data.ai.claudeModel : data.ai.geminiModel;
  const cached = data.ai.models?.[prov] || [];
  const { list: choices, filtered } = modelChoices(data.ai, prov);
  const list = choices.length ? choices : [cur || DEFAULT_MODELS[prov]];
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
        {!cached.length ? 'Список появится после проверки ключа в настройках — или обновите его здесь.'
          : filtered ? 'Показаны любимые модели. Изменить набор можно в Настройках.'
          : 'Выберите любимые в Настройках — тогда здесь останутся только они.'}
      </Text>
      <ActBtn label={busy ? 'Обновляю…' : 'Обновить список моделей'} icon="repeat" onPress={refresh} style={{ flex: 0, marginTop: 10, marginBottom: 6 }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, minHeight: 68 },
  fabWrap: { position: 'absolute', right: 18, bottom: 0, alignItems: 'center' },
  fab: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F2A1C', shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  ripple: { position: 'absolute', right: 18, bottom: 0, width: 68, height: 68, borderRadius: 34, backgroundColor: C.accent },
  quickWrap: { marginBottom: 6 },
  favFab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, shadowColor: '#0F2A1C', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  quickAdd: { borderStyle: 'dashed', borderColor: C.accent, backgroundColor: C.accentTint, paddingHorizontal: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 16, marginRight: 80, marginBottom: 8 },
  side: { position: 'absolute', right: 14, bottom: 68, gap: 10, alignItems: 'center' },
  circle: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
    shadowColor: '#0F2A1C', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  circleT: { fontSize: 10, fontWeight: '700', color: C.accentDark, marginTop: 1 },
  small: {
    position: 'absolute', right: 18, bottom: 4, width: 52, height: 52, borderRadius: 26,
    shadowColor: '#0F2A1C', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  model: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 17, flexShrink: 1, alignSelf: 'flex-start', maxWidth: 220,
    backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
  },
  modelFocus: { borderColor: C.accent, backgroundColor: C.accentTint },
  bar: {
    marginLeft: 12, marginRight: 82, backgroundColor: C.surface, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong,
    shadowColor: '#0F2A1C', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  barFocus: { borderColor: C.accent, borderWidth: 1.5, borderRadius: 24, shadowOpacity: 0.2 },
  input: { minHeight: 44, maxHeight: 132, paddingHorizontal: 8, paddingTop: 11, paddingBottom: 11 },
  thumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: C.line },
  thumbX: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  quick: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, paddingHorizontal: 14, height: 40, borderRadius: 20, maxWidth: 220,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, shadowColor: '#0F2A1C', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
});
