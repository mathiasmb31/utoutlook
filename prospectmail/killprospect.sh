#!/bin/bash -e
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
pkill prospect
