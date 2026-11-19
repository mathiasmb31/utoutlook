import QtQuick 2.9
import QtQuick.Window 2.2
// v4.1.0: ce fichier sert de MODÈLE — le wrapper génère une copie traduite
// dans ~/.config/utoutlook.mathias/render-rescue.qml (AppArmor interdit la
// lecture d'un import JS/QML depuis /tmp sur le click installé).

// v4.0.128: écran de secours affiché PAR LE WRAPPER quand un crash GPU vient
// d'être détecté (avant de lancer Electron). qmlscene est Qt, indépendant du
// GPU Chromium : cet écran reste utilisable même quand l'app ne rend plus rien.
//
// Le QML ne peut pas écrire de fichier. Les boutons écrivent donc leur choix
// sur stdout via console.log (déjà redirigé vers render-rescue-qml.log par le
// wrapper) puis quittent ; le wrapper grep le marqueur UT_RENDER_CHOICE=...
// pour choisir le mode de rendu. Aucun binaire ni droit AppArmor supplémentaire.
// QtQuick pur : aucun QtQuick.Controls (ne se rend pas sous qmlscene sur UT).
Window {
    visible: true
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    visibility: Window.FullScreen
    color: "#0f0f1a"

    Column {
        anchors.centerIn: parent
        spacing: 28

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#ffffff"
            font.pixelSize: 26
            horizontalAlignment: Text.AlignHCenter
            text: "Graphics problem"
        }

        Rectangle {
            width: 560
            height: 76
            radius: 14
            color: "#E95420"
            anchors.horizontalCenter: parent.horizontalCenter
            Text {
                anchors.centerIn: parent
                color: "#ffffff"
                font.pixelSize: 22
                font.bold: true
                text: "Software rendering"
            }
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    console.log("UT_RENDER_CHOICE=software");
                    Qt.exit(0);
                }
            }
        }

        Rectangle {
            width: 560
            height: 76
            radius: 14
            color: "#2a2a3a"
            border.color: "#E95420"
            border.width: 2
            anchors.horizontalCenter: parent.horizontalCenter
            Text {
                anchors.centerIn: parent
                color: "#ffffff"
                font.pixelSize: 22
                text: "OpenGL rendering"
            }
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    console.log("UT_RENDER_CHOICE=opengl");
                    Qt.exit(0);
                }
            }
        }
    }
}
