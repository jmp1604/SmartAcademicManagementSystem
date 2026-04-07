@echo off
title SAMS Attendance Engine
echo ===================================================
echo Starting Lab Attendance Engine (Port 5000)
echo ===================================================
start "" "C:\Users\PLPASIG\pythonnn\pythonw.exe" "%~dp0flask_attendance.py"
exit