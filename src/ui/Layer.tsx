import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

type Api = {
  mount: (id: string, node: React.ReactNode) => void;
  unmount: (id: string) => void;
  /** размер и положение слоя в окне: чтобы пересчитать координаты кнопки в координаты слоя */
  box: { x: number; y: number; w: number; h: number };
};
const Ctx = createContext<Api | null>(null);
export const useLayer = () => useContext(Ctx);

/**
 * Слой «поверх всего»: плавающие окошки (выбор модели) рисуются в нём, а не рядом с кнопкой — поэтому их ничто не
 * перекрывает и не обрезает. Свой слой есть у приложения и у каждого окна (Sheet — это отдельный Modal).
 */
export function LayerRoot({ children }: { children: React.ReactNode }) {
  const [nodes, setNodes] = useState<{ id: string; node: React.ReactNode }[]>([]);
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const host = useRef<any>(null);
  const mount = useCallback((id: string, node: React.ReactNode) => setNodes((n) => [...n.filter((x) => x.id !== id), { id, node }]), []);
  const unmount = useCallback((id: string) => setNodes((n) => n.filter((x) => x.id !== id)), []);
  const api = useMemo(() => ({ mount, unmount, box }), [mount, unmount, box]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <View ref={host} collapsable={false} pointerEvents="box-none"
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          const set = (x: number, y: number) => setBox((b) => (b.x === x && b.y === y && b.w === w && b.h === h ? b : { x, y, w, h }));
          if (host.current?.measureInWindow) host.current.measureInWindow((x: number, y: number) => set(x || 0, y || 0)); else set(0, 0);
        }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 9999, elevation: 9999 }}>
        {nodes.map((n) => <React.Fragment key={n.id}>{n.node}</React.Fragment>)}
      </View>
    </Ctx.Provider>
  );
}
