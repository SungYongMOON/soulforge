Option Explicit

' Runs one command with no console window and returns its exit code. The
' scheduled task invokes wscript with this script, the executable and the
' arguments, so nothing about the lane is written here: every value comes from
' the registered action line.

Dim arguments, shell, command, index, exitCode
Set arguments = WScript.Arguments

If arguments.Count < 2 Then
  WScript.Quit 64
End If

Function QuoteArgument(value)
  QuoteArgument = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

command = QuoteArgument(arguments.Item(0))
For index = 1 To arguments.Count - 1
  command = command & " " & QuoteArgument(arguments.Item(index))
Next

Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
