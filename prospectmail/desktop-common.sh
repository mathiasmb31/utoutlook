#!/bin/bash -e
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
###############################################
# Launcher common exports for any desktop app #
###############################################
echo "BEGIN DESKTOP-COMMON-------------------------"
function prepend_dir() {
  local var="$1"
  local dir="$2"
  if [ -d "$dir" ]; then
    eval "export $var=\"\$dir\${$var:+:\$$var}\""
  fi
}

function append_dir() {
  local var="$1"
  local dir="$2"
  if [ -d "$dir" ]; then
    eval "export $var=\"\${$var:+\$$var:}\$dir\""
  fi
}

function can_open_file() {
  head -c0 "$1" &> /dev/null
}


function is_subpath() {
  dir="$(realpath "$1")"
  parent="$(realpath "$2")"
  [ "${dir##$parent/}" != "$dir" ] && return 0 || return 1
}

if [ -n "$SNAP_DESKTOP_RUNTIME" ]; then
  # add general paths not added by snapcraft due to runtime snap
  append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/lib/$SNAP_DESKTOP_ARCH_TRIPLET"
  append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET"
  append_dir PATH "$SNAP_DESKTOP_RUNTIME/usr/bin"
fi

# XKB config
export XKB_CONFIG_ROOT="$SNAP_DESKTOP_RUNTIME/usr/share/X11/xkb"

# Give XOpenIM a chance to locate locale data.
# This is required for text input to work in SDL2 games.
export XLOCALEDIR="$SNAP_DESKTOP_RUNTIME/usr/share/X11/locale"

# Set XCursors path
export XCURSOR_PATH="$SNAP_DESKTOP_RUNTIME/usr/share/icons"
prepend_dir XCURSOR_PATH "$SNAP/data-dir/icons"

# Mesa Libs for OpenGL support
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/mesa"
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/mesa-egl"

# Tell libGL where to find the drivers
export LIBGL_DRIVERS_PATH="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/dri"
append_dir LD_LIBRARY_PATH "$LIBGL_DRIVERS_PATH"
export LIBVA_DRIVERS_PATH=$SNAP_DESKTOP_RUNTIME/usr/lib/$ARCH/dri

# Workaround in snapd for proprietary nVidia drivers mounts the drivers in
# /var/lib/snapd/lib/gl that needs to be in LD_LIBRARY_PATH
# Without that OpenGL using apps do not work with the nVidia drivers.
# Ref.: https://bugs.launchpad.net/snappy/+bug/1588192
append_dir LD_LIBRARY_PATH /var/lib/snapd/lib/gl

# Unity7 export (workaround for https://launchpad.net/bugs/1638405)
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/libunity"

# Pulseaudio export
append_dir LD_LIBRARY_PATH "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/pulseaudio"

# EGL vendor files on glvnd enabled systems
[ -d /var/lib/snapd/lib/glvnd/egl_vendor.d ] && \
    append_dir __EGL_VENDOR_LIBRARY_DIRS /var/lib/snapd/lib/glvnd/egl_vendor.d

# Tell GStreamer where to find its plugins
export GST_PLUGIN_PATH="$SNAP/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gstreamer-1.0"
# gst plugin scanner doesn't install in the correct path: https://github.com/ubuntu/snapcraft-desktop-helpers/issues/43
export GST_PLUGIN_SCANNER="$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"

# XDG Config
[ -n "$SNAP_DESKTOP_RUNTIME" ] && prepend_dir XDG_CONFIG_DIRS "$SNAP_DESKTOP_RUNTIME/etc/xdg"
prepend_dir XDG_CONFIG_DIRS "$SNAP/etc/xdg"

# Define snaps' own data dir
[ -n "$SNAP_DESKTOP_RUNTIME" ] && prepend_dir XDG_DATA_DIRS "$SNAP_DESKTOP_RUNTIME/usr/share"
prepend_dir XDG_DATA_DIRS "$SNAP/usr/share"
prepend_dir XDG_DATA_DIRS "$SNAP/share"
prepend_dir XDG_DATA_DIRS "$SNAP/data-dir"
prepend_dir XDG_DATA_DIRS "$SNAP_USER_DATA"

echo " Set XDG_DATA_HOME to local path---------------------"
echo $XDG_DATA_HOME
if [ -d $XDG_DATA_HOME ]; then
	echo "directory exist"
else
	echo "create directory $XDG_HOME"
	mkdir -p "$XDG_DATA_HOME"
fi
echo " local path written" 

# Workaround for GLib < 2.53.2 not searching for schemas in $XDG_DATA_HOME:
#   https://bugzilla.gnome.org/show_bug.cgi?id=741335
prepend_dir XDG_DATA_DIRS "$XDG_DATA_HOME"

echo " Set cache folder to local path---------------------------"
export XDG_CACHE_HOME="$SNAP_USER_COMMON/.cache"
if [[ -d "$SNAP_USER_DATA/.cache" && ! -e "$XDG_CACHE_HOME" ]]; then
  # the .cache directory used to be stored under $SNAP_USER_DATA, migrate it
  mv "$SNAP_USER_DATA/.cache" "$SNAP_USER_COMMON/"
fi
echo "testing cache-----------------------------------"
if [ -d "${XDG_CACHE_HOME}" ]; then
	echo "cache exist"
else
	echo "create cache"
	echo "$XDG_CACHE_HOME---------"
	mkdir -p "$XDG_CACHE_HOME"
fi
echo " Set config folder to local path-----------------------------"
export XDG_CONFIG_HOME="$SNAP_USER_DATA/.config"
if [ -d ${XDG_CONFIG_HOME} ]; then
	echo "directory config exist"
