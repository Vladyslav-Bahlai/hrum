import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './src/ui/RNText';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Lora_400Regular, Lora_600SemiBold, Lora_400Regular_Italic } from '@expo-google-fonts/lora';
import { StoreProvider, useStore } from './src/store';
import { C, T } from './src/theme';
import { ToastProvider } from './src/ui/Toast';
import { Btn, IconBtn } from './src/ui/kit';
import { DayScreen } from './src/screens/DayScreen';
import { AISection, ProfileSection } from './src/screens/SettingsScreen';

export default function App() {
  const [fonts] = useFonts({ Lora_400Regular, Lora_600SemiBold, Lora_400Regular_Italic });
  const [intro, setIntro] = useState(true);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <StoreProvider>
        {fonts ? <Root /> : <Splash />}
      </StoreProvider>
      {intro ? <Intro onDone={() => setIntro(false)} /> : null}
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Короткая заставка с логотипом при запуске: приложение за ней уже готово. */
function Intro({ onDone }: { onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(out, { toValue: 0, duration: 420, useNativeDriver: true }).start(onDone), 1500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <Animated.View style={{ alignItems: 'center', opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }}>
        <Image source={require('./assets/icon.png')} style={{ width: 112, height: 112, borderRadius: 28 }} />
        <Text style={{ fontFamily: 'Lora_600SemiBold', fontSize: 34, color: C.ink, marginTop: 18, letterSpacing: 0.5 }}>Хрум</Text>
        <Text style={{ fontFamily: 'Lora_400Regular_Italic', fontSize: 15, color: C.muted, marginTop: 4 }}>дневник питания</Text>
      </Animated.View>
      <ActivityIndicator color={C.accent} style={{ position: 'absolute', bottom: 70 }} />
    </Animated.View>
  );
}

function Splash() {
  return <View style={{ flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
}

function Root() {
  const { ready, data } = useStore();
  if (!ready) return <Splash />;
  if (!data.onboarded) return <Onboarding />;
  return (
    <ToastProvider bottom={168}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <DayScreen />
      </KeyboardAvoidingView>
    </ToastProvider>
  );
}

function Onboarding() {
  const { update } = useStore();
  const ins = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: ins.top + 30, paddingBottom: ins.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <Text style={[T.small, { color: C.accent, fontWeight: '700' }]}>ХРУМ · {step + 1} из 2</Text>
        {step === 0 ? (
          <>
            <Text style={[T.h1, { marginTop: 8 }]}>Дневник питания, который считает сам</Text>
            <Text style={[T.bodySoft, { marginTop: 10, marginBottom: 22 }]}>
              Пишите или фотографируйте еду — ИИ посчитает калории и БЖУ. Сначала рассчитаем вашу дневную норму.
            </Text>
            <ProfileSection onApply={() => setStep(1)} />
            <Btn label="Пропустить" kind="ghost" onPress={() => setStep(1)} style={{ marginTop: 10 }} />
          </>
        ) : (
          <>
            <Text style={[T.h1, { marginTop: 8 }]}>Подключите ИИ</Text>
            <Text style={[T.bodySoft, { marginTop: 10, marginBottom: 22 }]}>
              Вставьте ключ своего Gemini или Claude. Ключ хранится в защищённом хранилище телефона и отправляется только напрямую в Google или Anthropic.
            </Text>
            <AISection />
            <Btn label="Начать" onPress={() => update((d) => ({ ...d, onboarded: true }))} style={{ marginTop: 26, paddingVertical: 16 }} />
            <Text style={[T.small, { textAlign: 'center', marginTop: 10 }]}>Ключ можно добавить и позже — в настройках. Без ключа записи вводятся вручную.</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
});
