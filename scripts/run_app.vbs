Option Explicit

Dim shell, files, root, powershell, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Chr(34) & powershell & Chr(34) & _
    " -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & _
    Chr(34) & root & "\run_app.ps1" & Chr(34)
shell.Run command, 0, False
