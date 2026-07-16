!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"
!include "FileFunc.nsh"

Var KarnaOptionsDialog
Var KarnaWorkspaceField
Var KarnaWorkspaceBrowse
Var KarnaAutostartCheckbox
Var KarnaDesktopShortcutCheckbox
Var KarnaWorkspace
Var KarnaAutostart
Var KarnaDesktopShortcut
Var KarnaIsUpdate

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
