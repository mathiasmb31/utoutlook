SNAP_FILE="prospect-mail.snap"
cd ${BUILD_DIR}
DOWNLOAD_URL=$(curl -s https://api.snapcraft.io/v2/snaps/info/prospect-mail -H "Snap-Device-Series: 16" -H "Snap-Architecture: arm64" | jq -r '.["channel-map"][] 
            | select(.channel.architecture=="arm64" and .channel.name=="stable") 
            | .download.url'
            )
if ! test -e "$ROOT/$SNAP_FILE"; then
	    curl -L -o "$ROOT/$SNAP_FILE" "$DOWNLOAD_URL"
fi
