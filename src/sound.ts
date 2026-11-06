import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/** Мягкие звуки природы вместо вибрации. Встроенные файлы лежат в assets/sounds. */
export type SoundName = 'drop' | 'splash' | 'wood' | 'bird' | 'leaf' | 'chime' | 'pebble' | 'breeze';

export const SOUND_NAMES: { key: SoundName; label: string }[] = [
  { key: 'drop', label: 'Капля' },
  { key: 'splash', label: 'Всплеск' },
  { key: 'pebble', label: 'Камешек в воду' },
  { key: 'wood', label: 'Мягкий стук' },
  { key: 'bird', label: 'Птичка' },
  { key: 'leaf', label: 'Шорох листвы' },
  { key: 'chime', label: 'Капли-мелодия' },
  { key: 'breeze', label: 'Ветерок' },
];

const SRC: Record<SoundName, number> = {
  drop: require('../assets/sounds/drop.wav'),
  splash: require('../assets/sounds/splash.wav'),
  wood: require('../assets/sounds/wood.wav'),
  bird: require('../assets/sounds/bird.wav'),
  leaf: require('../assets/sounds/leaf.wav'),
  chime: require('../assets/sounds/chime.wav'),
  pebble: require('../assets/sounds/pebble.wav'),
  breeze: require('../assets/sounds/breeze.wav'),
};
/** Общая громкость: выбор пользователя в настройках звуков (файлы и так нормализованы до пика ~0.85). */
export type SoundVolume = 'low' | 'mid' | 'high';
export const VOLUMES: { key: SoundVolume; label: string; gain: number }[] = [
  { key: 'low', label: 'Тише', gain: 0.35 },
  { key: 'mid', label: 'Средне', gain: 0.7 },
  { key: 'high', label: 'Громко', gain: 1 },
];
export const volumeGain = (v?: string): number => VOLUMES.find((x) => x.key === v)?.gain ?? 1;

/** События приложения со звуком. */
export type SoundEvent = 'water' | 'waterLess' | 'add' | 'saved' | 'remove' | 'ai' | 'preset' | 'splash';
export const EVENTS: { key: SoundEvent; label: string; hint: string; def: SoundName }[] = [
  { key: 'water', label: 'Стакан воды', hint: 'добавили воду', def: 'splash' },
  { key: 'waterLess', label: 'Убавили воду', hint: '', def: 'drop' },
  { key: 'add', label: 'Блюдо добавлено', hint: 'в дневник', def: 'wood' },
  { key: 'saved', label: 'Сохранено', hint: 'заполнили данные', def: 'bird' },
  { key: 'remove', label: 'Удалено', hint: 'запись из дневника', def: 'leaf' },
  { key: 'ai', label: 'ИИ закончил', hint: 'ответ получен', def: 'chime' },
  { key: 'preset', label: 'Блюдо сохранено', hint: 'в «Мои блюда»', def: 'drop' },
];

let enabled = true;
let gain = 1;
let modeReady: Promise<void> | null = null;
let map: Record<string, string> = {};
const players: Record<string, AudioPlayer> = {};

let resolveUri: (u: string) => string = (u) => u;
/** Подставляется приложением: находит свой звук по имени файла в актуальной папке. */
export const setSoundResolver = (fn: (u: string) => string) => { resolveUri = fn; };
export const setSoundsEnabled = (v: boolean) => { enabled = v; };
export const setSoundMap = (m: Record<string, string>) => { map = m || {}; };
export const setSoundVolume = (v?: string) => {
  gain = volumeGain(v);
  for (const p of Object.values(players)) { try { p.volume = gain; } catch {} }
};

/** Аудиорежим настраиваем один раз и ждём его до первого звука — иначе на iPhone первый play уходит в «беззвучную» сессию. */
const ensureMode = (): Promise<void> => {
  if (!modeReady) {
    // звуки слышны и при включённом беззвучном переключателе; музыку пользователя не перебиваем
    modeReady = Promise.resolve(setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })).then(() => {}).catch(() => {});
  }
  return modeReady;
};

async function run(choice: string) {
  try {
    await ensureMode();
    let p = players[choice];
    if (!p) {
      const src = choice.startsWith('file:') ? { uri: resolveUri(choice.slice(5)) } : SRC[choice as SoundName];
      if (!src) return;
      p = createAudioPlayer(src as any);
      players[choice] = p;
    }
    p.volume = gain;
    try { await p.seekTo(0); } catch {}
    p.play();
  } catch {
    /* без звука — не страшно */
  }
}

/** Играет звук события (учитывает выбор пользователя; 'off' — тишина). */
export function play(ev: SoundEvent) {
  if (!enabled) return;
  const def = EVENTS.find((e) => e.key === ev)?.def || 'drop';
  const c = map[ev] || def;
  if (c === 'off') return;
  void run(c);
}

/** Прослушать вариант даже при выключенных звуках. */
export const preview = (choice: string) => { if (choice !== 'off') void run(choice); };
/** Забыть закэшированный плеер (после смены файла). */
export const dropPlayer = (choice: string) => { try { players[choice]?.remove?.(); } catch {} delete players[choice]; };
