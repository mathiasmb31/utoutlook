	import QtQuick 2.9
	import QtQuick.Window 2.2
	import QtQuick.Controls 2.2
	import QtQuick.Layouts 1.3
	
	ApplicationWindow {
	    visible: true
	flags:  Qt.WA_TranslucentBackground | Qt.FramelessWindowHint
	color: "#00000000"
	    width: 800
	    height: 800
	 
	    Column {
	 
	  
	 
	   Rectangle {
	   RoundButton {
	 id:myRoundButtonb
	    width: 300
			       height:300
	   onClicked: { Qt.exit(0) }
	 background: Rectangle {
	            radius: myRoundButtonb.radius
	            color: "#00000000"
	        }
	}
	   id: rectone
	               border.color: "black"
	            color: "red"
			       width: 630
			       height:630
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
	     width: 400
		height:400
	        anchors.verticalCenter: parent.verticalCenter
	        horizontalAlignment: Image.AlignHCenter
	        verticalAlignment: Image.AlignVCenter
	        fillMode: Image.Pad
	                        id: icon1
	                        source: "exit.jpg"
	                        
	          }
	}
	
	 RoundButton {
	 id:myRoundButton
	   width: 700
			       height:630
			       
	 Frame {
	 width: 700
			       height:630
	RoundButton {
	 id:myRoundButtonc
	 width: 700
	 height:620
	 onClicked: { Qt.exit(0) }
	 background: Rectangle {
	            radius: myRoundButtonc.radius
	            color: "#00000000"
	        }
	}
	   contentItem: Text {
	        text: "\nTimeout speaking with outlook server \n This is not really a problem\n You can launch client one's more ;)"
	        font.family: "Helvetica"
	        color: "red"
	    font.pointSize: 25
	        horizontalAlignment : Text.Aligncenter
	
	    }
	}
	  
	onClicked: { Qt.exit(0) }
	    
	
	
	}
			
	
	}}
	
