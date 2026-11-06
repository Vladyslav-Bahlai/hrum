import { AppData } from './types';
import { dayKeyAt } from './utils';

/**
 * Демо-данные ТОЛЬКО для CI-проверки на эмуляторах (сборка с EXPO_PUBLIC_DEMO=1).
 * В обычной сборке переменная пустая — этот код не выполняется.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

export function demoData(): Partial<AppData> {
  const T = Date.now();
  const k = (n: number) => dayKeyAt(T + n * 86400000);
  const it = (name: string, kcal: number, section = '') => ({ name, kcal, protein: 20, fat: 10, carbs: 30, section });
  const msgs = Array.from({ length: 16 }, (_, i) => ({ id: 'm' + i, role: (i % 2 ? 'ai' : 'user') as 'ai' | 'user', text: i % 2 ? `Ответ ИИ номер ${i}: на ужин подойдёт рыба с овощами, а на перекус — йогурт. Осталось примерно ${900 - i * 20} ккал.` : `Вопрос ${i}: что съесть дальше?`, at: T - (16 - i) * 60000 }));
  return {
    version: 1, onboarded: true,
    entries: [
      { id: 'e1', date: k(0), time: T - 3 * 3600000, meal: 'breakfast', item: it('Сырники со сметаной', 320), portion: 1, source: 'manual' },
      { id: 'e2', date: k(0), time: T - 3600000, meal: 'lunch', item: it('Борщ', 260), portion: 1, source: 'manual' },
      { id: 'e3', date: k(0), time: T - 1800000, meal: 'lunch', item: it('Пирог с лимонным курдом', 740, 'Завтрак'), portion: 1, source: 'manual', menuId: 'd1' },
      { id: 'e4', date: k(-1), time: T - 86400000, meal: 'dinner', item: it('Омлет', 300), portion: 1, source: 'manual' },
    ],
    favorites: [{ id: 'f1', item: it('Йогурт', 120), uses: 3 }, { id: 'f2', item: it('Овсянка с бананом', 310), uses: 2 }],
    menus: [
      { id: 'd1', title: 'Сб (31.10.2026)', created: 1, dates: [k(0)], items: [it('Пирог с лимонным курдом', 740, 'Завтрак'), it('Филе белой рыбы с рисом', 744, 'Обед'), it('Стейк на гриле с булгуром', 654, 'Ужин')] },
      { id: 'd2', title: 'Пн (02.11.2026) — очень длинное название', created: 2, dates: [k(0)], items: [it('Шаурма', 600, 'Обед')] },
      { id: 'd3', title: 'Вс (01.11.2026) — ещё меню', created: 3, dates: [k(0)], items: [it('Каша', 250, 'Завтрак')] },
      { id: 'd4', title: 'Пт (30.10.2026) — четвёртое', created: 4, dates: [k(0)], items: [it('Омлет', 300, 'Завтрак')] },
      { id: 'old', done: true, title: 'Чт (29.10.2026)', created: 0, dates: [k(-5)], items: [it('Суп', 300, 'Обед')] },
    ],
    chats: [{ id: k(0), messages: msgs, updatedAt: T }],
    weights: [], water: {},
  };
}
