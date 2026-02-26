#!/bin/bash

export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:$PWD/lib/aarch64-linux-gnu/"
export DISPLAY=:0.0
echo "zooming..................."
${WD}/bin/xdotool key control+plus
