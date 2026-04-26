@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv312\Scripts\python.exe" (
  echo Ambiente Python nao encontrado em .venv312\Scripts\python.exe
  exit /b 1
)

".venv312\Scripts\python.exe" main.py
