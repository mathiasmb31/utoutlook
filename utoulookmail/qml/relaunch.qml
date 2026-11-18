import QtQuick 2.9
import QtQuick.Window 2.2

// v4.0.108: Window au lieu de ApplicationWindow (Controls absent sous qmlscene)
// v4.0.112: dégradé VERT → ORANGE qui tourne (au lieu d'un arc orange fixe).
Window {
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
                ctx.lineCap = "round";

                // Arc de 270° décomposé en segments colorés : vert (départ)
                // → orange (arrivée). L'ensemble tourne via RotationAnimation,
                // ce qui donne un dégradé animé bien visible pour l'utilisateur.
                var cx = width / 2;
                var cy = height / 2;
                var r = width / 2 - 8;
                var start = -Math.PI / 2;
                var span = Math.PI * 1.5;
                var segments = 60;
                var green = [61, 220, 132];   // #3DDC84
                var orange = [233, 84, 32];   // #E95420

                for (var i = 0; i < segments; i++) {
                    var t = i / (segments - 1);
                    var cr = Math.round(green[0] + (orange[0] - green[0]) * t);
                    var cg = Math.round(green[1] + (orange[1] - green[1]) * t);
                    var cb = Math.round(green[2] + (orange[2] - green[2]) * t);
                    ctx.strokeStyle = "rgb(" + cr + "," + cg + "," + cb + ")";
                    ctx.beginPath();
                    ctx.arc(cx, cy, r,
                            start + span * i / segments,
                            start + span * (i + 1) / segments + 0.02);
                    ctx.stroke();
                }
            }
        }

        RotationAnimation {
            target: ring
            from: 0
            to: 360
            duration: 1100
            loops: Animation.Infinite
            running: true
        }
    }
}
