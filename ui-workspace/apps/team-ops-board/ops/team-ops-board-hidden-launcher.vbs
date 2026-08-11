Option Explicit

Dim arguments, shell, nodePath, modulePath, mode, command, exitCode
Set arguments = WScript.Arguments

If arguments.Count <> 3 Then
  WScript.Quit 64
End If

nodePath = arguments.Item(0)
modulePath = arguments.Item(1)
mode = arguments.Item(2)

If mode <> "__scheduled_worker" Then
  WScript.Quit 64
End If

Function QuoteArgument(value)
  QuoteArgument = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

command = QuoteArgument(nodePath) & " " & QuoteArgument(modulePath) & " " & mode
Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
