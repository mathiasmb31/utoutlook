#!/bin/python3
import glob
import sys
import json 
if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <path/file>")
    exit(1)


for p in glob.glob(sys.argv[1]):
    print(p)

	
