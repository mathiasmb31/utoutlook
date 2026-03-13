#!/bin/bash
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
for i in $(ps -ef | grep prospect-mail | grep -v grep | awk '{print $2}'); do kill -9 $i; done
echo "killed "
ps axw
echo "-------------------------------------------------------------"
