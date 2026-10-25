@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0personal\Manage-Keydesk.ps1" -Action Build
if errorlevel 1 pause
