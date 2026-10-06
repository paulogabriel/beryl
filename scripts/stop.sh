#!/bin/zsh
# Stops the Beryl server started in the background.
if pkill -f "beryl.py serve"; then echo "Beryl stopped."; else echo "Beryl was not running."; fi
