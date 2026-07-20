@echo off
echo Requesting Administrator privileges to add firewall rule for port 8000...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator privileges confirmed.
) else (
    echo Requesting elevation...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

echo Adding firewall rule...
powershell -Command "New-NetFirewallRule -DisplayName 'Larder CMS' -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Any"
echo Firewall rule added successfully! You can now sync from your phone.
pause
