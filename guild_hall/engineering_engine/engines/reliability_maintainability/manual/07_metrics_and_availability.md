# Failure/repair metrics and availability

E06 does not ingest or calculate numeric metric values. Instead it requires exact references to
the metric definition, data set, cutoff, time basis, and calculation/model. That protects against
mixing MTBF, MTTF, MTTR, MDT, repair duration, or incompatible time windows as if they were one
number.

Availability requires an explicit `Ai` or `Ao` classification fact. The source distinguishes
inherent availability’s design/repair inputs from operational availability’s broader logistics,
waiting, administrative, preventive-maintenance, and spare/support inputs. The engine therefore
does not choose a formula, normalize units, or manufacture a target. Missing classification,
basis, result/model, or project requirement remains a gap.
