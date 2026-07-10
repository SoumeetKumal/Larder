@echo off
title Larder — Recipe Server
echo.
echo   Starting Larder...
echo.
cd /d "%~dp0"
node server.js
pause
