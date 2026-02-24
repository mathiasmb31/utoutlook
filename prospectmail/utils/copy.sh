#!/bin/python3
import os
import sys
import shutil

# Vérifier qu'un argument a été fourni
if len(sys.argv) < 3:
    print(f"Usage: {sys.argv[0]} <file> <path> ")
    exit(1)

# Récupérer le chemin dans le premier argument
path = sys.argv[2]
file = sys.argv[1]
shutil.copy(file, path)
