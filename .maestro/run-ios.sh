#!/bin/bash
# Сценарии на iOS-симуляторе
set -x
export PATH="$PATH:$HOME/.maestro/bin"
OUT=$PWD/shots/ios
mkdir -p $OUT
DEV=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for k,v in d.items() if 'iOS' in k for x in v if x['name'].startswith('iPhone') and 'Pro' in x['name'] and 'Max' not in x['name']) )" 2>/dev/null)
[ -z "$DEV" ] && DEV=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for k,v in d.items() if 'iOS' in k for x in v if x['name'].startswith('iPhone')))")
xcrun simctl list devices available | grep "$DEV"
xcrun simctl boot "$DEV"; xcrun simctl bootstatus "$DEV" -b
APP=$(ls -d build/Build/Products/Release-iphonesimulator/*.app | head -1)
xcrun simctl install "$DEV" "$APP"
maestro --device "$DEV" test -e OUT=$OUT .maestro/check.yaml > $OUT/maestro-check.log 2>&1; echo "check exit $?" >> $OUT/maestro-check.log
xcrun simctl io "$DEV" screenshot $OUT/99-last.png
xcrun simctl ui "$DEV" content_size extra-extra-large
maestro --device "$DEV" test -e OUT=$OUT .maestro/bigtext.yaml > $OUT/maestro-bigtext.log 2>&1; echo "bigtext exit $?" >> $OUT/maestro-bigtext.log
xcrun simctl ui "$DEV" content_size large
exit 0
