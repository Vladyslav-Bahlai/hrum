import React from 'react';
import { Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps } from 'react-native';

/**
 * Text/TextInput с ограниченным масштабированием системного размера шрифта.
 * На iPhone с увеличенным «Размером текста» (Dynamic Type) подписи вылезали за кнопки:
 * масштаб ограничен ×1.15, базовые размеры темы не меняются. Явно переданный проп сильнее.
 */
export const MAX_FONT_SCALE = 1.15;

export const Text = React.forwardRef<React.ComponentRef<typeof RNText>, TextProps>((p, ref) => (
  <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...p} ref={ref} />
));
Text.displayName = 'Text';

export const TextInput = React.forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>((p, ref) => (
  <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...p} ref={ref} />
));
TextInput.displayName = 'TextInput';
export type { TextProps, TextInputProps };
