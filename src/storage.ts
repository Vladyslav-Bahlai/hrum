import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppData } from './types';
import { DEMO, demoData } from './demo';

/**
 * Все данные хранятся локально на телефоне, в папке приложения:
 *   <documents>/Hrum/data.json   — дневник, профиль, цели, вес, вода
 *   <documents>/Hrum/photos/     — фото блюд
 *   <documents>/Hrum/backups/    — резервные копии для экспорта
 * API-ключи — отдельно, в защищённом хранилище (Keychain / Keystore).
 */
const isWeb = Platform.OS === 'web';

const root = () => new Directory(Paths.document, 'Hrum');
const photosDir = () => new Directory(root(), 'photos');
const dataFile = () => new File(root(), 'data.json');

function ensureDirs() {
  const r = root();
  if (!r.exists) r.create({ intermediates: true, idempotent: true });
  const p = photosDir();
  if (!p.exists) p.create({ intermediates: true, idempotent: true });
}

export async function loadData(): Promise<Partial<AppData> | null> {
  // CI-сборка с демо-данными (EXPO_PUBLIC_DEMO=1): каждый запуск — с чистыми демо-данными
  if (DEMO) return demoData();
  try {
    if (isWeb) {
      const s = globalThis.localStorage?.getItem('hrum-data');
      return s ? JSON.parse(s) : null;
    }
    ensureDirs();
    const f = dataFile();
    if (!f.exists) return null;
    return JSON.parse(await f.text());
  } catch (e) {
    console.warn('loadData', e);
    return null;
  }
}

let writing: Promise<void> = Promise.resolve();
export function saveData(data: AppData) {
  const json = JSON.stringify(data);
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem('hrum-data', json);
    } catch {}
    return;
  }
  // последовательная запись, чтобы файлы не перетирали друг друга
  writing = writing
    .then(async () => {
      ensureDirs();
      const tmp = new File(root(), 'data.tmp.json');
      if (tmp.exists) tmp.delete();
      tmp.create();
      await tmp.write(json);
      const f = dataFile();
      if (f.exists) f.delete();
      tmp.moveSync(f);
    })
    .catch((e) => console.warn('saveData', e));
}

/** Копирует фото из кэша пикера в постоянную папку приложения. */
export function persistPhoto(uri: string): string {
  if (isWeb) return uri;
  try {
    ensureDirs();
    const src = new File(uri);
    const dst = new File(photosDir(), `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`);
    src.copySync(dst);
    return dst.uri;
  } catch (e) {
    console.warn('persistPhoto', e);
    return uri;
  }
}

export function deletePhoto(uri?: string) {
  if (!uri || isWeb) return;
  try {
    const f = new File(uri);
    if (f.exists && f.uri.includes('/Hrum/')) f.delete();
  } catch {}
}

export async function writeBackup(data: AppData): Promise<string> {
  const dir = new Directory(root(), 'backups');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const d = new Date();
  const name = `hrum-backup-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.json`;
  const f = new File(dir, name);
  if (f.exists) f.delete();
  f.create();
  await f.write(JSON.stringify(data, null, 1));
  return f.uri;
}

export async function readTextFile(uri: string) {
  return new File(uri).text();
}

export const storagePath = () => (isWeb ? 'localStorage' : root().uri);

// ---- ключи ----
const keyName = (p: string) => `hrum_key_${p}`;
export async function getKey(provider: string): Promise<string> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(keyName(provider)) || '';
    return (await SecureStore.getItemAsync(keyName(provider))) || '';
  } catch {
    return '';
  }
}
export async function setKey(provider: string, value: string) {
  if (isWeb) {
    globalThis.localStorage?.setItem(keyName(provider), value);
    return;
  }
  if (value) await SecureStore.setItemAsync(keyName(provider), value);
  else await SecureStore.deleteItemAsync(keyName(provider));
}

/** Копирует выбранный пользователем звук в папку приложения и возвращает его uri. */
export function importSound(ev: string, srcUri: string, name?: string): string {
  if (isWeb) return srcUri;
  const dir = new Directory(root(), 'sounds');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const ext = (name?.match(/\.(\w{2,4})$/)?.[1] || srcUri.match(/\.(\w{2,4})$/)?.[1] || 'mp3').toLowerCase();
  const dest = new File(dir, `${ev}-${Date.now()}.${ext}`);
  new File(srcUri).copy(dest);
  return dest.uri;
}

/** Постоянный кэш SVG иконок Iconify: <cache>/Hrum-icons/<prefix>__<name>.svg; на вебе — localStorage (ограниченно). */
export const iconSvgStore = {
  async get(icon: string): Promise<string | undefined> {
    try {
      if (isWeb) return globalThis.localStorage?.getItem('hrum-icon:' + icon) || undefined;
      const f = new File(new Directory(Paths.cache, 'Hrum-icons'), icon.replace(':', '__') + '.svg');
      return f.exists ? await f.text() : undefined;
    } catch { return undefined; }
  },
  async set(icon: string, svg: string): Promise<void> {
    try {
      if (isWeb) {
        const ls = globalThis.localStorage;
        if (!ls) return;
        // не больше ~300 иконок на вебе
        const keys = Object.keys(ls).filter((k) => k.startsWith('hrum-icon:'));
        if (keys.length > 300) keys.slice(0, 50).forEach((k) => ls.removeItem(k));
        ls.setItem('hrum-icon:' + icon, svg);
        return;
      }
      const d = new Directory(Paths.cache, 'Hrum-icons');
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
      const f = new File(d, icon.replace(':', '__') + '.svg');
      f.write(svg);
    } catch {}
  },
};

/** Офлайн-паки иконок: <documents>/Hrum/iconpacks/<prefix>.json; на вебе — localStorage (если влезет), иначе ошибка. */
const packMem = new Map<string, any>();
export const packStore = {
  memory: (prefix: string) => packMem.get(prefix),
  async load(prefix: string): Promise<any | undefined> {
    if (packMem.has(prefix)) return packMem.get(prefix);
    try {
      let txt: string | undefined;
      if (isWeb) txt = globalThis.localStorage?.getItem('hrum-pack:' + prefix) || undefined;
      else {
        const f = new File(new Directory(root(), 'iconpacks'), prefix + '.json');
        txt = f.exists ? await f.text() : undefined;
      }
      if (!txt) return undefined;
      const j = JSON.parse(txt);
      packMem.set(prefix, j);
      return j;
    } catch { return undefined; }
  },
  async save(prefix: string, json: any): Promise<void> {
    const txt = JSON.stringify(json);
    if (isWeb) {
      try { globalThis.localStorage?.setItem('hrum-pack:' + prefix, txt); } catch { throw new Error('В браузере не хватает места для этого пака'); }
    } else {
      const d = new Directory(root(), 'iconpacks');
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
      new File(d, prefix + '.json').write(txt);
    }
    packMem.set(prefix, json);
  },
  async remove(prefix: string): Promise<void> {
    packMem.delete(prefix);
    try {
      if (isWeb) globalThis.localStorage?.removeItem('hrum-pack:' + prefix);
      else { const f = new File(new Directory(root(), 'iconpacks'), prefix + '.json'); if (f.exists) f.delete(); }
    } catch {}
  },
};
