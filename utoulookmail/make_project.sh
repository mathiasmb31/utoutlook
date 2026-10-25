#!/bin/zsh
# Build the complete project (Electron app + Click package)
# The Electron app source is at utoutlookmail/ (part of this repo, no clone needed)
source "$HOME"/.zshrc
export CLICKABLE_FRAMEWORK='ubuntu-touch-24.04-1.x'
clickable clean
nvm use 26.5.0
rm -rf build

# Build the Electron app
cd utoutlookmail || exit
echo "Building Electron app..."
npm install
npm update
# Fix known vulnerabilities (non-blocking, single pass)
npm audit fix || true
npm run dist:linux:targz
cd ..

# Build the click package
clickable build
