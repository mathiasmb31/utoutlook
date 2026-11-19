import QtQuick 2.9
import QtQuick.Window 2.2

// v4.0.105: écran affiché dès le lancement pour faire patienter l'utilisateur
// pendant la splash Lomiri. Aucun texte (i18n non concerné) : juste une barre
// de progression orange animée, en pur QtQuick (Controls ne se rend pas sous
// qmlscene sur Ubuntu Touch — voir relaunch.qml).
// v4.0.108: Window (QtQuick.Window) et NON ApplicationWindow (QtQuick.Controls)
// — ApplicationWindow n'existe pas sous qmlscene sur Ubuntu Touch
// ("ApplicationWindow is not a type" dans startup-qml.log).
// v4.0.126: lancée MAINTENANT dès la 1re ligne du wrapper (plus tardivement
// dans launch_prospect). Ajout d'un message d'étape i18n : le wrapper écrit
// /tmp/utoutlook-start-step.qml (texte traduit via utoutlook_t), rechargé par
// le Loader ci-dessous. Toujours aucun QtQuick.Controls.
Window {
    visible: true
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    visibility: Window.FullScreen
    color: "#0f0f1a"

    Rectangle {
        id: track
        anchors.centerIn: parent
        // v4.0.110: largeur CONSTANTE — `Math.min(parent.width*0.7, 600)`
        // vaut 0 au démarrage (fenêtre pas encore dimensionnée), ce qui
        // donnait `to: -8` et une barre invisible.
        width: 600
        height: 8
        radius: 4
        color: "#2a2a3a"

        Rectangle {
            id: bar
            height: parent.height
            radius: parent.radius
            color: "#E95420"
            width: 1
        }

        // v4.0.110: une animation CIBLÉE explicite (target/property) — le
        // value source « NumberAnimation on width » + le width:0 explicite
        // se battent sous Qt 5.15/qmlscene : la barre restait invisible.
        NumberAnimation {
            target: bar
            property: "width"
            from: 1
            to: 592
            duration: 1100
            loops: Animation.Infinite
            running: true
        }
    }

    // v4.0.126: message d'étape traduit, écrit par le wrapper. Le Loader est
    // rechargé chaque seconde pour suivre l'avancement sans rouvrir la fenêtre.
    Loader {
        id: stepLoader
        source: "/tmp/utoutlook-start-step.qml"
    }
    Text {
        id: stepText
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: track.bottom
        anchors.topMargin: 18
        color: "#E95420"
        font.pixelSize: 20
        horizontalAlignment: Text.AlignHCenter
        text: (stepLoader.item && stepLoader.item.label) ? stepLoader.item.label : ""
    }
    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: {
            stepLoader.source = "";
            stepLoader.source = "/tmp/utoutlook-start-step.qml";
        }
    }
}
