/* socketcli.c — minimal Unix-socket JSON client for the click wrapper.
 * v4.1.0: remplace python3 (non embarqué / refusé par AppArmor) et nc
 * (netcat-traditional sans support -U sur UT).
 * Usage: socketcli <socket-path> <json-line> [timeout-seconds]
 * Écrit la réponse du serveur sur stdout (utile pour le ping).
 */
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/select.h>
#include <sys/time.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc < 3) return 2;

    int s = socket(AF_UNIX, SOCK_STREAM, 0);
    if (s < 0) return 1;

    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, argv[1], sizeof(addr.sun_path) - 1);

    if (connect(s, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(s);
        return 1;
    }

    char msg[4096];
    int n = snprintf(msg, sizeof(msg), "%s\n", argv[2]);
    if (n <= 0 || write(s, msg, (size_t)n) < 0) {
        close(s);
        return 1;
    }

    int timeout = 2;
    if (argc > 3) timeout = atoi(argv[3]);
    if (timeout < 1) timeout = 1;

    fd_set rfds;
    FD_ZERO(&rfds);
    FD_SET(s, &rfds);
    struct timeval tv;
    tv.tv_sec = timeout;
    tv.tv_usec = 0;

    if (select(s + 1, &rfds, NULL, NULL, &tv) > 0) {
        char buf[4096];
        ssize_t got = read(s, buf, sizeof(buf) - 1);
        if (got > 0) {
            buf[got] = '\0';
            fputs(buf, stdout);
            fflush(stdout);
        }
    }

    close(s);
    return 0;
}
