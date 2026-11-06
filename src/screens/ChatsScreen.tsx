import React, { useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../ui/RNText';
import { buildChatContext, chatName, ChatHit, estimateTokens, searchChats, tokensLabel } from '../chat';
import { fromCamera, fromGallery, Picked } from '../media';
import { purgeChatPhotos, useStore } from '../store';
import { C, noOutline, T, TABS, shade } from '../theme';
import { Icon } from '../ui/Icon';
import { ActBtn, Btn, Empty, Field, IconBtn, Sheet, useKeyboardHeight } from '../ui/kit';
import { useToast } from '../ui/Toast';
import { Chat } from '../types';
import { AttachSheet, PlusBtn } from './AttachSheet';
import { ModelChip, ModelSheet } from './Composer';
import { AskHint, emptyChatHint, Messages, useAskHint } from './ChatSlot';
import { askHintVisible } from '../chat';
import { useChat } from './useChat';
const X = TABS.chats;
const XD = shade(X.accent, 0.72);

const when = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${d.getHours()}:${p(d.getMinutes())}`;
};

/**
 * Вкладка «Чаты»: список всех чатов с ИИ и инструменты (новый, поиск, закрепить, переименовать, удалить, очистить).
 * Общаться можно прямо здесь (свой инпут); выбранный чат становится активным и для панели дневника.
 */
export function ChatsScreen({ navSpace }: { navSpace: number }) {
  const store = useStore();
  const toast = useToast();
  const chat = useChat();
  const kb = useKeyboardHeight();
  const now = new Date();
  const sh = chat.settings.dayStartHour;
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const [actions, setActions] = useState<string | null>(null); // id чата в меню действий
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [clearAsk, setClearAsk] = useState(false);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [picking, setPicking] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const chats = store.data.chats || [];
  const target = actions ? chats.find((c) => c.id === actions) : undefined;
  const name = (c: Chat) => chatName(c, c.id, now, sh);
  const bottom = kb ? kb + 8 : navSpace;

  const openChat = (id: string) => { chat.open(id); Keyboard.dismiss(); setView('chat'); };
  const newChat = () => { chat.create(); setQ(''); setView('chat'); };
  const del = (c: Chat) => {
    setActions(null);
    chat.forget(c.id);
    store.deleteChat(c.id);
    // файлы фото удаляются, когда «Отменить» уже недоступно
    toast({ text: `Чат «${name(c)}» удалён`, action: 'Отменить', onAction: () => store.restoreChat(c), onExpire: () => purgeChatPhotos([c]) });
  };
  const send = async () => {
    const v = text.trim();
    if ((!v && !photos.length) || chat.sending) return;
    const ph = photos;
    setText('');
    setPhotos([]);
    const ok = await chat.send(v, ph);
    if (!ok) { setText((x) => x || v); setPhotos((x) => (x.length ? x : ph)); }
  };
  const add = async (src: 'camera' | 'gallery') => {
    if (picking) return;
    setPicking(true);
    try {
      const p = src === 'camera' ? await fromCamera() : await fromGallery(4 - photos.length);
      if (p.length) setPhotos((x) => [...x, ...p].slice(0, 4));
    } finally { setPicking(false); }
  };
  const canSend = (text.trim().length > 0 || photos.length > 0) && !chat.sending;
  const hintOn = view === 'chat' && askHintVisible({ text, focus, photos: photos.length });
  const hint = useAskHint(hintOn);
  const [modelOpen, setModelOpen] = useState(false);

  const hits: ChatHit[] = searchChats(chats, q, now, sh);
  const activeChat = chats.find((c) => c.id === chat.id);

  return (
    <View style={{ flex: 1, paddingBottom: bottom }}>
      {view === 'list' ? (
        <>
          <Text style={[T.h1, { paddingHorizontal: 20, paddingBottom: 10 }]}>Чаты</Text>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <Btn label="Новый чат" icon="plus" onPress={newChat} />
            <View style={s.search}>
              <Icon name="search" size={20} color={C.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Поиск по чатам" placeholderTextColor={C.muted} style={[T.body, { flex: 1, paddingVertical: 11 }, noOutline]} />
              {q ? <IconBtn name="close" size={20} onPress={() => setQ('')} /> : null}
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            {hits.length === 0 ? (
              q ? <Empty title="Ничего не найдено" text="Поиск идёт по названиям и тексту сообщений." />
                : <Empty title="Чатов пока нет" text="Нажмите «Новый чат» или задайте вопрос в режиме «Спросить» в дневнике." />
            ) : hits.map(({ chat: c, snippet }) => {
              const last = c.messages[c.messages.length - 1];
              const on = c.id === chat.id;
              return (
                <View key={c.id} style={[s.item, on && { borderColor: X.accent, borderWidth: 1 }]}>
                  <Pressable accessibilityLabel={`Открыть чат ${name(c)}`} style={{ flex: 1, paddingVertical: 12, paddingLeft: 14 }} onPress={() => openChat(c.id)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {c.pinned ? <Icon name="pin" size={16} color={X.accent} /> : null}
                      <Text style={[T.h3, { flexShrink: 1 }]} numberOfLines={1}>{name(c)}</Text>
                      {on ? <View style={s.badge}><Text style={s.badgeTxt}>активный</Text></View> : null}
                    </View>
                    <Text style={[T.small, { marginTop: 3 }]} numberOfLines={1}>
                      {c.messages.length ? `${c.messages.length} сообщ. · ${when(c.updatedAt)}` : 'пока пусто'}
                    </Text>
                    {snippet ? <Text style={[T.bodySoft, { fontSize: 13, marginTop: 3 }]} numberOfLines={2}>{snippet}</Text>
                      : last ? <Text style={[T.small, { marginTop: 2 }]} numberOfLines={1}>{last.text}</Text> : null}
                  </Pressable>
                  <IconBtn name="more" label="Действия" size={24} onPress={() => { Keyboard.dismiss(); setActions(c.id); }} style={{ padding: 12, marginRight: 4 }} />
                </View>
              );
            })}
            {chats.length && !q ? (
              <ActBtn label="Очистить все чаты" icon="trash" danger onPress={() => setClearAsk(true)} style={{ flex: 0, marginTop: 16 }} />
            ) : null}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={s.head}>
            <IconBtn name="left" size={24} onPress={() => { Keyboard.dismiss(); setView('list'); }} />
            <View style={{ flex: 1, paddingHorizontal: 6 }}>
              <Text style={T.h2} numberOfLines={1}>{chat.title}</Text>
              <Text style={T.small}>контекст {tokensLabel(estimateTokens(buildChatContext(store.data, now, chat.settings.ctx)))} · только чтение</Text>
            </View>
            <IconBtn name="more" label="Действия" size={24} onPress={() => { Keyboard.dismiss(); setActions(chat.id); }} />
          </View>
          <Messages chat={chat} empty={emptyChatHint} />
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 }}><ModelChip onPress={() => { Keyboard.dismiss(); setModelOpen(true); }} /></View>
          {photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
              {photos.map((p, i) => (
                <View key={i}>
                  <Image source={{ uri: p.uri }} style={s.thumb} />
                  <Pressable accessibilityLabel="Убрать фото" hitSlop={8} style={s.thumbX} onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))}>
                    <Icon name="close" size={12} color={C.white} stroke={2.4} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={[s.bar, focus && { borderColor: X.accent }]}>
            <PlusBtn onPress={() => setAttachOpen(true)} on={attachOpen} />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <TextInput
                value={text} onChangeText={setText} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                placeholder={hintOn ? '' : photos.length ? 'Вопрос к фото (можно без текста)…' : 'Спросить ИИ…'} placeholderTextColor={C.muted} multiline style={[T.body, s.input, noOutline]}
              />
              {hintOn ? <AskHint hint={hint} left={12} top={11} /> : null}
            </View>
            <Pressable accessibilityLabel="Отправить" onPress={send} style={[s.send, { backgroundColor: canSend ? X.accent : C.line }]}>
              {chat.sending ? <ActivityIndicator color={C.white} /> : <Icon name="send" size={24} color={canSend ? C.white : C.muted} stroke={2.2} />}
            </Pressable>
          </View>
        </>
      )}

      <ModelSheet visible={modelOpen} onClose={() => setModelOpen(false)} />
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} tiles={[
        { key: 'camera', label: 'Камера', icon: 'camera', onPress: () => { void add('camera'); } },
        { key: 'gallery', label: 'Галерея', icon: 'image', onPress: () => { void add('gallery'); } },
      ]} />

      {/* действия над чатом */}
      <Sheet visible={!!target} onClose={() => setActions(null)} title={target ? name(target) : undefined}>
        {target ? (
          <View style={{ gap: 10 }}>
            {view === 'list' ? <Btn label="Открыть" icon="chat" onPress={() => { const id = target.id; setActions(null); openChat(id); }} /> : null}
            <Btn label={target.pinned ? 'Открепить' : 'Закрепить'} icon="pin" kind="soft" onPress={() => { store.togglePinChat(target.id); setActions(null); }} />
            <Btn label="Переименовать" icon="pen" kind="soft" onPress={() => { const c = target; setActions(null); setRenaming({ id: c.id, name: c.title || '' }); }} />
            <Btn label="Удалить чат" icon="trash" kind="danger" onPress={() => { del(target); if (view === 'chat') setView('list'); }} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!renaming} onClose={() => setRenaming(null)} title="Название чата"
        footer={<Btn label="Сохранить" onPress={() => { if (renaming) store.renameChat(renaming.id, renaming.name); setRenaming(null); }} />}>
        {renaming ? (
          <Field value={renaming.name} onChangeText={(v) => setRenaming({ ...renaming, name: v })} placeholder="Например: План на неделю" autoFocus maxLength={60} />
        ) : null}
        <Text style={[T.small, { marginTop: 8 }]}>Пустое название вернёт стандартное (дата или начало первого вопроса).</Text>
      </Sheet>

      <Sheet visible={clearAsk} onClose={() => setClearAsk(false)} title="Очистить все чаты?">
        <Text style={[T.bodySoft, { marginBottom: 14 }]}>Вся переписка с ИИ будет удалена, кроме закреплённых чатов. Дневник и меню не затрагиваются.</Text>
        <View style={{ gap: 10 }}>
          <Btn label="Очистить" icon="trash" kind="danger" onPress={() => { chat.forget(chat.id); purgeChatPhotos(chats.filter((c) => !c.pinned)); store.clearChats(); setClearAsk(false); setView('list'); }} />
          <Btn label="Отмена" kind="soft" onPress={() => setClearAsk(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, borderRadius: 14, paddingHorizontal: 14, backgroundColor: C.surface, minHeight: 48 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, marginTop: 10 },
  badge: { backgroundColor: X.soft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: XD },
  bar: { flexDirection: 'row', alignItems: 'flex-end', marginHorizontal: 12, marginBottom: 8, padding: 6, gap: 6, backgroundColor: C.surface, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  input: { minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.line },
  thumbX: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
