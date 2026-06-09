#!/bin/zsh
# run this shell to compile project
export CLICKABLE_FRAMEWORK='ubuntu-touch-24.04-1.x'
clickable clean
rm -rf build
rm -rf utoutlookmail
git clone https://github.com/mathiasmb31/utoutlookmail.git

cd utoutlookmail
echo "Build"
npm install
npm update
npm audit fix
npm run dist:linux:appimage

cd ..

clickable build
