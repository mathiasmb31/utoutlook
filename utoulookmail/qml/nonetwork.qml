import QtQuick 2.9
import QtQuick.Window 2.2
import QtQuick.Controls 2.2
import QtQuick.Layouts 1.3

ApplicationWindow {
    visible: true
flags:  Qt.WA_TranslucentBackground | Qt.FramelessWindowHint
color: "#00000000"
    width: 500
    height: 500
 
   RoundButton {
   width: 330
		       height:330
   onClicked: { Qt.exit(0) }
   Rectangle {
               border.color: "black"
            color: "red"
		       width: 330
		       height:330
		       border.width: 3
                    radius: 10
                    // ColorAnimation on color { to: "purple"; duration: 1000 }
                     gradient: Gradient {
            GradientStop {
                position: 0.0
                SequentialAnimation on color {
                    loops: Animation.Infinite
                    ColorAnimation { from: "yellow"; to: "red"; duration: 5000 }
                    ColorAnimation { from: "red"; to: "yellow"; duration: 5000 }
                }
            }
            GradientStop {
                position: 1.0
                SequentialAnimation on color {
                    loops: Animation.Infinite
                    ColorAnimation { from: "red"; to: "purple"; duration: 5000 }
                    ColorAnimation { from: "purple"; to: "red"; duration: 5000 }
                }
            }
        }
    Image {
     width: 320
		       height:120
		       anchors.left: parent.left

        anchors.leftMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        horizontalAlignment: Image.AlignHCenter
        verticalAlignment: Image.AlignVCenter
        fillMode: Image.Pad
                        id: icon1
                        source: "no-network-icon.png"
                    }
}
}
		    RoundButton {
		       width: 320
		       height:120
background: Rectangle {
 border.width: 3
                    radius: 10
              anchors.left: parent.left     
//ColorAnimation on color { to: "red"; duration: 8000 }

gradient: Gradient {
            GradientStop {
                position: 0.0
                SequentialAnimation on color {
                    loops: Animation.Infinite
                    ColorAnimation { from: "purple"; to: "red"; duration: 5000 }
                    ColorAnimation { from: "red"; to: "purple"; duration: 5000 }
                }
            }
            GradientStop {
                position: 1.0
                SequentialAnimation on color {
                    loops: Animation.Infinite
                    ColorAnimation { from: "red"; to: "yellow"; duration: 5000 }
                    ColorAnimation { from: "yellow"; to: "red"; duration: 5000 }
                }
            }
        }

            border.color: "black"
            color: "yellow"
            
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
