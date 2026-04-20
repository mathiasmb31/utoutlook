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
import QtQuick.Dialogs 1.1


MainView {
    id : main
    function saveFile(fileUrl, text) {
        var request = new XMLHttpRequest();
        request.open("PUT", fileUrl+"_"+text, false);
        console.log("#########################################file created"+text)
        request.send(text);
        return request.status;
    }
    function sendMsg(fileUrl, text) {
        var request = new XMLHttpRequest();
        request.open("PUT", fileUrl+"_"+text, false);
        console.log("#########################################file created"+text)
        request.send(text);
        return request.status;
    }

    function saveReset(fileUrl, text) {
        var request = new XMLHttpRequest();
        request.open("PUT", fileUrl, false);
        console.log("#########################################file created"+text)
        request.send(text);
        return request.status;
    }
    function quit(fileUrl) {
        var request = new XMLHttpRequest();
        request.open("PUT", quitMsg, false);
        console.log("#########################################file quit created")
        request.send("");
        return request.status;
    }
    property int loopdone: 320
    property string sourceText: i18n.tr(".........................UTProspectMail Settings...........................")
    property string todozoomfile: "/home/phablet/.config/prospectmail.mathias/zoomtodo"
    property string resetfile: "/home/phablet/.config/prospectmail.mathias/reset"
    property string sendMsgFile: "/home/phablet/.cache/prospectmail.mathias/sendMsg"
    property string quitMsg: "/home/phablet/.cache/prospectmail.mathias/quit"
    opacity: enabled ? 1 : 0.3

    backgroundColor: "transparent"
    objectName: 'mainView'
    applicationName: 'Settings.prospect'
    automaticOrientation: true
    width: units.gu(45)
    height: units.gu(75)


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
        source: "../assets/logo.png"
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
            implicitWidth: units.gu(50)
            implicitHeight: units.gu(3)
            ColumnLayout {
                Rectangle {
                    implicitWidth: units.gu(50)
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
                        text: i18n.tr(".       UT ProspectMail Settings")
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
                    color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: "Choose zoom value factor"
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                    color: "transparent"
                    width: units.gu(44); height: units.gu(5)
                    radius: 20
                }
                GridView {
                    id: grid
                    width: units.gu(100); height: units.gu(10)
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
                        MessageDialog {

                            id: messageDialog2

                            title: "Slide to windows"
                            text:  "Slide to window concerned by zoom"
                            onAccepted: {
                                console.log("close.")
                            }
                        }
                        text: number
                        onClicked: {
                            console.log("number is"+number )
                            saveFile(todozoomfile,number)
                            messageDialog2.open()
                        }
                    }
                }
                Row
                {
                    id:texttosend
                    Rectangle {
                        color:LomiriColors.orange
                        width: units.gu(30); height: units.gu(3)
                        radius: 1
                        TextArea{
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            text: ""
                        }
                        TextInput {
                            MessageDialog {

                                id: messageDialog1

                                title: "Slide to windows"
                                text:  "Slide to window where text as to be sent"
                                onAccepted: {
                                    console.log("close.")
                                }
                                Component.onCompleted: visible = false
                            }

                            anchors.fill: parent
                            id:sendText
                            width: units.gu(30); height: units.gu(3)
                            anchors.centerIn: parent
                            text: ""
                            cursorVisible: true
                            color: "black"
                            
                            onAccepted: {
                                console.log("send text",sendText.text)
                                sendMsg(sendMsgFile,sendText.text)
                                MessageDialog1.open()
                            }
                        }
                    }
                    Rectangle {
                        color:"transparent"
                        width: units.gu(5); height: units.gu(5)
                        radius: 20

                    }
                    RoundButton {
                        width: units.gu(10); height: units.gu(5)
                        radius: 20
                        anchors{
                            horizontalCenter: main.horizontalCenter
                        }
                        text: qsTr(" RESET ")
                        opacity: enabled ? 1 : 0.3
                        background: Rectangle {
                            color: parent.down ? LomiriColors.red :
                                                 (parent.hovered ? LomiriColors.darkAubergine : LomiriColors.orange)
                        }

                        MessageDialog {

                            id: messageDialog

                            title: "Please close"
                            text:  "Please restart Prospect"
                            onAccepted: {
                                console.log("close.")
                                saveReset(resetfile)
                                //Qt.quit()
                                messageDialog.close()
                            }
                            Component.onCompleted: visible = false
                        }
                        onClicked:messageDialog.open()
                    }
                }
                Row {
                    RoundButton {
                        background: Rectangle {
                            color: parent.down ? LomiriColors.green :
                                                 (parent.hovered ? LomiriColors.darkAubergine : LomiriColors.green)
                        }
                        width: units.gu(30); height: units.gu(3)
                        radius: 1
                        onClicked: {
                            console.log("send text",sendText.text)
                            sendMsg(sendMsgFile,sendText.text)
                            // Qt.quit()
                            messageDialog1.open()
                        }

                        Text {
                            text: "^^^           send text       ^^^"
                        }
                    }

                    RoundButton {
                        background: Rectangle {
                            color: parent.down ? LomiriColors.red :
                                                 (parent.hovered ? LomiriColors.darkAubergine : LomiriColors.orange)
                        }
                        width: units.gu(30); height: units.gu(3)
                        radius: 1
                        onClicked: {
                            console.log("close prospect",sendText.text)
                            // quit(quit)
                            //  Qt.quit()
                        }

                        Text {
                            text: " close settings"
                        }
                    }

                }
            }
        }
    }


}



