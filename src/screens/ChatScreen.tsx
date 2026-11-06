import React, { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../ui/RNText';
import { C, T, TABS, shade } from '../theme';
import { buildChatContext, chatName, estimateTokens, sortedChats, tokensLabel } from '../chat';
import { Btn, Empty, IconBtn } from '../ui/kit';
import { useStore } from '../store';
import { emptyChatHint, Messages } from './ChatSlot';
import { Icon } from '../ui/Icon';
import { ChatApi } from './useChat';
const X = TABS.chats;
const XD = shade(X.accent, 0.72);

/**
 * Чат на весь экран — слой поверх дня (между шапкой и панелью ввода). Ввод — общий нижний инпут панели «+».
 * Шапка: свернуть вниз, название, список чатов, ✕ закрыть. Здесь же быстрые вопросы и список прошлых чатов.
 */
export function ChatScreen({ chat, onMinimize, onClose, style }: {
  chat: ChatApi; onMinimize: () => void; onClose: () => void; style?: any;
}) {
  const store = useStore();
  const { data } = store;
  const [list, setList] = useState(false);
  const chats = sortedChats(data.chats);
  const ctxTokens = estimateTokens(buildChatContext(data, new Date(), chat.settings.ctx));

  return (
    <View style={[{ position: 'absolute', left: 0, right: 0, backgroundColor: C.paper }, style]}>
      <View style={{ flex: 1 }}>
        <View style={s.head}>
          <IconBtn name={list ? 'left' : 'down'} label={list ? 'Назад к чату' : 'Свернуть чат'} size={24} onPress={() => (list ? setList(false) : onMinimize())} />
          <View style={{ flex: 1, paddingHorizontal: 6 }}>
            <Text style={T.h2} numberOfLines={1}>{list ? 'Чаты' : chat.title}</Text>
            {!list ? <Text style={T.small}>контекст {tokensLabel(ctxTokens)} · только чтение</Text> : null}
          </View>
          {!list ? <IconBtn name="list" label="Список чатов" size={24} onPress={() => { Keyboard.dismiss(); setList(true); }} /> : null}
          <IconBtn name="close" label="Закрыть чат" size={24} onPress={onClose} />
        </View>

        {list ? (
          <View style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {chats.length === 0 ? <Empty title="Чатов пока нет" text="Задайте вопрос в режиме «Спросить» — чат за день появится здесь." /> : (
                <View style={{ paddingHorizontal: 16 }}>
                  {chats.map((c) => {
                    const last = c.messages[c.messages.length - 1];
                    const on = c.id === chat.id;
                    return (
                      <View key={c.id} style={[s.item, on && { borderColor: X.accent }]}>
                        <Pressable style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 14 }} onPress={() => { chat.open(c.id); setList(false); }}>
                          <Text style={[T.h3]} numberOfLines={1}>{chatName(c, c.id, new Date(), chat.settings.dayStartHour)}</Text>
                          <Text style={[T.small, { marginTop: 2 }]} numberOfLines={1}>{c.messages.length} сообщ. · {last?.text}</Text>
                        </Pressable>
                        {on ? <Icon name="check" size={20} color={X.accent} /> : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {!chat.isToday ? <Btn label="К сегодняшнему чату" kind="soft" onPress={() => { chat.open(chat.dayId); setList(false); }} /> : null}
            </View>
          </View>
        ) : (
          <>
            <Messages chat={chat} empty={emptyChatHint} />
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong, marginTop: 10 },
});
