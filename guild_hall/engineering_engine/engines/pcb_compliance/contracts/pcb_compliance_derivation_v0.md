# PCB Compliance Direct Derivation Record v0

This record is a compact source-to-rule crosswalk for `pcb_compliance`. It is not a source body,
standards interpretation guide, applicability decision, or production acceptance record.

| Rule | Directness | Evidence question only | Held boundary |
| --- | --- | --- | --- |
| `PCB-NASA-FAB-01` | Direct public NASA source, bounded locator | Are the named documentation/instruction references observed? | Whether they are adequate for a real build is not evaluated. |
| `PCB-NASA-INSPECT-01` | Direct public NASA source, bounded locator | Is inspection evidence observed after a lawful criteria binding is available? | Protected IPC or other criteria bodies are not evaluated. |
| `PCB-NASA-PROTECT-01` | Direct public NASA source, bounded locator | Is a protection/handling evidence reference observed? | Actual environmental/process performance is not evaluated. |
| `PCB-NASA-TOOL-01` | Direct public NASA source, bounded locator | Is a tool-control evidence reference observed? | Interval, uncertainty, and suitability semantics belong to `calibration_measurement_validity`. |
| `PCB-NASA-TRACE-01` | Direct public NASA source, bounded locator | Are build/nonconformance traceability refs observed or in conflict? | No rework/repair/MRB decision is made. |
| `PCB-STD-APPLICABILITY-01` | Public IPC revision metadata only | Is a lawful, project-approved controlled-standard binding present? | All standard body criteria and compliance remain `UNKNOWN/HOLD`. |

RAG is a discovery aid only. It is not accepted as source truth or a verdict input.
