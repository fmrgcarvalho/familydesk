@echo off
rem Arranca o servidor do FamilyDesk e volta a arrancá-lo se parar (usado pela tarefa agendada "FamilyDesk").
cd /d "%~dp0"
:ciclo
node server.js
timeout /t 5 /nobreak >nul
goto ciclo
