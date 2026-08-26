# Vocabulary

Typed facts contain **1 through 256** unique material-need rows. Each row has requirement,
available quantity, net open purchase quantity, receipt progress, PO state, date facts, and unit.
Quantities are non-negative safe integers in the stated unit; unit conversion and fractional
quantities remain `UNKNOWN/HOLD`.

`open_purchase_quantity` is the binding-supplied net not-yet-received quantity for the same
material need in the same snapshot. It is never calculated as ordered minus received. A non-null
value requires an exact proof reference in the Project Binding; otherwise admission fails closed.

`available_quantity` is the only currently available inventory input. `received_quantity` is
receipt progress and is never added to inventory coverage.
