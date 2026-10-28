@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 start_server.py
    goto done
)
where python >nul 2>nul
if not errorlevel 1 (
    python start_server.py
    goto done
)
echo Python 3 was not found. Open Master_Calc_v2.html in your browser.
:done
pause
