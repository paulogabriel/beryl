#!/bin/zsh
# Creates ~/Applications/Beryl.app, which opens Beryl with one click (Launchpad, Spotlight or Dock).
DIR="${0:A:h:h}"
PY="$(command -v python3 || echo /usr/bin/python3)"
APP="$HOME/Applications/Beryl.app"
ICON="$DIR/scripts/icon/Beryl.icns"
mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -o "$APP" -e "do shell script \"BERYL_PYTHON=\" & quoted form of \"$PY\" & \" /bin/zsh \" & quoted form of \"$DIR/scripts/launch.sh\""

# the stone icon: replaces the default script icon
if [[ -f "$ICON" ]]; then
  cp "$ICON" "$APP/Contents/Resources/applet.icns"
  rm -f "$APP/Contents/Resources/Assets.car"                                   # the default asset catalog would win over the .icns
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier dev.pantunes.beryl" "$APP/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string dev.pantunes.beryl" "$APP/Contents/Info.plist"
  codesign --force --deep --sign - "$APP" 2>/dev/null                          # changing the app invalidates osacompile's signature
  touch "$APP"
fi
echo "Criado $APP"
