import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppData } from './types';

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
