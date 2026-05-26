set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
export QML_XHR_ALLOW_FILE_WRITE=1

export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:$PWD/lib/aarch64-linux-gnu/"
if [ "$DISPLAY" = "" ]; then
	i=0
	while [ -e "/tmp/.X11-unix/X$i" ]; do
		i=$((i + 1))
	done
	i=$((i - 1))
	display=":$i"
	export DISPLAY=$display
fi

qmlscene ${WD}/qml/Settings.qml	
${WD}/utils/kill_prospect.sh

