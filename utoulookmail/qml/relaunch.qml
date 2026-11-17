import QtQuick 2.9
import QtQuick.Window 2.2

ApplicationWindow {
    visible: true
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    visibility: Window.FullScreen
    color: "#0f0f1a"

    Item {
        anchors.centerIn: parent
        width: 110
        height: 110

        Canvas {
            id: ring
            anchors.fill: parent
            onPaint: {
                var ctx = getContext("2d");
                ctx.reset();
                ctx.lineWidth = 10;
                ctx.strokeStyle = "#E95420";
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.arc(width / 2, height / 2, width / 2 - 8, -Math.PI / 2, Math.PI * 1.5);
                ctx.stroke();
            }
        }

        RotationAnimation {
            target: ring
            from: 0
            to: 360
            duration: 900
            loops: Animation.Infinite
            running: true
        }
    }
}
