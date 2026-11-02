import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '../theme';

export type IconName =
  | 'plus' | 'camera' | 'image' | 'send' | 'left' | 'right' | 'down' | 'calendar' | 'chart' | 'gear'
  | 'book' | 'star' | 'starFill' | 'trash' | 'close' | 'check' | 'edit' | 'drop' | 'repeat' | 'search'
  | 'scale' | 'sparkle' | 'copy' | 'pen' | 'list' | 'expand' | 'up' | 'chat' | 'pin' | 'more';

export function Icon({ name, size = 20, color = C.ink, stroke = 1.7 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const p = { stroke: color, strokeWidth: stroke, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: React.ReactNode = null;
  switch (name) {
    case 'plus': body = <Path d="M12 5v14M5 12h14" {...p} />; break;
    case 'camera': body = <><Path d="M4 8h3l1.5-2h7L17 8h3v11H4z" {...p} /><Circle cx="12" cy="13" r="3.5" {...p} /></>; break;
    case 'image': body = <><Rect x="3.5" y="5" width="17" height="14" rx="2" {...p} /><Circle cx="9" cy="10" r="1.6" {...p} /><Path d="M4 17l5-4.5 4 3.5 2.5-2 4.5 3.5" {...p} /></>; break;
    case 'send': body = <Path d="M12 19V5M6 11l6-6 6 6" {...p} />; break;
    case 'left': body = <Path d="M15 5l-7 7 7 7" {...p} />; break;
    case 'right': body = <Path d="M9 5l7 7-7 7" {...p} />; break;
    case 'up': body = <Path d="M6 15l6-6 6 6" {...p} />; break;
    case 'down': body = <Path d="M6 9l6 6 6-6" {...p} />; break;
    case 'calendar': body = <><Rect x="4" y="5.5" width="16" height="14.5" rx="2" {...p} /><Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" {...p} /></>; break;
    case 'chart': body = <Path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" {...p} />; break;
    case 'gear': body = <><Circle cx="12" cy="12" r="3" {...p} /><Path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} /></>; break;
    case 'book': body = <><Path d="M5 4.5h11a3 3 0 013 3V20H8a3 3 0 01-3-3z" {...p} /><Path d="M5 17a3 3 0 013-3h11" {...p} /></>; break;
    case 'star': body = <Path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" {...p} />; break;
    case 'starFill': body = <Path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" {...p} fill={color} />; break;
    case 'trash': body = <Path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" {...p} />; break;
    case 'close': body = <Path d="M6 6l12 12M18 6L6 18" {...p} />; break;
    case 'check': body = <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />; break;
    case 'edit': case 'pen': body = <Path d="M5 19l1-4L16 5l3 3L9 18zM14 7l3 3" {...p} />; break;
    case 'drop': body = <Path d="M12 4s6 6.5 6 10.5a6 6 0 01-12 0C6 10.5 12 4 12 4z" {...p} />; break;
    case 'repeat': body = <Path d="M17 4l3 3-3 3M20 7H8a4 4 0 00-4 4M7 20l-3-3 3-3M4 17h12a4 4 0 004-4" {...p} />; break;
    case 'search': body = <><Circle cx="11" cy="11" r="6" {...p} /><Path d="M16 16l4 4" {...p} /></>; break;
    case 'scale': body = <><Rect x="4" y="4" width="16" height="16" rx="3" {...p} /><Path d="M8.5 9.5a5 5 0 017 0L12 12.5" {...p} /></>; break;
    case 'sparkle': body = <Path d="M12 3.5l1.7 5 5 1.7-5 1.7-1.7 5-1.7-5-5-1.7 5-1.7zM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" {...p} />; break;
    case 'list': body = <><Path d="M9 7h10M9 12h10M9 17h10" {...p} /><Circle cx="5" cy="7" r="1" {...p} /><Circle cx="5" cy="12" r="1" {...p} /><Circle cx="5" cy="17" r="1" {...p} /></>; break;
    case 'chat': body = <Path d="M5 5.5h14a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5h-7l-4.5 3.5V16.5H5A1.5 1.5 0 013.5 15V7A1.5 1.5 0 015 5.5z" {...p} />; break;
    case 'pin': body = <Path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3zM12 13.5V20" {...p} />; break;
    case 'more': body = <><Circle cx="5.5" cy="12" r="1.4" {...p} fill={color} /><Circle cx="12" cy="12" r="1.4" {...p} fill={color} /><Circle cx="18.5" cy="12" r="1.4" {...p} fill={color} /></>; break;
    case 'expand': body = <Path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" {...p} />; break;
    case 'copy': body = <><Rect x="8" y="8" width="11" height="11" rx="2" {...p} /><Path d="M5 15V6a1 1 0 011-1h9" {...p} /></>; break;
  }
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}