else
	echo "create config home"

	mkdir -p "$XDG_CONFIG_HOME"
	chmod 755 $XDG_CONFIG_HOME
fi
# Create $XDG_RUNTIME_DIR if not exists (to be removed when LP: #1656340 is fixed)
if [ -d "$XDG_RUNTIME_DIR" ]; then
  echo "not needed"
  else
  mkdir -p "$XDG_RUNTIME_DIR"
  chmod 700 "$XDG_RUNTIME_DIR"
fi

# Ensure the app finds locale definitions (requires locales-all to be installed)
append_dir LOCPATH "$SNAP_DESKTOP_RUNTIME/usr/lib/locale"


# Setup user-dirs.* or run xdg-user-dirs-update if needed
needs_xdg_update=false
needs_xdg_reload=false
needs_xdg_links=false
echo "------------------------------------MOVE CONFIG--------------"

# Keep an array of data dirs, for looping through them
IFS=':' read -r -a data_dirs_array <<< "$XDG_DATA_DIRS"

# Font Config and themes
export FONTCONFIG_PATH="$SNAP_DESKTOP_RUNTIME/etc/fonts"
export FONTCONFIG_FILE="$SNAP_DESKTOP_RUNTIME/etc/fonts/fonts.conf"

function make_user_fontconfig {
  echo "<fontconfig>"
  if [ -d "$REALHOME/.local/share/fonts" ]; then
    echo "  <dir>$REALHOME/.local/share/fonts</dir>"
  fi
  if [ -d "$REALHOME/.fonts" ]; then
    echo "  <dir>$REALHOME/.fonts</dir>"
  fi
  for ((i = 0; i < ${#data_dirs_array[@]}; i++)); do
    if [ -d "${data_dirs_array[$i]}/fonts" ]; then
      echo "  <dir>${data_dirs_array[$i]}/fonts</dir>"
    fi
  done
  echo '  <include ignore_missing="yes">conf.d</include>'
  # We need to include this default cachedir first so that caching
  # works: without it, fontconfig will try to write to the real user home
  # cachedir and be blocked by AppArmor.
  echo '  <cachedir prefix="xdg">fontconfig</cachedir>'
  if [ -d "$REALHOME/.cache/fontconfig" ]; then
    echo "  <cachedir>$REALHOME/.cache/fontconfig</cachedir>"
  fi
  echo "</fontconfig>"
}

if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -rf "$XDG_DATA_HOME"/{fontconfig,fonts,fonts-*,themes,.themes}

  # This fontconfig fragment is installed in a location that is
  # included by the system fontconfig configuration: namely the
  # etc/fonts/conf.d/50-user.conf file.
  if [ -d  "$XDG_CONFIG_HOME/fontconfig" ]
  then 
	 echo "directory exist"
  else 
  	mkdir -p "$XDG_CONFIG_HOME/fontconfig"
  fi
  make_user_fontconfig > "$XDG_CONFIG_HOME/fontconfig/fonts.conf"

  # the themes symlink are needed for GTK 3.18 when the prefix isn't changed
  # GTK 3.20 looks into XDG_DATA_DIR which has connected themes.
  ln -sf "$SNAP/data-dir/themes" "$XDG_DATA_HOME"
  ln -sfn "$SNAP/data-dir/themes" "$SNAP_USER_DATA/.themes"
fi

# Build mime.cache
# needed for gtk and qt icon
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -rf "$XDG_DATA_HOME/mime"
  if [ ! -f "$SNAP_DESKTOP_RUNTIME/usr/share/mime/mime.cache" ]; then
    if command -v update-mime-database >/dev/null; then
      cp --preserve=timestamps -dR "$SNAP_DESKTOP_RUNTIME/usr/share/mime" "$XDG_DATA_HOME"
      update-mime-database "$XDG_DATA_HOME/mime"
    fi
  fi
fi

# Gio modules and cache (including gsettings module)
export GIO_MODULE_DIR="$XDG_CACHE_HOME/gio-modules"
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  if [ -f "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/glib-2.0/gio-querymodules" ]; then
    rm -rf "$GIO_MODULE_DIR"
    mkdir -p "$GIO_MODULE_DIR"
    ln -sf "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gio/modules/"*.so "$GIO_MODULE_DIR"
    ln -sf "$SNAP/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gio/modules/"*.so "$GIO_MODULE_DIR"
    "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/glib-2.0/gio-querymodules" "$GIO_MODULE_DIR"
  fi
fi

# Setup compiled gsettings schema
GS_SCHEMA_DIR="$XDG_DATA_HOME/glib-2.0/schemas"

# Enable gsettings user changes
# symlink the dconf file if home plug is connected for read


# Testability support
append_dir LD_LIBRARY_PATH "$SNAP/testability"
append_dir LD_LIBRARY_PATH "$SNAP/testability/$SNAP_DESKTOP_ARCH_TRIPLET"
append_dir LD_LIBRARY_PATH "$SNAP/testability/$SNAP_DESKTOP_ARCH_TRIPLET/mesa"

# Gdk-pixbuf loaders
export GDK_PIXBUF_MODULE_FILE=$XDG_CACHE_HOME/gdk-pixbuf-loaders.cache
export GDK_PIXBUF_MODULEDIR=$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gdk-pixbuf-2.0/2.10.0/loaders
if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then
  rm -f "$GDK_PIXBUF_MODULE_FILE"
  if [ -f "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders" ]; then
    "$SNAP_DESKTOP_RUNTIME/usr/lib/$SNAP_DESKTOP_ARCH_TRIPLET/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders" > "$GDK_PIXBUF_MODULE_FILE"
  fi
fi
cd 

export SNAP_DESKTOP_WAYLAND_AVAILABLE
echo "Done desktop common---------------------------------------"
exec "$@"
