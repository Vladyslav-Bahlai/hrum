import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chatWithAI, DEFAULT_PHOTO_QUESTION, isCancelled } from '../ai';
import { Picked } from '../media';
import { activeChatId, buildChatContext, chatDayKey, chatName, ChatOverride, chatSettings, newChatId, newMsg, requestTurns } from '../chat';
import { play } from '../sound';
import { getKey, persistPhoto } from '../storage';
import { useStore } from '../store';
import { ChatMsg } from '../types';

// Выбранный вручную чат (из стопки или вкладки «Чаты») общий для дневника и вкладки: действует до смены дня.
let shared: ChatOverride | null = null;
const subs = new Set<() => void>();
const setShared = (o: ChatOverride | null) => { shared = o; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const resetChatOverride = () => setShared(null);

/** Чат с ИИ: один чат на «день» (граница — dayStartHour), можно открыть и продолжить любой прошлый или созданный вручную. Только читает данные. */
export function useChat() {
  const store = useStore();
  const { data } = store;
  const cs = chatSettings(data);
  const dayId = chatDayKey(new Date(), cs.dayStartHour);
  const override = useSyncExternalStore(subscribe, () => shared, () => shared);
  const [sending, setSending] = useState(false);
  const id = activeChatId(override, dayId);
  const chat = data.chats?.find((c) => c.id === id);
  const messages: ChatMsg[] = chat?.messages || [];
  const ref = useRef(data); ref.current = data;
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // наступил новый день — переопределение сбрасывается, активен чат нового дня
  useEffect(() => { if (override && override.day !== dayId) setShared(null); }, [override, dayId]);

  /** Вопрос ИИ; фото (если есть) прикрепляются только к этому вопросу и в дневник не попадают. */
  const send = async (text: string, photos: Picked[] = []) => {
    const q = text.trim() || (photos.length ? DEFAULT_PHOTO_QUESTION : '');
    if (!q || sendingRef.current) return false;
    const d0 = ref.current;
    const set = chatSettings(d0);
    const nowDay = chatDayKey(new Date(), set.dayStartHour);
    const chatId = activeChatId(shared, nowDay);
    const prev = d0.chats?.find((c) => c.id === chatId)?.messages || [];
    const saved = photos.map((p) => persistPhoto(p.uri));
    const question = { ...newMsg('user', q), ...(saved.length ? { photos: saved } : {}) };
    store.appendChatMsg(chatId, question);
    sendingRef.current = true;
    setSending(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    let ok = true;
    try {
      const key = await getKey(d0.ai.provider);
      if (!key) throw new Error('Чтобы ИИ отвечал, добавьте ключ в настройках.');
      const answer = await chatWithAI(d0.ai, key, requestTurns(prev, question, set.ctx.history), buildChatContext(ref.current, new Date(), set.ctx), photos.filter((p) => p.base64).map((p) => ({ base64: p.base64, mime: p.mime })), ctl.signal);
      store.appendChatMsg(chatId, newMsg('ai', answer));
      play('ai');
    } catch (e: any) {
      ok = false;
      // отмена — не ошибка: короткая пометка, вопрос возвращается в поле ввода
      store.appendChatMsg(chatId, newMsg('ai', isCancelled(e) ? 'Запрос отменён.' : e?.message || String(e), Date.now(), true));
    } finally {
      sendingRef.current = false;
      abortRef.current = null;
      setSending(false);
    }
    return ok;
  };

  /** Отменить ожидание ответа ИИ. */
  const cancel = () => abortRef.current?.abort();
  const open = (cid: string) => setShared(cid === dayId ? null : { id: cid, day: dayId });
  /** Новый пустой чат; сразу становится активным (до смены дня). */
  const create = () => { const nid = newChatId(); store.createChat(nid); setShared({ id: nid, day: dayId }); return nid; };
  /** Если удалён активный чат — вернуться к чату дня. */
  const forget = (cid: string) => { if (shared?.id === cid) setShared(null); };

  return {
    id, dayId, isToday: id === dayId, messages, sending, send, cancel, open, create, forget, settings: cs,
    title: chatName(chat, id, new Date(), cs.dayStartHour),
  };
}
export type ChatApi = ReturnType<typeof useChat>;
