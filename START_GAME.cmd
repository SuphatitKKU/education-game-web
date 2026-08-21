@echo off
setlocal
cd /d "%~dp0"
set "GAME_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "GAME_NODE=C:\Users\supha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
start "" "http://localhost:4173"
"%GAME_NODE%" server.mjs
pause
