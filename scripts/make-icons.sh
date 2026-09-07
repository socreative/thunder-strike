#!/bin/sh
# Home Screen icons from the title logo. The logo is wide (1400 x 525), so it is
# set on a square of the page background with a little breathing room. The
# maskable variant keeps the mark inside the 80% safe zone Android crops to.
set -e
cd "$(dirname "$0")/.."
BG='#0b0e0c'
magick public/logo.webp -resize 880x -background "$BG" -gravity center -extent 1024x1024 public/icons/icon-1024.png
magick public/icons/icon-1024.png -resize 512x512 public/icons/icon-512.png
magick public/icons/icon-1024.png -resize 192x192 public/icons/icon-192.png
magick public/icons/icon-1024.png -resize 180x180 public/icons/apple-touch-icon.png
magick public/logo.webp -resize 720x -background "$BG" -gravity center -extent 1024x1024 -resize 512x512 public/icons/icon-512-maskable.png
rm public/icons/icon-1024.png
