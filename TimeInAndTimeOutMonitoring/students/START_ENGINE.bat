@echo off
title SAMS Lab Camera Engine
echo ===================================================
echo Starting SAMS Face Registration Engine (Background)
echo ===================================================

:: %~dp0 automatically finds the folder this .bat file is sitting in!
start "" "C:\Users\PLPASIG\pythonnn\pythonw.exe" "%~dp0face_capture.py"

echo.
echo SUCCESS: The Lab System is now running in the background!
echo It is safe to close this window. Your website is ready.
echo ===================================================
pause