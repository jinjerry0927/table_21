@echo off
setlocal
chcp 65001 >nul
title TABLE 21 로컬 게임 서버

where node >nul 2>nul
if errorlevel 1 (
  echo [TABLE 21] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 Node.js LTS를 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [TABLE 21] npm을 찾을 수 없습니다. Node.js LTS를 다시 설치해 주세요.
  pause
  exit /b 1
)

cd /d "%~dp0"
if not exist package.json (
  echo [TABLE 21] package.json을 찾을 수 없습니다. 프로젝트 폴더에서 실행해 주세요.
  pause
  exit /b 1
)

if /I "%~1"=="--check" (
  echo [TABLE 21] Node.js, npm, 프로젝트 경로 확인 완료.
  exit /b 0
)

if not exist node_modules (
  echo [TABLE 21] 최초 실행에 필요한 패키지를 설치합니다. 인터넷 연결이 필요합니다.
  call npm install
  if errorlevel 1 (
    echo [TABLE 21] 패키지 설치에 실패했습니다. 위 오류를 확인해 주세요.
    pause
    exit /b 1
  )
)

echo [TABLE 21] http://127.0.0.1:5173 에서 게임을 시작합니다.
echo 이 창을 닫으면 로컬 게임 서버가 종료됩니다.
call npm run dev -- --open
if errorlevel 1 (
  echo [TABLE 21] 서버를 시작하지 못했습니다. 5173 포트가 사용 중인지 확인해 주세요.
  pause
  exit /b 1
)
