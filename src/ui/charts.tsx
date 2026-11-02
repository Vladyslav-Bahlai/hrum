import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { C } from '../theme';

export function Ring({ value, max, size = 132, stroke = 9, children }: { value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const pct = max > 0 ? value / max : 0;
  const over = pct > 1.05;
  const main = Math.min(1, pct);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={over ? C.over : C.accent} strokeWidth={stroke} fill="none"
          strokeDasharray={`${len * main} ${len}`} strokeLinecap="round" rotation={-90} originX={size / 2} originY={size / 2} />
      </Svg>
      {children}
    </View>
  );
}

/** Столбцы калорий по дням + пунктир нормы. */
export function DayBars({ data, target, width, height = 150, onPress, selected }: {
  data: { key: string; label: string; value: number; unk?: number }[]; target: number; width: number; height?: number;
  onPress?: (key: string) => void; selected?: string;
}) {
  const padB = 18, padT = 8;
  const maxV = Math.max(target * 1.25, ...data.map((d) => d.value), 1);
  const hasUnk = data.some((d) => d.unk);
  const gh = hasUnk ? 16 : 0; // место под «призрачный» столбик неизвестного
  const h = height - padB - padT - gh;
  const n = data.length;
  const gap = n > 14 ? 2 : 6;
  const bw = Math.max(2, (width - gap * (n - 1)) / n);
  const y = (v: number) => padT + gh + h - (v / maxV) * h;
  const showLabel = (i: number) => n <= 7 || (n <= 14 ? i % 2 === 0 : i % 5 === 0 || i === n - 1);
  return (
    <Svg width={width} height={height}>
      {data.map((d, i) => {
        const x = i * (bw + gap);
        const over = d.value > target * 1.05;
        const bh = Math.max(d.value > 0 ? 2 : 0, (d.value / maxV) * h);
        const top = padT + gh + h - bh;
        return (
          <React.Fragment key={d.key}>
            <Rect x={x} y={padT} width={bw} height={h + gh} fill="transparent" onPress={onPress ? () => onPress(d.key) : undefined} />
            {d.unk ? (
              <>
                <Rect x={x + 0.5} y={top - gh} width={Math.max(1, bw - 1)} height={gh - 2} rx={Math.min(3, bw / 2)}
                  fill={C.line} stroke={C.muted} strokeDasharray="2 2" strokeWidth={1} onPress={onPress ? () => onPress(d.key) : undefined} />
                {bw >= 12 ? <SvgText x={x + bw / 2} y={top - gh + 11} fontSize={10} fontWeight="700" fill={C.muted} textAnchor="middle">?</SvgText> : null}
              </>
            ) : null}
            <Rect x={x} y={top} width={bw} height={bh} rx={Math.min(3, bw / 2)}
              fill={selected === d.key ? C.accentDark : over ? C.over : C.accent} opacity={d.value ? (selected && selected !== d.key ? 0.45 : 1) : 0}
              onPress={onPress ? () => onPress(d.key) : undefined} />
            {d.value === 0 ? <Rect x={x} y={padT + gh + h - 2} width={bw} height={2} fill={C.line} /> : null}
            {showLabel(i) ? (
              <SvgText x={x + bw / 2} y={height - 4} fontSize={10} fill={C.muted} textAnchor="middle">{d.label}</SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
      {target > 0 ? <Line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke={C.inkSoft} strokeDasharray="3 4" strokeWidth={1} /> : null}
    </Svg>
  );
}

export function LineChart({ points, width, height = 140, suffix = '' }: { points: { label: string; v: number }[]; width: number; height?: number; suffix?: string }) {
  if (points.length < 2) return null;
  const padL = 34, padB = 18, padT = 10;
  const vs = points.map((p) => p.v);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx - mn < 2) { mn -= 1; mx += 1; }
  const w = width - padL, h = height - padB - padT;
  const x = (i: number) => padL + (i / (points.length - 1)) * w;
  const y = (v: number) => padT + h - ((v - mn) / (mx - mn)) * h;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ticks = [mn, (mn + mx) / 2, mx];
  return (
    <Svg width={width} height={height}>
      {ticks.map((t, i) => (
        <React.Fragment key={i}>
          <Line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke={C.line} strokeWidth={1} />
          <SvgText x={padL - 6} y={y(t) + 3} fontSize={10} fill={C.muted} textAnchor="end">{t.toFixed(1)}</SvgText>
        </React.Fragment>
      ))}
      <Path d={d} stroke={C.accent} strokeWidth={2} fill="none" strokeLinejoin="round" />
      {points.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.v)} r={points.length > 20 ? 1.8 : 3} fill={C.surface} stroke={C.accent} strokeWidth={1.5} />)}
      <SvgText x={padL} y={height - 4} fontSize={10} fill={C.muted}>{points[0].label}</SvgText>
      <SvgText x={width} y={height - 4} fontSize={10} fill={C.muted} textAnchor="end">{points[points.length - 1].label}{suffix}</SvgText>
    </Svg>
  );
}

/** Горизонтальная полоса долей Б/Ж/У по калориям. */
export function SplitBar({ parts, height = 10 }: { parts: { v: number; color: string; unknown?: boolean }[]; height?: number }) {
  const total = parts.reduce((a, b) => a + b.v, 0) || 1;
  return (
    <View style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: C.line, gap: 2 }}>
      {parts.map((p, i) => (p.v > 0 ? <View key={i} style={[{ flex: p.v / total, backgroundColor: p.color }, p.unknown && { borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted, borderRadius: height / 2 }]} /> : null))}
    </View>
  );
}

export function Legend({ items }: { items: { color: string; label: string; unknown?: boolean }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }, it.unknown && { borderWidth: 1, borderStyle: 'dashed', borderColor: C.muted }]} />
          <Text style={{ fontSize: 12.5, flexShrink: 1, color: it.unknown ? C.muted : C.inkSoft }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}
