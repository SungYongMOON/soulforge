Option Explicit

Dim arguments, shell, command, index, exitCode
Set arguments = WScript.Arguments

If arguments.Count < 2 Then
  WScript.Quit 64
End If

Function QuoteArgument(value)
  ' A run of one or more backslashes immediately before the closing quote is
  ' interpreted by the CreateProcess argv parser as escaping that quote (e.g.
  ' an argument that is nothing but a drive letter and a trailing separator
  ' must have that trailing separator doubled so it re-parses back to the
  ' exact original value). Embedded double quotes never reach this
  ' launcher: every upstream argument is built by
  ' ops/register-codex-retention-refresh-task.ps1, which already rejects any
  ' value containing one.
  Dim text, trailingBackslashes
  text = CStr(value)
  trailingBackslashes = 0
  Do While trailingBackslashes < Len(text) And Mid(text, Len(text) - trailingBackslashes, 1) = "\"
    trailingBackslashes = trailingBackslashes + 1
  Loop
  If trailingBackslashes > 0 Then
    text = Left(text, Len(text) - trailingBackslashes) & String(trailingBackslashes * 2, "\")
  End If
  QuoteArgument = Chr(34) & text & Chr(34)
End Function

command = QuoteArgument(arguments.Item(0))
For index = 1 To arguments.Count - 1
  command = command & " " & QuoteArgument(arguments.Item(index))
Next

Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
