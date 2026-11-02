jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), seekTo: jest.fn(async () => {}), volume: 1, remove: jest.fn() })),
  setAudioModeAsync: jest.fn(async () => {}),
}));
import * as audio from 'expo-audio';
import { EVENTS, play, preview, setSoundMap, setSoundsEnabled, setSoundVolume, SOUND_NAMES, VOLUMES, volumeGain } from '../src/sound';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('звук', () => {
  test('громкость: Тише < Средне < Громко, по умолчанию — громко', () => {
    expect(VOLUMES.map((v) => v.key)).toEqual(['low', 'mid', 'high']);
    expect(volumeGain('low')).toBeLessThan(volumeGain('mid'));
    expect(volumeGain('mid')).toBeLessThan(volumeGain('high'));
    expect(volumeGain('high')).toBe(1);
    expect(volumeGain(undefined)).toBe(1);
    expect(volumeGain('xyz')).toBe(1);
  });
  test('у каждого события есть существующий звук по умолчанию', () => {
    const names = SOUND_NAMES.map((s) => s.key);
    for (const e of EVENTS) expect(names).toContain(e.def);
  });
  test('на iPhone звук слышен при беззвучном переключателе (playsInSilentMode)', async () => {
    setSoundsEnabled(true); setSoundMap({}); setSoundVolume('high');
    play('add');
    await flush();
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: true }));
    expect(audio.createAudioPlayer).toHaveBeenCalled();
    const p = (audio.createAudioPlayer as jest.Mock).mock.results[0].value;
    expect(p.play).toHaveBeenCalled();
    expect(p.volume).toBe(1);
  });
  test('режим настраивается один раз и до первого воспроизведения', async () => {
    (audio.setAudioModeAsync as jest.Mock).mockClear();
    play('water'); play('remove');
    await flush();
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled(); // уже настроен в прошлом тесте
  });
  test('выключенные звуки и «off» ничего не играют', async () => {
    (audio.createAudioPlayer as jest.Mock).mockClear();
    setSoundsEnabled(false); play('saved'); await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    setSoundsEnabled(true); setSoundMap({ saved: 'off' }); play('saved'); await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    preview('off'); await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
  });
  test('выбор пользователя применяется; громкость обновляет плееры', async () => {
    setSoundMap({ preset: 'bird' }); setSoundVolume('low');
    play('preset'); await flush();
    const p = (audio.createAudioPlayer as jest.Mock).mock.results.at(-1)!.value;
    expect(p.volume).toBe(volumeGain('low'));
    setSoundVolume('mid');
    expect(p.volume).toBe(volumeGain('mid'));
  });
});
