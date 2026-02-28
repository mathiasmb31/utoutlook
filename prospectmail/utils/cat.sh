#!/bin/python3
import os
import sys
import shutil


# Usage
if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <file> ")
    exit(1)

# Récupérer le chemin dans le premier argument

file = sys.argv[1]
f = open(file)
print(f.read()) 

