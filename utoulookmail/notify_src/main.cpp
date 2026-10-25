
#include "pushclient.h"


int main(int argc, char *argv[])
{
    PushClient notif;
    if (argc > 1)
    {
        QString arg1 = QString::fromLocal8Bit(argv[1]);

        // Mode badge: notify --badge <count>
        if (arg1 == "--badge" && argc > 2) {
            bool ok;
            int count = QString::fromLocal8Bit(argv[2]).toInt(&ok);
            if (ok) {
                notif.setBadgeCount(count);
            }
            return 0;
        }

        // Mode notification: notify <title> [body]
        QString title = arg1;
        QString body = (argc > 2) ? QString::fromLocal8Bit(argv[2]) : "";
        notif.send(title, body);
    }

    return 0;
}
