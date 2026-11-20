
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <unistd.h>        // chdir
#include <sys/stat.h>      // mkdir

static char PATH[4096], PATH2[4096], PATH3[4096];

static void build_paths(void) {
    const char *home = getenv("HOME");
    if (!home || !*home) home = "/home/phablet";
    snprintf(PATH,  sizeof(PATH),  "%s/.config/utoutlook.mathias", home);
    snprintf(PATH2, sizeof(PATH2), "%s/.config/utoutlook.mathias/data", home);
    snprintf(PATH3, sizeof(PATH3), "%s/.config/utoutlook.mathias/Prospect Mail/", home);
}

int main()
	{
    int c;
    build_paths();

    // v4.1.0: un dossier déjà présent n'est PAS une erreur — le wrapper
    // appelle mkdir à chaque lancement et le bruit "Impossible de créer..."
    // polluait wrapper.log sans rien signaler de utile.
    if ( mkdir( PATH, 0755 ) != 0 && errno != EEXIST ) {
        fprintf( stderr, "Impossible de créer le dossier %s : \n", PATH );
        switch( errno ) {
            case EACCES:
                fprintf( stderr, "\tTu n'as pas les droits\n" );
                break;
            default:
                fprintf( stderr, "\tJe ne t'en dirais pas plus ;-)" );
        }

    }

    if ( chdir( PATH ) != 0 ) {
        fprintf( stderr, "Impossible de se placer dans le dossier %s.\n", PATH );

    }


    if ( mkdir( PATH2, 0755 ) != 0 ) {
        fprintf( stderr, "Impossible de créer le dossier %s : \n", PATH );
        switch( errno ) {
            case EACCES:
                fprintf( stderr, "\tTu n'as pas les droits\n" );
                break;
            case EEXIST:
                fprintf( stderr, "\tLe dossier existe déjà.\n" );
                break;
            default:
                fprintf( stderr, "\tJe ne t'en dirais pas plus ;-)" );
        }
    }

    if ( chdir( PATH3 ) != 0 ) {
        fprintf( stderr, "Impossible de se placer dans le dossier %s.\n", PATH );

    }

     if ( mkdir( PATH3, 0755 ) != 0 ) {
        fprintf( stderr, "Impossible de créer le dossier %s : \n", PATH );
        switch( errno ) {
            case EACCES:
                fprintf( stderr, "\tTu n'as pas les droits\n" );
                break;
            case EEXIST:
                fprintf( stderr, "\tLe dossier existe déjà.\n" );
                break;
            default:
                fprintf( stderr, "\tJe ne t'en dirais pas plus ;-)" );
        }
    }

    if ( chdir( PATH3 ) != 0 ) {
        fprintf( stderr, "Impossible de se placer dans le dossier %s.\n", PATH );
        exit( EXIT_FAILURE) ;

    }


    return EXIT_SUCCESS;
}
