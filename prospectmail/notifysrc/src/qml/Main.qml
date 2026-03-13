import QtQuick 2.9
import Ubuntu.Components 1.3

MainView {
    id: mainView
    objectName: "mainView"
    applicationName: "hello.qml.app"

    width: units.gu(60)
    height: units.gu(85)


    Timer {
            id: delayTimer
            interval: 5000        // 5 secondes
            repeat: false
            onTriggered: pushNotifier.send("Hello world")
    }
    
    Page {
        id: mainPage
        title: i18n.tr("Hello App")

        Column {
            anchors.centerIn: parent
            spacing: units.gu(2)

            Label {
                text: "Hello from QML"
                fontSize: "large"
            }

            Button {
                text: "Click me"
                onClicked: delayTimer.start()
            }
        }
    }
}
