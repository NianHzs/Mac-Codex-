Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "1.2.34"
!endif
!define ROOT "..\..\.."

Name "Codework Codex++"
OutFile "${ROOT}\dist\windows\Codework-CodexPlusPlus-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Codework Codex++"
InstallDirRegKey HKCU "Software\CodeworkCodexPlusPlus" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"

  nsExec::ExecToLog 'taskkill /IM codework-codex-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codework-codex-plus-plus-manager.exe /F'
  Pop $0

  File "${ROOT}\dist\windows\app\codework-codex-plus-plus.exe"
  File "${ROOT}\dist\windows\app\codework-codex-plus-plus-manager.exe"
  File "${ROOT}\THIRD_PARTY_NOTICES.txt"

  CreateShortcut "$DESKTOP\Codework Codex++.lnk" "$INSTDIR\codework-codex-plus-plus.exe" "" "$INSTDIR\codework-codex-plus-plus.exe"
  CreateShortcut "$DESKTOP\Codework Codex++ 管理工具.lnk" "$INSTDIR\codework-codex-plus-plus-manager.exe" "" "$INSTDIR\codework-codex-plus-plus-manager.exe"
  CreateDirectory "$SMPROGRAMS\Codework Codex++"
  CreateShortcut "$SMPROGRAMS\Codework Codex++\Codework Codex++.lnk" "$INSTDIR\codework-codex-plus-plus.exe" "" "$INSTDIR\codework-codex-plus-plus.exe"
  CreateShortcut "$SMPROGRAMS\Codework Codex++\Codework Codex++ 管理工具.lnk" "$INSTDIR\codework-codex-plus-plus-manager.exe" "" "$INSTDIR\codework-codex-plus-plus-manager.exe"
  CreateShortcut "$SMPROGRAMS\Codework Codex++\卸载 Codework Codex++.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\codework-codex-plus-plus-manager.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\CodeworkCodexPlusPlus" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "DisplayName" "Codework Codex++"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "Publisher" "Codework"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "DisplayIcon" "$INSTDIR\codework-codex-plus-plus-manager.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "UninstallString" "$INSTDIR\uninstall.exe"

  WriteRegStr HKCU "Software\Classes\codeworkcodexplusplus" "" "URL:Codework Codex++ Import Protocol"
  WriteRegStr HKCU "Software\Classes\codeworkcodexplusplus" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\codeworkcodexplusplus\shell\open\command" "" '$\"$INSTDIR\codework-codex-plus-plus-manager.exe$\" $\"%1$\"'
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /IM codework-codex-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codework-codex-plus-plus-manager.exe /F'
  Pop $0

  Delete "$DESKTOP\Codework Codex++.lnk"
  Delete "$DESKTOP\Codework Codex++ 管理工具.lnk"
  Delete "$SMPROGRAMS\Codework Codex++\Codework Codex++.lnk"
  Delete "$SMPROGRAMS\Codework Codex++\Codework Codex++ 管理工具.lnk"
  Delete "$SMPROGRAMS\Codework Codex++\卸载 Codework Codex++.lnk"
  RMDir "$SMPROGRAMS\Codework Codex++"

  Delete "$INSTDIR\codework-codex-plus-plus.exe"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Classes\codeworkcodexplusplus"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus"
  DeleteRegKey HKCU "Software\CodeworkCodexPlusPlus"
SectionEnd
