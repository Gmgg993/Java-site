@echo off
chcp 65001 >nul
cd /d "%~dp0"
where javac >nul 2>nul
if errorlevel 1 (
  if defined JAVA_HOME if exist "%JAVA_HOME%\bin\javac.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"
)
where javac >nul 2>nul
if errorlevel 1 (
  echo [ERROR] javac not found. Install JDK 11+ and add it to PATH.
  pause
  exit /b 1
)
if not exist out mkdir out
javac -encoding UTF-8 -d out src\*.java
if errorlevel 1 (
  echo [ERROR] Compilation failed.
  pause
  exit /b 1
)
echo Starting TechParts... Close this window to stop the site.
java -Dfile.encoding=UTF-8 -cp out Main
pause
