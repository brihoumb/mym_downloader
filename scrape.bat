@ECHO off
wsl.exe ./scrape_mym.js -l
echo.
:DoItAgain

set /p "profile=Profile: "
set /p "page=Page? "

IF [%profile%] == [] GOTO Error
IF [%page%] == [] GOTO NoPage
GOTO Paged

:Error
@ECHO "Missing profile!"
GOTO End

:NoPage
wsl.exe ./scrape_mym.js %profile%
GOTO End

:Paged
wsl.exe ./scrape_mym.js %profile% %page%

:End
set /p "again=Again?[Y/N]"
IF "%again%" == "Y" GOTO DoItAgain
IF "%again%" == "y" GOTO DoItAgain
pause