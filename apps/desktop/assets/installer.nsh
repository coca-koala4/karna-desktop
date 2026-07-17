!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"
!include "FileFunc.nsh"

; electron-builder compiles the same include once while generating the
; uninstaller. Installer-only custom-page callbacks are intentionally unused in
; that pass; the installer/uninstaller dual pass also intentionally triggers
; 6001 (variables used by only one pass) and 6020 (the uninstaller probe does
; not write its final payload). Keep every unrelated warning fatal.
!pragma warning disable 6010
!pragma warning disable 6001
!pragma warning disable 6020

Var KarnaOptionsDialog
Var KarnaWorkspaceField
Var KarnaWorkspaceBrowse
Var KarnaAutostartCheckbox
Var KarnaDesktopShortcutCheckbox
Var KarnaWorkspace
Var KarnaAutostart
Var KarnaDesktopShortcut
Var KarnaIsUpdate
Var KarnaUninstallDialog
Var KarnaRemovePluginsCheckbox
Var KarnaRemoveUserDataCheckbox
Var KarnaRemovePlugins
Var KarnaRemoveUserData

!macro customInit
  StrCpy $KarnaWorkspace "$DOCUMENTS\Karna"
  StrCpy $KarnaAutostart ${BST_UNCHECKED}
  StrCpy $KarnaDesktopShortcut ${BST_CHECKED}
  StrCpy $KarnaIsUpdate ""
  ${GetOptions} "$CMDLINE" "--updated" $KarnaIsUpdate
  ${If} $KarnaIsUpdate == ""
    ${GetOptions} "$CMDLINE" "/updated" $KarnaIsUpdate
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom KarnaOptionsPage KarnaOptionsLeave
!macroend

Function KarnaOptionsPage
  ${If} $KarnaIsUpdate != ""
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $KarnaOptionsDialog
  ${If} $KarnaOptionsDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 18u "设置 Karna 默认工作空间和启动选项"
  Pop $0
  ${NSD_CreateLabel} 0 26u 100% 12u "默认工作空间"
  Pop $0

  ${NSD_CreateDirRequest} 0 42u 76% 13u "$KarnaWorkspace"
  Pop $KarnaWorkspaceField
  ${NSD_CreateBrowseButton} 79% 42u 21% 13u "浏览..."
  Pop $KarnaWorkspaceBrowse
  ${NSD_OnClick} $KarnaWorkspaceBrowse KarnaBrowseWorkspace

  ${NSD_CreateCheckbox} 0 70u 100% 12u "开机自启动（启动后最小化到系统托盘）"
  Pop $KarnaAutostartCheckbox
  ${NSD_Uncheck} $KarnaAutostartCheckbox

  ${NSD_CreateCheckbox} 0 92u 100% 12u "创建桌面快捷方式"
  Pop $KarnaDesktopShortcutCheckbox
  ${NSD_Check} $KarnaDesktopShortcutCheckbox

  ${NSD_CreateLabel} 0 120u 100% 30u "这些选项以后可在 Karna 设置中修改；应用安装位置需通过重新安装修改。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function KarnaBrowseWorkspace
  ${NSD_GetText} $KarnaWorkspaceField $KarnaWorkspace
  nsDialogs::SelectFolderDialog "选择 Karna 默认工作空间" "$KarnaWorkspace"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $KarnaWorkspaceField "$0"
  ${EndIf}
FunctionEnd

Function KarnaOptionsLeave
  ${NSD_GetText} $KarnaWorkspaceField $KarnaWorkspace
  ${NSD_GetState} $KarnaAutostartCheckbox $KarnaAutostart
  ${NSD_GetState} $KarnaDesktopShortcutCheckbox $KarnaDesktopShortcut
  ${If} $KarnaWorkspace == ""
    MessageBox MB_ICONEXCLAMATION "请选择 Karna 默认工作空间。"
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $KarnaIsUpdate == ""
    CreateDirectory "$APPDATA\Karna"
    CreateDirectory "$KarnaWorkspace"
    ; The managed Python/Node runtime follows the selected install directory.
    ; Grant only the installing user modify access so a per-user Karna process
    ; can update dependencies without falling back to %LOCALAPPDATA% (C:).
    CreateDirectory "$INSTDIR\runtime"
    ReadEnvStr $8 "USERNAME"
    nsExec::ExecToLog 'icacls "$INSTDIR\runtime" /grant "$8:(OI)(CI)M" /T /C'

    ${WordReplace} "$KarnaWorkspace" "\" "/" "+" $0
    FileOpen $1 "$APPDATA\Karna\installer-options.json" w
    FileWrite $1 '{$\r$\n'
    FileWrite $1 '  $\"schemaVersion$\": 1,$\r$\n'
    FileWrite $1 '  $\"workspace$\": $\"$0$\",$\r$\n'
    FileWrite $1 '  $\"autostart$\": $KarnaAutostart,$\r$\n'
    FileWrite $1 '  $\"desktopShortcut$\": $KarnaDesktopShortcut$\r$\n'
    FileWrite $1 '}$\r$\n'
    FileClose $1

    ${If} $KarnaDesktopShortcut == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\Karna.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${Else}
      Delete "$DESKTOP\Karna.lnk"
    ${EndIf}
  ${EndIf}
!macroend

; electron-builder inserts this page after the uninstall progress page. The
; application files are already removed at that point; the page only controls
; optional cleanup of user-owned data and plugin folders.
!macro customUninstallPage
  UninstPage custom un.KarnaUninstallOptionsPage un.KarnaUninstallOptionsLeave
!macroend

Function un.KarnaUninstallOptionsPage
  nsDialogs::Create 1018
  Pop $KarnaUninstallDialog
  ${If} $KarnaUninstallDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Karna 卸载选项"
  Pop $0
  ${NSD_CreateCheckbox} 0 32u 100% 14u "同时卸载相关插件"
  Pop $KarnaRemovePluginsCheckbox
  ${NSD_Uncheck} $KarnaRemovePluginsCheckbox
  ${NSD_CreateCheckbox} 0 56u 100% 14u "卸载 Karna 用户数据（聊天、配置、缓存）"
  Pop $KarnaRemoveUserDataCheckbox
  ${NSD_Uncheck} $KarnaRemoveUserDataCheckbox
  ${NSD_CreateLabel} 0 86u 100% 34u "默认不删除用户数据和工作空间。选择用户数据后将无法恢复，请先备份。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function un.KarnaUninstallOptionsLeave
  ${NSD_GetState} $KarnaRemovePluginsCheckbox $KarnaRemovePlugins
  ${NSD_GetState} $KarnaRemoveUserDataCheckbox $KarnaRemoveUserData

  ${If} $KarnaRemovePlugins == ${BST_CHECKED}
    RMDir /r "$APPDATA\Karna\plugins"
    RMDir /r "$APPDATA\Karna\karna-data\plugins"
    RMDir /r "$LOCALAPPDATA\Karna\plugins"
  ${EndIf}

  ${If} $KarnaRemoveUserData == ${BST_CHECKED}
    RMDir /r "$APPDATA\Karna"
    RMDir /r "$LOCALAPPDATA\Karna"
  ${EndIf}
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $9 "$INSTDIR\.karna-write-test" w
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "所选安装目录不可写。Karna 不会回退到 C 盘，请返回并选择一个当前用户可写的目录。"
    Abort
  ${EndIf}
  FileWrite $9 "Karna"
  FileClose $9
  Delete "$INSTDIR\.karna-write-test"
FunctionEnd
