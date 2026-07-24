@echo off
:: ============================================================
:: desinstalar_watchdog.bat
:: Elimina la tarea programada y detiene el watchdog.
:: Ejecutar como Administrador.
:: ============================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)

set TASK_NAME=WatchdogCajaRecorder

:: Detener la tarea
schtasks /End /TN "%TASK_NAME%" >nul 2>&1

:: Eliminar la tarea
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: Matar el proceso del agente si esta corriendo
taskkill /F /IM "CajaRecorderAgent.exe" >nul 2>&1
taskkill /F /IM "watchdog_cajas.py" >nul 2>&1

echo [OK] Watchdog desinstalado y agente detenido.
pause
