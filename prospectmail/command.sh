#!/bin/bash
set -ax
export WD=`pwd`
echo $WD
sleep 5

setopt LOCAL_OPTIONS allexport
SHELL=/bin/bash
WINDOWID=0
COLORTERM=truecolor
GRID_UNIT_PX=21
MIR_SERVER_FILE=/run/user/32011/mir_socket
GNOME_DESKTOP_SESSION_ID=this-is-deprecated
export GTK_IM_MODULE=maliit
PULSE_PROP=media.role=multimedia
QT_QUICK_CONTROLS_MOBILE=1
LANGUAGE=fr_FR
APP_ID=terminal.ubports_terminal_2.0.5
LC_ADDRESS=fr_FR.UTF-8
QT_LOGGING_RULES=qt.qml.connections.warning=false;qt.qml.binding.restoreMode.warning=false
LC_NAME=fr_FR.UTF-8
XDG_DATA_HOME=/home/phablet/.config/prospectmail.mathias/data
__GL_SHADER_DISK_CACHE_PATH=/home/phablet/.cache/terminal.ubports
XDG_CONFIG_HOME=/home/phablet/.config/prospectmail.mathias
MEMORY_PRESSURE_WRITE=c29tZSAyMDAwMDAgMjAwMDAwMAA=
DESKTOP_SESSION=ubuntu-touch
LC_MONETARY=fr_FR.UTF-8
ZEITGEIST_DATA_PATH=/home/phablet/.local/share/zeitgeist
XDG_SESSION_DESKTOP=ubuntu-touch
LOGNAME=phablet
XDG_SESSION_TYPE=mir
SYSTEMD_EXEC_PID=37171
APP_XMIR_ENABLE=0
MIR_SERVER_ENABLE_MIRCLIENT=1
MIR_SERVER_ENABLE_X11=1
LD_PRELOAD=/usr/lib/aarch64-linux-gnu/libtls-padding.so
GDM_LANG=fr_FR
UBUNTU_PLATFORM_API_BACKEND=touch_mirclient
HOME=/home/phablet
LC_PAPER=fr_FR.UTF-8
LANG=fr_FR.UTF-8
QV4_ENABLE_JIT_CACHE=1
QT_QUICK_CONTROLS_STYLE=Suru
QT_EXCLUDE_GENERIC_BEARER=1
XDG_CACHE_HOME=/home/phablet/.config/prospectmail.mathias/data
XDG_SESSION_CLASS=user
TERM=xterm
LC_IDENTIFICATION=fr_FR.UTF-8
LESSOPEN=| /usr/bin/lesspipe %s
USER=phablet
export DISPLAY=:0.0
GSM_SKIP_SSH_AGENT_WORKAROUND=true
LC_TELEPHONE=fr_FR.UTF-8
export QT_IM_MODULE=maliit
LC_MEASUREMENT=fr_FR.UTF-8
QT_FILE_SELECTORS=ubuntu-touch
PAPERSIZE=a4
XDG_RUNTIME_DIR=/run/user/32011
LC_TIME=fr_FR.UTF-8
XDG_DATA_DIRS=/home/phablet/.config/prospectmail.mathias/data
GDMSESSION=ubuntu-touch
LC_NUMERIC=fr_FR.UTF-8
trap 'printf "%3d: " "$LINENO"' DEBUG
echo $SNAP
echo $WD

echo "Going to launch"
echo "GRID UNIT PX"$GRID_UNIT_PX
export QT_FILE_SELECTORS=ubuntu-touch

echo "------------------------------------------------------------------"
echo $$ >>/home/phablet/.config/prospectmail.mathias/data/__prospect.pid
utils/auto_zoom.sh &
export PATH=$WD/bin:$PATH
echo $PATH
export XDG_CACHE_HOME=/home/phablet/.config/prospectmail.mathias/
export TMPDIR=/home/phablet/.config/prospectmail.mathias/
export SNAP=$WD/bin/
export SNAP_DESKTOP_LAST_REVISION="3"
export SNAP_REVISION="3"
export GTK_IM_MODULE=Maliit
export GTK_IM_MODULE_FILE=$WD/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/immodules.cache
export LD_LIBRARY_PATH=$WD/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH
export MALIIT_SOCKET_ADDRESS=unix:path=/run/user/32011/maliit
export GTK_MODULES=gail:atk-bridge:maliitplatforminputcontextplugin
export QT_IM_MODULE=maliit
export XMODIFIERS=@im=Maliit
echo "launch prospect" 
echo "-----------------------------------------------------------------"
bin/app/prospect-mail --no-sandbox --disable-gpu --ozone-platform=x11 
echo "launched prospect"
