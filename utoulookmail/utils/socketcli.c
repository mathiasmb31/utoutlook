/* socketcli.c — minimal Unix-socket JSON client for the click wrapper.
 * v4.1.0: remplace python3 (non embarqué / refusé par AppArmor) et nc
 * (netcat-traditional sans support -U sur UT).
 * Usage: socketcli <socket-path> <json-line> [timeout-seconds] [wait]
 * Écrit la réponse du serveur sur stdout (utile pour le ping).
 *
 * v4.3.7: 4e argument "wait" = mode long-poll pour le watchdog. La connexion
 * est réessayée (toutes les 100 ms) jusqu'au timeout si le socket n'existe
 * pas encore — typiquement pendant le démarrage d'Electron. Cela évite que
 * le shell wrapper tourne en boucle serrée, sans aucun sleep externe.
 */
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/select.h>
#include <sys/time.h>
#include <time.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <stdlib.h>

static long long now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

int main(int argc, char **argv) {
    if (argc < 3) return 2;

    int timeout = 2;
    if (argc > 3) timeout = atoi(argv[3]);
    if (timeout < 1) timeout = 1;
    const int wait_mode = (argc > 4 && strcmp(argv[4], "wait") == 0);
    const long long deadline = now_ms() + (long long)timeout * 1000;

    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, argv[1], sizeof(addr.sun_path) - 1);

    int s = -1;
    for (;;) {
        s = socket(AF_UNIX, SOCK_STREAM, 0);
        if (s < 0) return 1;
        if (connect(s, (struct sockaddr *)&addr, sizeof(addr)) == 0) break;
        close(s);
        s = -1;
        if (!wait_mode || now_ms() >= deadline) return 1;
        struct timespec nap;
        nap.tv_sec = 0;
        nap.tv_nsec = 100000000; /* 100 ms */
        nanosleep(&nap, NULL);
    }

    char msg[4096];
    int n = snprintf(msg, sizeof(msg), "%s\n", argv[2]);
    if (n <= 0 || write(s, msg, (size_t)n) < 0) {
        close(s);
        return 1;
    }

    long long remain = deadline - now_ms();
    if (remain < 1) remain = 1;
    fd_set rfds;
    FD_ZERO(&rfds);
    FD_SET(s, &rfds);
    struct timeval tv;
    tv.tv_sec = (time_t)(remain / 1000);
    tv.tv_usec = (suseconds_t)((remain % 1000) * 1000);

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
