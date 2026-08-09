import QtQuick 2.9
import QtQuick.Window 2.2
import QtQuick.Controls 2.2
import QtQuick.Layouts 1.3

ApplicationWindow {
    visible: true

    width: 300
    height: 300

		    RoundButton {
		       width: 120
		       height:120
background: Rectangle {
ColorAnimation on color { to: "red"; duration: 8000 }
            border.color: "#14191D"
            color: "yellow"
            // I want to change text color next
        }
		        Text {
          anchors.fill: parent
       font.pixelSize: 24
       text: "NO NETWORK !!"
       fontSizeMode: Text.Fit 
       minimumPixelSize: 10
       wrapMode: Text.WordWrap

       horizontalAlignment: Text.AlignHCenter
       verticalAlignment: Text.AlignVCenter
        }
				
		        anchors.centerIn: parent

		        onClicked: { Qt.exit(0) }

		    }

}
