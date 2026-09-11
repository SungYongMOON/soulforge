Option Explicit

Dim arguments, shell, command, index, exitCode
Set arguments = WScript.Arguments
If arguments.Count < 2 Then WScript.Quit 64

Function QuoteArgument(value)
  Dim text, position, trailing
  text = CStr(value)
  ' Match the registrar: embedded quotes are not accepted in task arguments.
  If InStr(text, Chr(34)) > 0 Then WScript.Quit 64
  ' Windows argv parsing requires doubling backslashes before a closing quote.
  trailing = ""
  position = Len(text)
  Do While position > 0
    If Mid(text, position, 1) <> "\" Then Exit Do
    trailing = trailing & "\"
    position = position - 1
  Loop
  QuoteArgument = Chr(34) & text & trailing & Chr(34)
End Function

command = QuoteArgument(arguments.Item(0))
For index = 1 To arguments.Count - 1
  command = command & " " & QuoteArgument(arguments.Item(index))
Next
Set shell = CreateObject("WScript.Shell")
' Wait preserves the scheduled-task lifetime and forwards failure for restart.
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
