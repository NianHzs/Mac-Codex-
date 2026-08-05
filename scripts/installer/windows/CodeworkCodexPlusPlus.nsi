Unicode true
!include "MUI2.nsh"

!ifndef VERSION
!define VERSION "1.3.16"
!endif
!define ROOT "..\..\.."

Var UpdateConfirmPath
Var UpdateRollbackPath
Var UpdateWaitCount

Name "♛Codework AI客户端"
!ifdef SMOKE_TEST
OutFile "${ROOT}\dist\windows\Codework-installer-smoke.exe"
!else
OutFile "${ROOT}\dist\windows\♛Codework AI客户端-${VERSION}-windows-x64-setup.exe"
!endif
InstallDir "$LOCALAPPDATA\Programs\Codework Codex++"
InstallDirRegKey HKCU "Software\CodeworkCodexPlusPlus" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"
!define MUI_FINISHPAGE_TEXT "安装完成。\r$\n\r$\n版权所有 © 2026 小帅\r$\nCopyright © 2026 Xiaoshuai. All Rights Reserved."

!define MUI_WELCOMEPAGE_TEXT "安装程序会自动关闭正在运行的 ♛Codework AI客户端，并覆盖升级到新版本。$\r$\n$\r$\n如出现“文件正在使用”的提示，请先退出客户端或右下角托盘中的 Codework，然后点击【重试】即可继续。"
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
!ifndef SMOKE_TEST
  nsExec::ExecToStack 'taskkill /IM codework-codex-plus-plus.exe /F /T'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /IM codework-codex-plus-plus-manager.exe /F'
  Pop $0
  Pop $1
  Sleep 1500
!endif

!ifndef SMOKE_TEST
  StrCpy $UpdateConfirmPath "$PROFILE\.codework-codex-plus-plus\update-start-confirmed.json"
  StrCpy $UpdateRollbackPath "$PROFILE\.codework-codex-plus-plus\update-rollback.json"
  CreateDirectory "$PROFILE\.codework-codex-plus-plus"
  Delete "$UpdateConfirmPath"
  Delete "$UpdateRollbackPath"
  Delete "$INSTDIR\codework-codex-plus-plus.exe.previous"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe.previous"

  IfFileExists "$INSTDIR\codework-codex-plus-plus.exe" 0 launcher_backup_finished
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\codework-codex-plus-plus.exe" "$INSTDIR\codework-codex-plus-plus.exe.previous"
  IfErrors backup_failed launcher_backup_finished
launcher_backup_finished:
  IfFileExists "$INSTDIR\codework-codex-plus-plus-manager.exe" 0 manager_backup_finished
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\codework-codex-plus-plus-manager.exe" "$INSTDIR\codework-codex-plus-plus-manager.exe.previous"
  IfErrors backup_failed manager_backup_finished
manager_backup_finished:
  Goto backup_finished
backup_failed:
  Delete "$INSTDIR\codework-codex-plus-plus.exe.previous"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe.previous"
  IfSilent silent_backup_failed interactive_backup_failed
silent_backup_failed:
  SetErrorLevel 33
  Quit
interactive_backup_failed:
  MessageBox MB_OK|MB_ICONSTOP "无法备份当前客户端文件，安装已停止，现有版本不会改变。"
  Abort
backup_finished:

  IfFileExists "$INSTDIR\codework-codex-plus-plus.exe" launcher_exists launcher_checked
launcher_exists:
  ClearErrors
  Delete "$INSTDIR\codework-codex-plus-plus.exe"
  IfErrors launcher_locked launcher_checked
launcher_locked:
  IfSilent silent_launcher_locked interactive_launcher_locked
silent_launcher_locked:
  SetErrorLevel 32
  Quit
interactive_launcher_locked:
  MessageBox MB_OK|MB_ICONEXCLAMATION "旧版 Codework 仍在运行，暂时无法升级。请先退出右下角托盘中的 Codework，再重新运行安装包。"
  Abort
launcher_checked:

  IfFileExists "$INSTDIR\codework-codex-plus-plus-manager.exe" manager_exists manager_checked
manager_exists:
  ClearErrors
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe"
  IfErrors manager_locked manager_checked
manager_locked:
  IfSilent silent_manager_locked interactive_manager_locked
silent_manager_locked:
  SetErrorLevel 32
  Quit
interactive_manager_locked:
  MessageBox MB_OK|MB_ICONEXCLAMATION "旧版管理工具仍在运行，暂时无法升级。请先退出 Codework 管理工具，再重新运行安装包。"
  Abort
manager_checked:
!endif
  SetOverwrite on

  File "${ROOT}\dist\windows\app\codework-codex-plus-plus.exe"
  File "${ROOT}\dist\windows\app\codework-codex-plus-plus-manager.exe"
  File "${ROOT}\THIRD_PARTY_NOTICES.txt"
  SetOutPath "$INSTDIR\dream-skin"
  File /r "${ROOT}\dist\windows\app\dream-skin\*.*"
  SetOutPath "$INSTDIR"

!ifdef SMOKE_TEST
  Goto install_finished
