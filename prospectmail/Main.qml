/*
 * Copyright (C) 2026  mathias
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 3.
 *
 * show is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import QtQuick 2.7
import Lomiri.Components 1.3
import QtQuick.Controls 2.2
import QtQuick.Layouts 1.3
import Qt.labs.settings 1.0


MainView {
    function saveFile(fileUrl, text) {
        var request = new XMLHttpRequest();
        request.open("PUT", fileUrl+"_"+text, false);
        console.log("#########################################log is"+text)
        request.send(text);
        return request.status;
    }
    property int loopdone: 320
    property string sourceText: i18n.tr("....................Welcome on UT prospectMail..................")
    property string todozoomfile: "/home/phablet/.config/prospectmail.mathias/zoomtodo"
    id: root
        Image {
                   id: image2
                   anchors.fill: parent
                   source: "assets/bluesky.jpg"
                   opacity: 0.5
                   z: -1
               }
    backgroundColor: "transparent"
    objectName: 'mainView'
    applicationName: 'firstinstall.prospect'
    automaticOrientation: true
    width: units.gu(45)
    height: units.gu(75)
    Timer {
        id: timer1
        interval: 30010; running: true; repeat: true
        onTriggered:  Qt.quit()
    }

    Timer {
        id: timer0
        interval: 100
        repeat: true
        running: true

        onTriggered: titre1.type()
        onRunningChanged: running === false ? print("Stopped.") : null
    }
    Timer {
        id: timer2
        interval: 100; running: true; repeat: true
        onTriggered:
        {
            loopdone=loopdone - 1

            rotateImagePhoto.angle=loopdone * 10
            rotateImagePhoto.origin.y = 30-loopdone
            if (loopdone < 20) {
                rotateImagePhoto.angle=0
                rotateImagePhoto.origin.y=units.gu(0)
                logoimage.x=units.gu(30)
            }
        }
    }
    Image {
        id: logoimage
        source: "assets/logo.png"
        property alias rotationAngle: rotateImagePhoto.angle
        anchors.margins: 300
        x: units.gu(5)
        y: units.gu(50)
        transform: Rotation{
            id: rotateImagePhoto
            angle: 0
            origin.x: units.gu(20)
            origin.y: units.gu(0)
            origin.z: 0
        }
        width: units.gu(10); height: units.gu(10)
    }
    ColumnLayout {
        id: principale
        Rectangle {
            implicitWidth: units.gu(100)
            implicitHeight: units.gu(3)
            ColumnLayout {
                Rectangle {
                    implicitWidth: units.gu(100)
                    implicitHeight: units.gu(3)
                    color:"#4169e1"
                    TextArea {

                        id : titre1
                        property int i
                        property bool isTag
                        property string coulor: LomiriColors.orange
                        horizontalAlignment : Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.family: "Helvetica"
                        text: i18n.tr("WELCOME on UT-prospectmail    WELCOME on UT-prospectmail   WELCOME on UT-prospectmail")
                        function type() {
                            text = sourceText.slice(0, ++i);
                            if (text === sourceText) return timer0.stop()
                            titre1.text = text;
                        }

                        color: titre1.coulor
                        Behavior on coulor {
                            SequentialAnimation {
                                loops: 3
                                ColorAnimation { from: "white"; to: "red"; duration: 300 }
                                ColorAnimation { from: "red"; to: "white";  duration: 300 }
                            }
                        }
                    }
                }
                Rectangle {
                    color: "transparent"
                    width: units.gu(50); height: units.gu(5)
                    radius: 20

                }

                Rectangle {
                    color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: " You are running UTProspectmail for firstime"
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                    color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "Software will try to make some adjustments"
                        color: LomiriColors.darkAubergine
                    }
                }

                Rectangle {
                   color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "So please stay on window you want to settle"
                        color: LomiriColors.darkAubergine
                    }
                }

                Rectangle {
                  color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "for window you select..."
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                   color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "Choose zoom value (good value between 4 and 7)"
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                   color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "Depending on phone you have"
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                   color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "You will be able to reset zoom "
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                    color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {

                        anchors.centerIn: parent
                        text: "reset_zoom.sh in utils directory"
                        color: LomiriColors.darkAubergine
                    }
                }


                Rectangle {
                    color: "transparent"
                    width: units.gu(44); height: units.gu(5)
                    radius: 20

                }
                GridView {
                    width: units.gu(100); height: units.gu(250)
                    cellWidth: units.gu(5); cellHeight: units.gu(10)
                    model: Modele {}

                    delegate:  Button {

                        background: Rectangle {

                            anchors.fill: parent
                            implicitWidth: units.gu(1)
                            implicitHeight:units.gu(1)
                            opacity: enabled ? 1 : 0.3
                            border.color: LomiriColors.orange
                            border.width: 3
                            radius: 8
                        }
                        text: number
                        onClicked: {
                            console.log("number is"+number )
                            saveFile(todozoomfile,number)
                            Qt.quit()
                        }
                    }



                }



            }
        }



    }

}



