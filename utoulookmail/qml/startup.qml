import QtQuick 2.9
import QtQuick.Window 2.2

// v4.0.105: écran affiché dès le lancement pour faire patienter l'utilisateur
// pendant la splash Lomiri. Aucun texte (i18n non concerné) : juste une barre
// de progression orange animée, en pur QtQuick (Controls ne se rend pas sous
// qmlscene sur Ubuntu Touch — voir relaunch.qml).
// v4.0.108: Window (QtQuick.Window) et NON ApplicationWindow (QtQuick.Controls)
// — ApplicationWindow n'existe pas sous qmlscene sur Ubuntu Touch
// ("ApplicationWindow is not a type" dans startup-qml.log).
Window {
    visible: true
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    visibility: Window.FullScreen
    color: "#0f0f1a"

    Rectangle {
        id: track
        anchors.centerIn: parent
        width: Math.min(parent.width * 0.7, 600)
        height: 8
        radius: 4
        color: "#2a2a3a"

        Rectangle {
            id: bar
            height: parent.height
            radius: parent.radius
            color: "#E95420"
            width: 0

            NumberAnimation on width {
                from: 0
                to: track.width
                duration: 1200
                loops: Animation.Infinite
                running: true
            }
        }
    }
}
