#!/bin/zsh
# run this shell to compile project
source $HOME/.zshrc
export CLICKABLE_FRAMEWORK='ubuntu-touch-24.04-1.x'
clickable clean
nvm use 26.5.0
rm -rf build
rm -rf utoutlookmail
git clone https://github.com/mathiasmb31/utoutlookmail.git

cd utoutlookmail
echo "Build"
npm install
npm update

npm audit fix --force
npm audit fix --force
npm audit fix --force
npm run dist:linux:targz

cd ..

clickable build 
