	#include <iostream>
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
	    std::cout << "Have " << argc << " arguments:\n";
	    if (argc < 2)
	    {
	        return 0;
	    }
	    PushClient notif;
	    for (int i = 1; i < argc; ++i) {
	        // Print the argument
	        std::cout << "Argument " << i << ": " << notif.send(argv[i]) << std::endl;
	    }
	    return 1;
	}
	
	
