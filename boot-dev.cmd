@echo off
cd /d F:\kalisizo-coffee
set "PORT=3000"
echo starting kalisizo next dev at %date% %time% > F:\kalisizo-coffee\dev-boot.log
call npm run dev >> F:\kalisizo-coffee\dev-boot.log 2>&1