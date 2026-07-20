@echo off
title Larder — Recipe Server
setlocal

:: Get the local IP address
for /f "tokens=14" %%a in ('ipconfig ^| findstr IPv4') do set LOCAL_IP=%%a

echo =======================================================
echo   [ Larder CMS is starting... ]
echo =======================================================
echo.
echo   📡 Your Local IP: %LOCAL_IP%
echo   📝 CMS UI:        http://%LOCAL_IP%:8000/cms.html
echo   📱 FitTrack App:  Enter %LOCAL_IP% in Settings
echo.
echo =======================================================

cd /d "%~dp0"
node server.js
