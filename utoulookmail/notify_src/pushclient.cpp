/* Copyright (C) 2017 Dan Chapman <dpniel@ubuntu.com>

   This file is part of Dekko email client for Ubuntu devices

   This program is free software; you can redistribute it and/or
   modify it under the terms of the GNU General Public License as
   published by the Free Software Foundation; either version 2 of
   the License, or (at your option) version 3

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
#include "pushclient.h"
#include <QPointer>
#include <QByteArray>
#include <QDBusMessage>
#include <QDBusConnection>
#include <QJsonDocument>
#include <QDebug>
#include <QJsonArray>
#include <QVariantMap>

#define PUSH_APP_ID "utoutlook.mathias_utoutlook"
#define POSTAL_SERVICE "com.lomiri.Postal"
#define POSTAL_PATH_PREFIX "/com/lomiri/Postal/"
#define POSTAL_IFACE "com.lomiri.Postal"

// D-Bus call timeout in milliseconds.
// Default is 25s — too long for startup notifications.
// 5s is enough for a responsive service, and fails fast if not ready.
#define DBUS_TIMEOUT_MS 5000

static QPointer<PushClient> s_client;
PushClient *PushClient::instance()
{
    if (s_client.isNull()) {
        s_client = new PushClient();
    }
    return s_client;
}

PushClient::PushClient(QObject *parent) : QObject(parent),
    m_conn(QDBusConnection::sessionBus())
{
    // hotfix (badge): do NOT call updateCount() here. utoutlook posts one-shot
    // notifications without a tag, so m_tags stays empty and updateCount() would
    // reset the launcher badge (unread count set by setBadgeCount) to 0 on every
    // notify invocation.
}

// ============================================================
// New: Build a notification with separate title and body,
// plus a "Ouvrir" action that activates the app on click.
// ============================================================
QJsonObject PushClient::buildNotification(const QString &title, const QString &body) {
    QString icon = QString("/opt/click.ubuntu.com/utoutlook.mathias/current/assets/logo.png");

    QJsonObject c;
    c["summary"] = title;
    if (!body.isEmpty()) {
        c["body"] = body;
    }
    c["popup"] = true;
    c["persist"] = true;
    c["icon"] = icon;

    // Action "Ouvrir" — clicking the notification opens the app
    QJsonArray actions;
    QJsonObject action;
    action["label"] = QString("Ouvrir");
    action["activation"] = QString("app://utoutlook.mathias");
    actions.append(action);
    c["actions"] = actions;

    QJsonObject notification;
    notification["card"] = c;
    notification["sound"] = false;
    notification["vibrate"] = true;

    QJsonObject message;
    message["notification"] = notification;
    return message;
}

// ============================================================
// Legacy: single-string notification (backward compatible)
// ============================================================
QJsonObject PushClient::buildSummaryMessage(const QString &msg) {
    return buildNotification(msg, QString());
}

// ============================================================
// Send notification with title and body
// ============================================================
bool PushClient::send(const QString &title, const QString &body)
{
    return send(buildNotification(title, body));
}

// Legacy single-string send
bool PushClient::send(const QString &message)
{
    return send(buildSummaryMessage(message));
}

// ============================================================
// D-Bus send (unchanged core logic)
// ============================================================
bool PushClient::send(const QJsonObject &message)
{
    QDBusMessage msg = QDBusMessage::createMethodCall(POSTAL_SERVICE,
                                                      makePath(PUSH_APP_ID, POSTAL_PATH_PREFIX),
                                                      POSTAL_IFACE,
                                                      "Post");
    msg << PUSH_APP_ID;
    QByteArray data = QJsonDocument(message).toJson(QJsonDocument::Compact);
    msg << QString::fromUtf8(data);

    qDebug() << "[POST] >>  " << msg;

    QDBusMessage reply = m_conn.call(msg, QDBus::Block, DBUS_TIMEOUT_MS);
    if (reply.type() == QDBusMessage::ErrorMessage) {
        qDebug() << "[POST ERROR] " << reply.errorMessage();
        return false;
    }
    qDebug() << "[POST SUCCESS] >> Message posted.";
    // hotfix (badge): do NOT call updateCount(tag) here — utoutlook posts
    // one-shot notifications without a tag, so m_tags stays empty and
    // updateCount() would reset the launcher badge (unread count) to 0.
    return true;
}

// ============================================================
// Launcher badge count (Ubuntu Touch dock icon)
// ============================================================
bool PushClient::setBadgeCount(int count)
{
    // hotfix (badge): com.lomiri.LauncherEntry does not exist on UT 24.04, so
    // the old "Update" call always failed and the badge never showed. Use the
    // official com.lomiri.Postal.SetCounter API instead — it drives the Lomiri
    // launcher badge (com.lomiri.Shell.Launcher.Item count/countVisible).
    // Verified on device: SetCounter(appId, 9, true) -> count=9, countVisible=true.
    QDBusMessage msg = QDBusMessage::createMethodCall(
        POSTAL_SERVICE,
        makePath(PUSH_APP_ID, POSTAL_PATH_PREFIX),
        POSTAL_IFACE,
        "SetCounter"
    );
    msg << QString(PUSH_APP_ID) << count << (count > 0);

    qDebug() << "[BADGE] >> Setting badge count to" << count;

    QDBusMessage reply = m_conn.call(msg, QDBus::Block, DBUS_TIMEOUT_MS);
    if (reply.type() == QDBusMessage::ErrorMessage) {
        qDebug() << "[BADGE ERROR] " << reply.errorMessage();
        return false;
    }
    qDebug() << "[BADGE SUCCESS] >> Badge updated.";
    return true;
}

// ============================================================
// Update / clear persistent notifications (unchanged)
// ============================================================
bool PushClient::update(const QString &tag, const QJsonObject &message)
{
    if (hasTag(tag)) {
        clearPersistent(tag);
    }
    return send(message);
}

bool PushClient::hasTag(const QString &tag)
{
    return m_tags.contains(tag);
}

bool PushClient::clearPersistent(const QString &tag)
{
    if (m_tags.contains(tag)) {
        qDebug() << "[REMOVE] >> Removing message: " << tag;
        QDBusMessage message = QDBusMessage::createMethodCall(POSTAL_SERVICE,
                                                              makePath(PUSH_APP_ID, POSTAL_PATH_PREFIX),
                                                              POSTAL_IFACE,
                                                              "ClearPersistent");
        message << PUSH_APP_ID;
        message << tag;

        QDBusMessage reply = m_conn.call(message, QDBus::Block, DBUS_TIMEOUT_MS);
        if (reply.type() == QDBusMessage::ErrorMessage) {
            qDebug() << "[REMOVE ERROR] " << reply.errorMessage();
            return false;
        }
        qDebug() << "[REMOVE SUCCESS] Notification removed";
        return updateCount(tag, true);
    }
    return false;
}

bool PushClient::updateCount(const QString &tag, const bool remove)
{
    qDebug() << "[COUNT] >> Updating launcher count";
    if (!tag.isEmpty()) {
        if (!remove && !m_tags.contains(tag)) {
            qDebug() << "[COUNT] >> Tag not yet in persistent list. adding it now: " << tag;
            m_tags << tag;
        }
        if (remove && m_tags.contains(tag)) {
            qDebug() << "[COUNT] >> Removing tag from persistent list: " << tag;
            m_tags.removeAll(tag);
        }
    }

    bool visible = m_tags.count() != 0;
    QDBusMessage message = QDBusMessage::createMethodCall(POSTAL_SERVICE,
                                                          makePath(PUSH_APP_ID, POSTAL_PATH_PREFIX),
                                                          POSTAL_IFACE,
                                                          "SetCounter");
    message << PUSH_APP_ID << m_tags.count() << visible;
    bool result = m_conn.send(message);
    if (result) {
        qDebug() << "[COUNT] >> Updated.";
    }
    return result;
}

// ============================================================
// Path helpers
// ============================================================

// Generalized: escape appId for D-Bus object paths with a given prefix
QByteArray PushClient::makePath(const QString &appId, const QString &prefix)
{
    QByteArray path(prefix.toUtf8());

    QByteArray pkg = appId.split('_').first().toUtf8();
    for (int i = 0; i < pkg.count(); i++) {
        char buffer[10];
        char c = pkg[i];
        switch (c) {
        case '+':
        case '.':
        case '-':
        case ':':
        case '~':
        case '_':
            sprintf(buffer, "_%.2x", c);
            path += buffer;
            break;
        default:
            path += c;
        }
    }
    qDebug() << "[PATH] >> " << path;
    return path;
}

QStringList PushClient::getPersistent()
{
    QDBusMessage message = QDBusMessage::createMethodCall(POSTAL_SERVICE,
                                                          makePath(PUSH_APP_ID, POSTAL_PATH_PREFIX),
                                                          POSTAL_IFACE,
                                                          "ListPersistent");
    message << PUSH_APP_ID;
    QDBusMessage reply = m_conn.call(message, QDBus::Block, DBUS_TIMEOUT_MS);
    if (reply.type() == QDBusMessage::ErrorMessage) {
        qDebug() << reply.errorMessage();
        return QStringList();
    }
    QStringList tags = reply.arguments()[0].toStringList();
    qDebug() << "[TAGS] >> " << tags;
    return tags;
}
