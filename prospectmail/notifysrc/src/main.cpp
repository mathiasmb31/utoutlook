#include <QGuiApplication>
#include <QObject>
#include <QString>
#include <QDir>
#include <QQmlApplicationEngine>
#include <QStandardPaths>
#include <QDir>
#include <QFile>
#include <QTextStream>
#include <QThread>

#include "pushclient.h"
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusConnectionInterface>

#include <QQuickView>
#include <QQmlContext>
#include <QScreen>


int main(int argc, char *argv[])
{

    PushClient notif;
    notif.send("Notification test");

    QCoreApplication::setOrganizationName("pparent");
    QCoreApplication::setApplicationName("notify");

    QThread::sleep(10);
    notif.send("Notification test2");


    //Start QML application
    QGuiApplication app(argc, argv);

    QQuickView * m_view = new QQuickView();
    m_view->setMinimumSize(QSize(300, 600));
    m_view->setTitle("Messaging");
    m_view->rootContext()->setContextProperty("application", &app);
    m_view->setResizeMode(QQuickView::SizeRootObjectToView);
    m_view->engine()->rootContext()->setContextProperty("pushNotifier", &notif);

    const QUrl url("qrc:/qml/Main.qml");
    m_view->setSource(url);

    m_view->show();


    return app.exec();
}

