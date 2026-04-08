# run this shell to compile project
export CLICKABLE_FRAMEWORK='ubuntu-touch-24.04-1.x'
clickable clean
rm -rf build
rm -rf prospect-mail
git clone https://github.com/julian-alarcon/prospect-mail.git
cp patches/package.json prospect-mail/
cp patches/settings.js prospect-mail/src
cp patches/tray-controller.js prospect-mail/src/controller/tray-controller.js
cp patches/mail-window-controller.js prospect-mail/src/controller/mail-window-controller.js
cp patches/main.js prospect-mail/src/main.js
cd prospect-mail
npm install
npm run dist:linux:snap

cd ..

clickable build
