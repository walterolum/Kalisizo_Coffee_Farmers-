@echo off
rem Foreground variant of start-dev.cmd: runs the dev server in this window and
rem logs to dev-boot.log. Same path fix - the old hardcoded F:\kalisizo-coffee
rem meant cd failed and the server never started on any other machine.
cd /d "%~dp0"
set "PORT=3000"
echo starting kalisizo next dev at %date% %time% > "%~dp0dev-boot.log"
call npm run dev >> "%~dp0dev-boot.log" 2>&1
