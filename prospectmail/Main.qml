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
        request.open("PUT", fileUrl, false);
        request.send(text);
        return request.status;
    }

    property int loopdone: 200
    property string todozoomfile: "/home/phablet/.config/prospectmail.mathias/zoomtodo"
    id: root
    backgroundColor: "black"
    objectName: 'mainView'
    applicationName: 'firstinstall.prospect'
    automaticOrientation: true
    width: units.gu(45)
    height: units.gu(75)
    Timer {
        id: timer1
        interval: 20010; running: true; repeat: true
        onTriggered:  Qt.quit()
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
                    color:LomiriColors.coolGrey
                    Text {
                        horizontalAlignment : Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.family: "Helvetica"
                        text: i18n.tr("                      WELCOME on UT-prospectmail")
                        color: "red"
                    }
                }
                Text {
                    horizontalAlignment : Text.AlignJustify
                    text: i18n.tr("               You are in FIRSTINSTALL STATE")
                    color: "white"
                    font.family: "Arial"
                }
                Text {
                    horizontalAlignment : Text.AlignJustify
                    text: i18n.tr("               Software will try to auto adjust zoom")
                    color: "white"
                    font.family: "Arial"
                }
                Text {
                    horizontalAlignment : Text.AlignJustify
                    text: i18n.tr("               for the window you select...")
                    color: "white"
                    font.family: "Arial"
                }
                Text {
                    horizontalAlignment : Text.AlignJustify
                    text: i18n.tr("     So please login and wait on the selected window")
                    color: "white"
                    font.family: "Arial"
                }
                Text {
                    horizontalAlignment : Text.AlignJustify
                    text: i18n.tr("     This window will auto close in a few seconds..\n you will have 30s to go to screen you want to zoom")
                    color: "orange"
                    font.family: "Arial"
                }
            }
        }
        Rectangle {
            color:"transparent"
            id: logo
            implicitWidth: units.gu(100)
            implicitHeight: units.gu(20)
        }
        Text {
            id: textzoom
            color:"white"
            text: "For bigger zoom, Enter a value from 2 to 9\n beware, large value will be ignored"
        }
        Rectangle {
            y:100
            height: units.gu(30)
            color: "orange"
            border.color: "transparent"
            border.width: 100
            anchors.margins: units.gu(18)
            width: units.gu(100)


            TextInput {
                x: units.gpu(10)

                anchors.fill: parent
                anchors.margins: 5
                id: userInputField
                focus: true
                font.pointSize: 20
                font.bold: true
                font.family: "Times New Roman"
                cursorVisible: true
                height: 20

                color: "blue"
                inputMask: "9"
                onAcceptableInputChanged: {console.log("entered",userInputField.text)
                    saveFile(todozoomfile,userInputField.text)

                }
                onActiveFocusChanged:  {userInputField.text="0"}
            }
        }
    }
}


