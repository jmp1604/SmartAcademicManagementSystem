@echo off
title SAMS Registration Engine
echo ===================================================
echo Starting Face Registration Engine (Port 5000)
echo ===================================================
start "" "C:\Users\PLPASIG\pythonnn\pythonw.exe" "%~dp0face_capture.py"
exit