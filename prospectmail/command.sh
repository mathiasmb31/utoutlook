#!/bin/bash -e
#modified
set -x
exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/app/prospect-mail" --ozone-platform=x11 --no-sandbox "$@"
