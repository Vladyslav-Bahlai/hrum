#!/bin/bash
# Сценарии на Android-эмуляторе (вызывается из android-emulator-runner)
set -x
export PATH="$PATH:$HOME/.maestro/bin"
OUT=$PWD/shots/android
mkdir -p $OUT
adb install -r android/app/build/outputs/apk/release/app-release.apk
# 3-кнопочная навигация, как на телефоне пользователя (на ней клавиатура и прятала поле)
adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton || true
sleep 3
adb shell wm size; adb shell wm density
maestro test -e OUT=$OUT .maestro/check.yaml > $OUT/maestro-check.log 2>&1; echo "check exit $?" >> $OUT/maestro-check.log
adb exec-out screencap -p > $OUT/99-last.png
adb shell settings put system font_scale 1.3
maestro test -e OUT=$OUT .maestro/bigtext.yaml > $OUT/maestro-bigtext.log 2>&1; echo "bigtext exit $?" >> $OUT/maestro-bigtext.log
adb shell settings put system font_scale 1.0
adb logcat -d -t 400 '*:E' > $OUT/logcat-errors.txt || true
exit 0
