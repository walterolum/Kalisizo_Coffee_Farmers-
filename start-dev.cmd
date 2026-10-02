@echo off
rem Starts the Next.js dev server in a separate window, logging to dev-server.log.
rem
rem The project directory used to be hardcoded here as F:\kalisizo-coffee, so this
rem script only worked on the machine it was written on and silently did nothing
rem anywhere else - the cd failed and npm run dev never started. %~dp0 is this
rem script's own directory, so the launcher travels with the repository.
cd /d "%~dp0"
start "kc-next-dev" cmd /c "npm run dev > ""%~dp0dev-server.log"" 2>&1"
