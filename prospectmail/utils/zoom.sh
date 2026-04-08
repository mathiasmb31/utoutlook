while [ true ]
do
	qmlscene ${WD}/qml/Settings.qml
	${WD}/utils/quicksleep.sh
	echo "lauching autozoom "
	${WD}/utils/auto_zoom.sh
	${WD}/utils/quicksleep.sh
done
