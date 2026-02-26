#include <QGuiApplication>
#include <QDesktopServices>
#include <QUrl>
#include <QString>
#include <QDebug>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    qWarning() << "Usage: xdg-open-test <url ou fichier>will try to open" << argv[1];

    // Vérifie qu'un argument (URL ou chemin) a été passé
    if (argc < 2) {
        qWarning() << "Usage: xdg-open-test <url ou fichier>";
        return 1;
    }

    QString input = QString::fromLocal8Bit(argv[1]);
    QUrl url = QUrl::fromUserInput(input);

    if (!url.isValid()) {
        qWarning() << "URL invalide:" << input;
        return 2;
    }

    bool ok = QDesktopServices::openUrl(url);
    if (!ok) {
        qWarning() << "Échec de l’ouverture de l’URL:" << url;
        return 3;
    }

    return 0;
}
