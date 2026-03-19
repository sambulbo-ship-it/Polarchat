#!/bin/bash
# Generate app icons from a source PNG (1024x1024 recommended)
# Requires: ImageMagick (convert command)
#
# Usage: ./generate-icons.sh source-icon.png

SOURCE="${1:-icon-source.png}"

if [ ! -f "$SOURCE" ]; then
    echo "Usage: $0 <source-icon-1024x1024.png>"
    echo ""
    echo "To create a placeholder icon for development, run:"
    echo "  convert -size 1024x1024 xc:'#0f3460' -fill '#e4e4e7' -gravity center \\"
    echo "    -font Helvetica-Bold -pointsize 400 -annotate 0 'P' icon-source.png"
    exit 1
fi

echo "Generating icons from: $SOURCE"

# macOS .icns (needs iconutil on macOS)
if command -v iconutil &> /dev/null; then
    ICONSET="icon.iconset"
    mkdir -p "$ICONSET"
    convert "$SOURCE" -resize 16x16     "$ICONSET/icon_16x16.png"
    convert "$SOURCE" -resize 32x32     "$ICONSET/icon_16x16@2x.png"
    convert "$SOURCE" -resize 32x32     "$ICONSET/icon_32x32.png"
    convert "$SOURCE" -resize 64x64     "$ICONSET/icon_32x32@2x.png"
    convert "$SOURCE" -resize 128x128   "$ICONSET/icon_128x128.png"
    convert "$SOURCE" -resize 256x256   "$ICONSET/icon_128x128@2x.png"
    convert "$SOURCE" -resize 256x256   "$ICONSET/icon_256x256.png"
    convert "$SOURCE" -resize 512x512   "$ICONSET/icon_256x256@2x.png"
    convert "$SOURCE" -resize 512x512   "$ICONSET/icon_512x512.png"
    convert "$SOURCE" -resize 1024x1024 "$ICONSET/icon_512x512@2x.png"
    iconutil -c icns "$ICONSET" -o icon.icns
    rm -rf "$ICONSET"
    echo "Created: icon.icns (macOS)"
fi

# Windows .ico
if command -v convert &> /dev/null; then
    convert "$SOURCE" -resize 256x256 \
        \( -clone 0 -resize 16x16 \) \
        \( -clone 0 -resize 32x32 \) \
        \( -clone 0 -resize 48x48 \) \
        \( -clone 0 -resize 64x64 \) \
        \( -clone 0 -resize 128x128 \) \
        \( -clone 0 -resize 256x256 \) \
        -delete 0 icon.ico
    echo "Created: icon.ico (Windows)"
fi

# Linux PNG icons (various sizes for .desktop files)
for size in 16 24 32 48 64 128 256 512 1024; do
    if command -v convert &> /dev/null; then
        convert "$SOURCE" -resize ${size}x${size} "icons/${size}x${size}.png"
        echo "Created: icons/${size}x${size}.png"
    fi
done

# Main icon.png (512x512 for general use)
if command -v convert &> /dev/null; then
    convert "$SOURCE" -resize 512x512 icon.png
    echo "Created: icon.png"
    convert "$SOURCE" -resize 16x16 tray-icon.png
    echo "Created: tray-icon.png"
fi

echo ""
echo "Done! Place these files in electron/assets/"
