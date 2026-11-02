import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface Picked { uri: string; base64: string; mime: string }

async function shrink(uri: string): Promise<Picked> {
  if (Platform.OS === 'web') {
    // на вебе манипулятор тоже работает, но оставим безопасный путь
  }
  // 1100px хватает, чтобы ИИ прочитал таблицу меню, но запрос остаётся лёгким
  // для мобильного интернета — большие base64 часто рвутся на полпути.
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1100 });
  const ref = await ctx.renderAsync();
  let out = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  // если всё равно тяжело (детальное фото меню) — ужимаем ещё раз
  if ((out.base64?.length || 0) > 900000) {
    const c2 = ImageManipulator.manipulate(out.uri);
    c2.resize({ width: 850 });
    const r2 = await c2.renderAsync();
    out = await r2.saveAsync({ compress: 0.5, format: SaveFormat.JPEG, base64: true });
  }
  return { uri: out.uri, base64: out.base64 || '', mime: 'image/jpeg' };
}

export async function fromCamera(): Promise<Picked[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Нет доступа к камере', 'Разрешите доступ к камере в настройках телефона.');
    return [];
  }
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (r.canceled) return [];
  return Promise.all(r.assets.map((a) => shrink(a.uri)));
}

export async function fromGallery(limit = 4): Promise<Picked[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Нет доступа к галерее', 'Разрешите доступ к фото в настройках телефона.');
    return [];
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true, selectionLimit: limit,
  });
  if (r.canceled) return [];
  return Promise.all(r.assets.slice(0, limit).map((a) => shrink(a.uri)));
}
