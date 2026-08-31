@echo off
title Köln Live-Monitor & City-Plattform
echo ====================================================
echo 🚀 Starte Köln Live-Monitor & City-Plattform...
echo ====================================================
echo.

cd /d "%~dp0"
start "" http://localhost:3000
node server.js
pause
