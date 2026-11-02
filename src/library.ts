import { AppData, FoodItem } from './types';

export interface LibItem {
  key: string;
  item: FoodItem;
  presetId?: string;
  count: number;
  last: number;
}

/** Все известные блюда: «Мои блюда» + всё, что было в меню и в дневнике. */
export function buildLibrary(data: AppData): LibItem[] {
  const map = new Map<string, LibItem>();
  const key = (n: string) => n.trim().toLowerCase();
  for (const e of data.entries) {
    const k = key(e.item.name);
    if (!k) continue;
    const cur = map.get(k);
    if (!cur) map.set(k, { key: k, item: { ...e.item, section: undefined, portion: undefined }, count: 1, last: e.time });
    else {
      cur.count++;
      if (e.time > cur.last) { cur.last = e.time; cur.item = { ...e.item, section: undefined, portion: undefined }; }
    }
  }
  for (const m of data.menus) for (const it of m.items) {
    const k = key(it.name);
    if (!k) continue;
    const cur = map.get(k);
    if (!cur) map.set(k, { key: k, item: { ...it, section: undefined, portion: undefined }, count: 0, last: m.created });
  }
  for (const f of data.favorites) {
    const k = key(f.item.name);
    const cur = map.get(k);
    map.set(k, { key: k, item: f.item, presetId: f.id, count: cur?.count || 0, last: cur?.last || 0 });
  }
  return [...map.values()].sort((a, b) => (b.presetId ? 1 : 0) - (a.presetId ? 1 : 0) || b.count - a.count || b.last - a.last);
}

export function searchLibrary(list: LibItem[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  const words = t.split(/\s+/);
  return list.filter((l) => words.every((w) => l.key.includes(w)));
}
