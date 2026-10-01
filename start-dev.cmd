@echo off
cd /d F:\kalisizo-coffee
start "kc-next-dev" cmd /c "npm run dev > F:\kalisizo-coffee\dev-server.log 2>&1"
