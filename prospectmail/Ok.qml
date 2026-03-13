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
    function saveFile(fileUrl) {
        var request = new XMLHttpRequest();
        request.open("PUT", fileUrl, false);
        request.send("");
        return request.status;
    }
    property int loopdone: 320
    property string sourceText: i18n.tr("....................ZOOM SETTINGS..................")
    property string todozoomfile: "/home/phablet/.config/prospectmail.mathias/reset"
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
        interval: 60010; running: true; repeat: true
    }

    Timer {
        id: timer0
        interval: 100
        repeat: true
        running: true

        onTriggered: titre1.type()
        onRunningChanged: running === false ? print("Stopped.") : null
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
                        text: i18n.tr("ZOOM")
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
                        text: " Slice windows to see actual zoom"
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                    color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: " If zoom not ok , click on reset button"
                        color: LomiriColors.darkAubergine
                    }
                }
                Rectangle {
                    color:LomiriColors.warmGrey
                    width: units.gu(50); height: units.gu(5)
                    radius: 20
                    TextArea {
                        anchors.centerIn: parent
                        text: " If zoom OK  , click on Ok  button"
                        color: LomiriColors.darkAubergine
                    }
                    Rectangle {
                        color:LomiriColors.warmGrey
                        width: units.gu(50); height: units.gu(5)
                        radius: 20
                        TextArea {
                            anchors.centerIn: parent
                            text: " If you click on reset, then re-launch prospectmail"
                            color: LomiriColors.darkAubergine
                        }
                    }
                    Rectangle {
                        color: "transparent"
                        width: units.gu(50); height: units.gu(5)
                        radius: 20

                    }
                }
                    Button {

                        background: Rectangle {
                            anchors.fill: parent
                            implicitWidth: units.gu(10)
                            implicitHeight:units.gu(5)
                            opacity: enabled ? 1 : 0.3
                            border.color: LomiriColors.orange
                            color : "red"
                            border.width: 3
                            radius: 8
                        }
                        text: "click here to reset"
                        onClicked: {
                            saveFile(todozoomfile)
                            Qt.quit()
                        }
                    }

                    Button {

                        background: Rectangle {
                            anchors.fill: parent
                            implicitWidth: units.gu(10)
                            implicitHeight:units.gu(5)
                            opacity: enabled ? 1 : 0.3
                            border.color: LomiriColors.coolGrey
                            color: LomiriColors.lightAubergine
                            border.width: 3
                            radius: 8
                        }
                        text: "ZOOM Ok :)"
                        onClicked: {
                            Qt.quit()
                        }
                    }
                    Rectangle {
                        color: "transparent"
                        width: units.gu(44); height: units.gu(5)
                        radius: 20

                    }
                }
            }
        }
    }





