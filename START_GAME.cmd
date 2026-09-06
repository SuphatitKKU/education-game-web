@echo off
setlocal
cd /d "%~dp0"
set "GAME_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "GAME_NODE=C:\Users\supha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "GAME_URL=http://localhost:4173/education-game-web/"

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%GAME_URL%" --window-size=1280,820
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="%GAME_URL%" --window-size=1280,820
) else (
    start "" "%GAME_URL%"
)

"%GAME_NODE%" server.mjs
pause
