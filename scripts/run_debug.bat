@echo off
title Partly - Debug
where py.exe >nul 2>&1
if %errorlevel% equ 0 (
    py -3 "%~dp0run_debug.py"
) else (
    python "%~dp0run_debug.py"
)
echo.
echo Debug terminato. Premi un tasto per chiudere questa finestra.
pause >nul
