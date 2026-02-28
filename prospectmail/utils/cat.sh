#!/bin/python3
import os
import sys
import shutil
import subprocess

def cat_file(file_path):
    try:
        result = subprocess.run(["cat", file_path], capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error reading file: {e}")
        return None

# Usage
if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <file> ")
    exit(1)

# Récupérer le chemin dans le premier argument

file = sys.argv[1]
content = cat_file(file)
if content:
    print(content)
