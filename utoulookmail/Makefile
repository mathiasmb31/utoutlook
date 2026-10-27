# Build complet utoutlook: C++ (notify) + Electron (prospect-mail)
# Commandes:
#   make              → C++ + Electron en parallèle (8 cœurs)
#   make cpp          → C++ seul (notify, Ninja + ccache)
#   make electron     → Electron seul (prospect-mail, npm + electron-builder)
#   make clean        → Nettoyer C++
#   make clean-all    → Nettoyer C++ + Electron
#   make rebuild      → clean + build complet
#   make jobs=N       → Build avec N cœurs

JOBS ?= $(shell nproc)

.PHONY: all cpp electron clean clean-all rebuild jobs

all:
	./build-fast.sh $(JOBS)

cpp:
	./build-fast.sh $(JOBS) --cpp-only

electron:
	./build-fast.sh $(JOBS) --electron-only

clean:
	rm -rf build-ninja CMakeCache.txt CMakeFiles cmake_install.cmake notify_autogen

clean-all: clean
	rm -rf utoutlookmail/dist

rebuild: clean all

jobs:
	./build-fast.sh $(jobs)
