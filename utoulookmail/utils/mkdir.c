
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

#include <unistd.h>        // chdir
#include <sys/stat.h>      // mkdir

#define PATH "/home/phablet/.config/prospectmail.mathias"
#define PATH2 "/home/phablet/.config/prospectmail.mathias/data"
#define PATH3 "/home/phablet/.config/prospectmail.mathias/Prospect Mail/"

int main() 
	{
    int c;
	
    if ( mkdir( PATH, 0755 ) != 0 ) {
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

