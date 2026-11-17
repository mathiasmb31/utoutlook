import QtQuick 2.9
import QtQuick.Window 2.2
import QtQuick.Controls 2.2
.import "/tmp/utoutlook-qml-i18n.js" as QmlI18n

// v4.0.91: écran de relance après changement d'orientation — fond opaque style
// Mathias (#0f0f1a) + roue qui tourne (BusyIndicator) orange + texte centré.
// Le wrapper lance cette page quand l'app quitte pour une rotation et la tue
// dès que le nouvel app répond sur le socket.
ApplicationWindow {
    visible: true
    flags: Qt.FramelessWindowHint
    color: "#0f0f1a"
    width: Screen.width
    height: Screen.height

    BusyIndicator {
        id: spinner
        anchors.centerIn: parent
        running: true
        width: 110
        height: 110
    }

    // Roule orange #E95420 (style Mathias) — fallback si la palette n'est pas supportée
    Rectangle {
        visible: false
    }

    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.verticalCenter
        anchors.topMargin: 80
        width: parent.width - 100
        text: QmlI18n.RELAUNCH
        color: "#E95420"
        font.pixelSize: 22
        wrapMode: Text.WordWrap
        horizontalAlignment: Text.AlignHCenter
    }
}
