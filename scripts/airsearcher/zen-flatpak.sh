#!/bin/sh
# Starts the Flatpak Zen the way web-ext expects a browser binary to start.
# The extension folder is shared read-only with the sandbox for this run only;
# nothing about Zen's permissions is changed for good.
exec flatpak run --filesystem="${AIRSEARCH_EXT_DIR}:ro" app.zen_browser.zen "$@"
