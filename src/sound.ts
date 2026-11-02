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
const VOL: Record<SoundName, number> = { drop: 0.8, splash: 0.8, wood: 0.9, bird: 0.7, leaf: 0.8, chime: 0.7, pebble: 0.8, breeze: 0.7 };

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
let ready = false;
let map: Record<string, string> = {};
const players: Record<string, AudioPlayer> = {};

export const setSoundsEnabled = (v: boolean) => { enabled = v; };
export const setSoundMap = (m: Record<string, string>) => { map = m || {}; };

function run(choice: string, vol?: number) {
  try {
    if (!ready) {
      ready = true;
      // не перебиваем музыку пользователя; в беззвучном режиме молчим
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    let p = players[choice];
    if (!p) {
      const src = choice.startsWith('file:') ? { uri: choice.slice(5) } : SRC[choice as SoundName];
      if (!src) return;
      p = createAudioPlayer(src as any);
      p.volume = vol ?? VOL[choice as SoundName] ?? 0.8;
      players[choice] = p;
    }
    Promise.resolve(p.seekTo(0)).catch(() => {});
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
  run(c);
}

/** Прослушать вариант даже при выключенных звуках. */
export const preview = (choice: string) => { if (choice !== 'off') run(choice); };
/** Забыть закэшированный плеер (после смены файла). */
export const dropPlayer = (choice: string) => { try { players[choice]?.remove?.(); } catch {} delete players[choice]; };
