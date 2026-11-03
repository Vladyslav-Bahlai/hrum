import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Text } from './RNText';
import { useStore } from '../store';
import { OPENMOJI } from '../openmojiData';
import { findIconOnce, fromSource, ICON_PX, loadSvg, normalizeIconSettings, onlineQueries, resolveIcon, svgFromJson, svgFromMemory } from '../iconify';
import { iconSvgStore, packStore } from '../storage';
import { IconRef } from '../types';

/** Эмодзи-текст фиксированного размера (на всех платформах одинаковая ширина). */
function EmojiGlyph({ emoji, size }: { emoji: string; size: number }) {
  return <Text style={{ fontSize: size * 0.8, lineHeight: size * 1.05, width: size, textAlign: 'center' }} maxFontSizeMultiplier={1}>{emoji}</Text>;
}

/** SVG из скачанного пака (данные пака читаются один раз и держатся в памяти). */
function usePackSvg(prefix?: string, name?: string): string | undefined {
  const [xml, setXml] = useState<string | undefined>(() => (prefix && name ? svgFromJson(packStore.memory(prefix), name) : undefined));
  useEffect(() => {
    if (!prefix || !name) { setXml(undefined); return; }
    const m = packStore.memory(prefix);
    if (m) { setXml(svgFromJson(m, name)); return; }
    let alive = true;
    packStore.load(prefix).then((j) => { if (alive) setXml(svgFromJson(j, name)); });
    return () => { alive = false; };
  }, [prefix, name]);
  return xml;
}

function useOnlineSvg(icon?: string): string | undefined {
  const [xml, setXml] = useState<string | undefined>(() => (icon ? svgFromMemory(icon) : undefined));
  useEffect(() => {
    if (!icon) { setXml(undefined); return; }
    const m = svgFromMemory(icon);
    if (m) { setXml(m); return; }
    let alive = true;
    loadSvg(icon, iconSvgStore).then((x) => { if (alive) setXml(x); }).catch(() => {});
    return () => { alive = false; };
  }, [icon]);
  return xml;
}

/** Рисует найденную иконку; пока SVG грузится — показывает `placeholder` (без пустого места и мигания). */
export function IconView({ r, size, placeholder }: { r: IconRef | null; size: number; placeholder?: React.ReactNode }) {
  const packXml = usePackSvg(r?.kind === 'pack' ? r.prefix : undefined, r?.kind === 'pack' ? r.name : undefined);
  const onXml = useOnlineSvg(r?.kind === 'online' ? r.icon : undefined);
  let body: React.ReactNode = placeholder ?? <EmojiGlyph emoji="🍽️" size={size} />;
  if (r?.kind === 'emoji') body = <EmojiGlyph emoji={r.emoji} size={size} />;
  else if (r?.kind === 'openmoji' && OPENMOJI[r.hex]) body = <SvgXml xml={OPENMOJI[r.hex]} width={size} height={size} />;
  else if (r?.kind === 'pack' && packXml) body = <SvgXml xml={packXml} width={size} height={size} />;
  else if (r?.kind === 'online' && onXml) body = <SvgXml xml={onXml} width={size} height={size} />;
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{body}</View>;
}

/**
 * Иконка блюда — одна для карусели, меню и дневника. Источники — цепочкой из Настроек («Иконки блюд»):
 * сверху вниз до первого найденного (паки, OpenMoji, эмодзи, эмодзи от ИИ, Iconify онлайн, 🍽️); ручная привязка — важнее всего.
 * Онлайн-поиск идёт один раз на название (кэш); пока он не ответил — показывается следующий источник.
 * Долгое нажатие (если передан onLongPress) — выбрать иконку вручную.
 */
export function DishIcon({ name, emoji, en, size, where, onLongPress }: {
  name: string; emoji?: string; en?: string; size?: number;
  /** где показывается (настройка «показывать иконки»): если в этом месте выключено — ничего не рисуем */
  where?: 'diary' | 'menu' | 'carousel';
  onLongPress?: () => void;
}) {
  const { data, cacheIcon } = useStore();
  const st = data.icons || normalizeIconSettings(undefined);
  const px = size ?? ICON_PX[st.size];
  const ctx = { settings: st, downloaded: data.iconPacks, onlineCache: data.iconCache };
  const res = resolveIcon(name, emoji, en, ctx);
  useEffect(() => {
    if (!res.needOnline) return;
    findIconOnce(res.needOnline, onlineQueries(name, en, emoji, st.first), st.online.sets, undefined, { coloredOnly: st.online.coloredOnly, limit: st.online.limit })
      .then((icon) => cacheIcon(res.needOnline!, icon))
      .catch(() => {}); // нет сети — остаётся следующий источник, попробуем при следующем показе
  }, [res.needOnline]); // eslint-disable-line react-hooks/exhaustive-deps
  if (where && !st.show[where]) return null;
  // пока SVG пака/онлайн грузится с диска или сети — встроенный OpenMoji того же блюда (или эмодзи)
  const ph = res.ref && (res.ref.kind === 'pack' || res.ref.kind === 'online') ? fromSource('openmoji', name, emoji, en, ctx) : undefined;
  const view = <IconView r={res.ref} size={px} placeholder={ph && ph !== 'pending' ? <IconView r={ph} size={px} /> : undefined} />;
  if (!onLongPress) return view;
  return <Pressable accessibilityLabel="Сменить иконку" onLongPress={onLongPress} delayLongPress={400} hitSlop={4}>{view}</Pressable>;
}
