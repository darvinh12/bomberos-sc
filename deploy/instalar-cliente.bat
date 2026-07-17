@echo off
rem ============================================================
rem  Instalador de acceso al SIGP - Bomberos Caracas
rem
rem  Ejecutar UNA vez en cada PC cliente, como Administrador
rem  (clic derecho, "Ejecutar como administrador").
rem
rem  Hace dos cosas:
rem    1. Registra el nombre sigp.bomberos apuntando al servidor
rem       en el archivo hosts de Windows.
rem    2. Crea el acceso directo "SIGP Bomberos" en el escritorio.
rem
rem  Antes de distribuirlo, editar la IP del servidor aqui abajo.
rem ============================================================

set SERVIDOR_IP=192.168.1.100
set NOMBRE=sigp.bomberos
set URL=http://%NOMBRE%

rem --- Verificar permisos de administrador ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Este script debe ejecutarse como Administrador.
    echo  Clic derecho sobre el archivo y elegir "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

set HOSTS=%SystemRoot%\System32\drivers\etc\hosts

rem --- 1. Entrada en hosts (solo si no existe ya) ---
findstr /c:"%NOMBRE%" "%HOSTS%" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] El nombre %NOMBRE% ya estaba registrado.
) else (
    echo %SERVIDOR_IP%    %NOMBRE%>> "%HOSTS%"
    echo  [OK] Registrado %NOMBRE% -^> %SERVIDOR_IP%
)

rem --- 2. Acceso directo en el escritorio (para todos los usuarios) ---
set SHORTCUT=%PUBLIC%\Desktop\SIGP Bomberos.url
(
    echo [InternetShortcut]
    echo URL=%URL%
    echo IconFile=%%SystemRoot%%\System32\SHELL32.dll
    echo IconIndex=13
) > "%SHORTCUT%"
echo  [OK] Acceso directo "SIGP Bomberos" creado en el escritorio.

rem --- 3. Limpiar cache DNS para que el nombre funcione ya ---
ipconfig /flushdns >nul

echo.
echo  Instalacion completa. Abrir "SIGP Bomberos" desde el escritorio
echo  o entrar a %URL% en el navegador.
echo.
pause
