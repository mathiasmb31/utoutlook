#!/bin/zsh
# run this shell to compile project
export CLICKABLE_FRAMEWORK='ubuntu-touch-24.04-1.x'
clickable clean
rm -rf build
rm -rf prospect-mail
git clone https://github.com/julian-alarcon/prospect-mail.git
echo "Copy patches"
cp -f patches/package.json prospect-mail/
cp -f patches/settings.mjs prospect-mail/src
cp -f patches/tray-controller.mjs prospect-mail/src/controller/tray-controller.mjs
cp -f patches/mail-window-controller.mjs prospect-mail/src/controller/mail-window-controller.mjs
cp -f patches/main.mjs prospect-mail/src/main.mjs
cp -f patches/client-injector.mjs prospect-mail/src/controller/client-injector.mjs
cp -f patches/main.css prospect-mail/public/main.css
cp -f patches/unread-number-observer.js prospect-mail/public/unread-number-observer.js
rm -f prospect-mail/src/controller/mail-window-controller.js
rm -f prospect-mail/src/controller/tray-controller.js
rm -f prospect-mail/src/controller/client-injector.js
rm -f prospect-mail/src/main.js
rm -f prospect-mail/src/settings.js

cd prospect-mail
echo "Build"
npm install
npm update
npm run dist:linux:appimage

cd ..

clickable build