!endif

  Delete "$DESKTOP\Codework Codex++.lnk"
  Delete "$DESKTOP\Codework Codex++ 管理工具.lnk"
  Delete "$SMPROGRAMS\Codework Codex++\Codework Codex++.lnk"
  Delete "$SMPROGRAMS\Codework Codex++\Codework Codex++ 管理工具.lnk"
  Delete "$SMPROGRAMS\Codework Codex++\卸载 Codework Codex++.lnk"
  RMDir "$SMPROGRAMS\Codework Codex++"
  CreateShortcut "$DESKTOP\♛Codework AI客户端.lnk" "$INSTDIR\codework-codex-plus-plus.exe" "" "$INSTDIR\codework-codex-plus-plus.exe"
  CreateShortcut "$DESKTOP\♛Codework AI客户端 管理工具.lnk" "$INSTDIR\codework-codex-plus-plus-manager.exe" "" "$INSTDIR\codework-codex-plus-plus-manager.exe"
  CreateDirectory "$SMPROGRAMS\♛Codework AI客户端"
  CreateShortcut "$SMPROGRAMS\♛Codework AI客户端\♛Codework AI客户端.lnk" "$INSTDIR\codework-codex-plus-plus.exe" "" "$INSTDIR\codework-codex-plus-plus.exe"
  CreateShortcut "$SMPROGRAMS\♛Codework AI客户端\♛Codework AI客户端 管理工具.lnk" "$INSTDIR\codework-codex-plus-plus-manager.exe" "" "$INSTDIR\codework-codex-plus-plus-manager.exe"
  CreateShortcut "$SMPROGRAMS\♛Codework AI客户端\卸载 ♛Codework AI客户端.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\codework-codex-plus-plus-manager.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\CodeworkCodexPlusPlus" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "DisplayName" "♛Codework AI客户端"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "Publisher" "Codework"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "DisplayIcon" "$INSTDIR\codework-codex-plus-plus-manager.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus" "UninstallString" "$INSTDIR\uninstall.exe"

  WriteRegStr HKCU "Software\Classes\codeworkcodexplusplus" "" "URL:♛Codework AI客户端 Import Protocol"
  WriteRegStr HKCU "Software\Classes\codeworkcodexplusplus" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\codeworkcodexplusplus\shell\open\command" "" '$\"$INSTDIR\codework-codex-plus-plus-manager.exe$\" $\"%1$\"'

  IfSilent silent_update_finished normal_install_finished
silent_update_finished:
  StrCpy $UpdateWaitCount 0
  Exec '$\"$INSTDIR\codework-codex-plus-plus-manager.exe$\" --confirm-update $\"$UpdateConfirmPath$\"'
wait_for_update_confirmation:
  IfFileExists "$UpdateConfirmPath" update_confirmed 0
  Sleep 1000
  IntOp $UpdateWaitCount $UpdateWaitCount + 1
  IntCmp $UpdateWaitCount 20 rollback_update wait_for_update_confirmation rollback_update
update_confirmed:
  Delete "$INSTDIR\codework-codex-plus-plus.exe.previous"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe.previous"
  Goto install_finished
normal_install_finished:
  Delete "$INSTDIR\codework-codex-plus-plus.exe.previous"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe.previous"
  Goto install_finished
rollback_update:
  nsExec::ExecToStack 'taskkill /IM codework-codex-plus-plus-manager.exe /F'
  Pop $0
  Pop $1
  Sleep 500
  Delete "$INSTDIR\codework-codex-plus-plus.exe"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe"
  IfFileExists "$INSTDIR\codework-codex-plus-plus.exe.previous" 0 rollback_launcher_finished
  Rename "$INSTDIR\codework-codex-plus-plus.exe.previous" "$INSTDIR\codework-codex-plus-plus.exe"
rollback_launcher_finished:
  IfFileExists "$INSTDIR\codework-codex-plus-plus-manager.exe.previous" 0 rollback_manager_finished
  Rename "$INSTDIR\codework-codex-plus-plus-manager.exe.previous" "$INSTDIR\codework-codex-plus-plus-manager.exe"
rollback_manager_finished:
  FileOpen $0 "$UpdateRollbackPath" w
  FileWrite $0 "{$\"targetVersion$\":$\"${VERSION}$\",$\"reason$\":$\"manager_start_timeout$\"}$\r$\n"
  FileClose $0
  Exec '$\"$INSTDIR\codework-codex-plus-plus-manager.exe$\"'
  SetErrorLevel 1603
  Quit
install_finished:
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
  Delete "$DESKTOP\♛Codework AI客户端.lnk"
  Delete "$DESKTOP\♛Codework AI客户端 管理工具.lnk"
  Delete "$SMPROGRAMS\♛Codework AI客户端\♛Codework AI客户端.lnk"
  Delete "$SMPROGRAMS\♛Codework AI客户端\♛Codework AI客户端 管理工具.lnk"
  Delete "$SMPROGRAMS\♛Codework AI客户端\卸载 ♛Codework AI客户端.lnk"
  RMDir "$SMPROGRAMS\♛Codework AI客户端"

  Delete "$INSTDIR\codework-codex-plus-plus.exe"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe"
  Delete "$INSTDIR\codework-codex-plus-plus.exe.previous"
  Delete "$INSTDIR\codework-codex-plus-plus-manager.exe.previous"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.txt"
  RMDir /r "$INSTDIR\dream-skin"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Classes\codeworkcodexplusplus"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeworkCodexPlusPlus"
  DeleteRegKey HKCU "Software\CodeworkCodexPlusPlus"
SectionEnd
