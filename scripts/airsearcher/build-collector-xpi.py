"""Packs the collector extension into airsearch-collector.xpi, one file Zen can load.

Run from anywhere:  python3 scripts/airsearcher/build-collector-xpi.py
Every file in collector-extension/ goes in, except the README.
"""
import os
import zipfile

here = os.path.dirname(os.path.abspath(__file__))
source = os.path.join(here, "collector-extension")
out = os.path.join(here, "airsearch-collector.xpi")

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as pack:
    for name in sorted(os.listdir(source)):
        if name != "README.md":
            pack.write(os.path.join(source, name), name)
print(out, os.path.getsize(out), "bytes")
