@echo off
:: ============================================================
:: instalar_watchdog.bat
:: Instala el watchdog de CajaRecorderAgent como tarea del
:: sistema. Debe ejecutarse UNA SOLA VEZ como Administrador.
:: ============================================================

echo =====================================================
echo   Instalador Watchdog - Sistema de Grabacion Cajas
echo =====================================================
echo.

:: Verificar que se ejecuta como Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script debe ejecutarse como Administrador.
    echo Haz clic derecho sobre el .bat y selecciona "Ejecutar como administrador".
    pause
    exit /b 1
)

:: ── Rutas ─────────────────────────────────────────────────────
set INSTALL_DIR=C:\CajaRecorder
set EXE=%INSTALL_DIR%\CajaRecorderAgent.exe
set WATCHDOG=%INSTALL_DIR%\watchdog_cajas.py
set PYTHONW=pythonw.exe
set TASK_NAME=WatchdogCajaRecorder
:: ─────────────────────────────────────────────────────────────

:: 1. Crear carpeta de instalacion si no existe
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    echo [OK] Carpeta creada: %INSTALL_DIR%
)

:: 2. Copiar archivos a la carpeta de instalacion
echo [INFO] Copiando archivos...
copy /Y "%~dp0..\CajaRecorderAgent\publish\CajaRecorderAgent.exe" "%EXE%" >nul 2>&1
copy /Y "%~dp0watchdog_cajas.py" "%WATCHDOG%" >nul 2>&1

if not exist "%EXE%" (
    echo [ERROR] No se encontro CajaRecorderAgent.exe en la carpeta publish.
    echo Asegurate de haber compilado el proyecto primero.
    pause
    exit /b 1
)

echo [OK] Archivos copiados correctamente.

:: 3. Verificar que Python esta instalado
where python >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo Descargalo desde: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] Python encontrado.

:: 4. Eliminar tarea anterior si existe (para reinstalacion limpia)
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: 5. Registrar como Tarea Programada
::    - Corre bajo la sesión interactiva del cajero logueado (acceso a GUI, mic y AppData)
::    - Se inicia al iniciar sesión
schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "pythonw.exe \"%WATCHDOG%\"" ^
  /SC ONLOGON ^
  /RU INTERACTIVE ^
  /RL HIGHEST ^
  /F >nul

if %errorLevel% neq 0 (
    echo [ERROR] No se pudo crear la tarea programada.
    pause
    exit /b 1
)

echo [OK] Tarea programada creada: %TASK_NAME%

:: 6. Arrancar la tarea ahora mismo sin esperar reinicio
schtasks /Run /TN "%TASK_NAME%" >nul 2>&1
echo [OK] Watchdog iniciado.

echo.
echo =====================================================
echo   Instalacion completada exitosamente.
echo   El agente de grabacion iniciara automaticamente
echo   con Windows y se reiniciara si es cerrado.
echo =====================================================
echo.
pause
