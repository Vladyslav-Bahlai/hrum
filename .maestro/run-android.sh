#!/bin/bash
# Сценарии на Android-эмуляторе (вызывается из android-emulator-runner)
set -x
export PATH="$PATH:$HOME/.maestro/bin"
ABSOUT=$PWD/shots/android
mkdir -p $ABSOUT
adb install -r android/app/build/outputs/apk/release/app-release.apk
# 3-кнопочная навигация, как на телефоне пользователя (на ней клавиатура и прятала поле)
adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton || true
sleep 3
adb shell wm size; adb shell wm density
# OUT передаётся как относительный путь, чтобы Maestro не отклонял абсолютный
maestro test -e OUT=shots/android .maestro/check.yaml > $ABSOUT/maestro-check.log 2>&1; echo "check exit $?" >> $ABSOUT/maestro-check.log
adb exec-out screencap -p > $ABSOUT/99-last.png
adb shell settings put system font_scale 1.3
maestro test -e OUT=shots/android .maestro/bigtext.yaml > $ABSOUT/maestro-bigtext.log 2>&1; echo "bigtext exit $?" >> $ABSOUT/maestro-bigtext.log
adb shell settings put system font_scale 1.0
adb logcat -d -t 400 '*:E' > $ABSOUT/logcat-errors.txt || true
exit 0
