#!/bin/python3
import os
import sys
import shutil

# Vérifier qu'un argument a été fourni
if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <file> ")
    exit(1)

# Récupérer le chemin dans le premier argument

dir = sys.argv[1]


# If file exists, delete it.
os.rmdir(dir)
