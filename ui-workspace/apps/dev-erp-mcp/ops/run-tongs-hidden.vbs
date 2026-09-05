Option Explicit

' Generic hidden argv-forwarding launcher, the same shape as
' guild_hall/linear_history/ops/run-linear-collect-hidden.vbs and
' guild_hall/buzz_history/ops/run-buzz-collect-hidden.vbs: it does not know it
' is running Tongs(MCP 문). It quotes every argument it was given and hands
' the whole command line to a hidden WScript.Shell.Run, which is what lets a
' Scheduled Task action stay windowless. All lane-specific decisions
' (preflight, heartbeat, which service(s) to start) live in
' run-tongs-loopback.ps1, not here.

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
