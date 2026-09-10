@echo off

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-cn-index.ps1"

if errorlevel 1 pause

