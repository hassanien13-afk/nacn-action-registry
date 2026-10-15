# DrasChem NaCN Production Facility — Action Registry

Live action & request tracking register shared between:

| Role | Party |
|---|---|
| Client | DrasChem |
| Process Engineer | EPC-E |
| Detailed Design Engineer | COSMOS-E |

Two registers: **DrasChem – EPC-E – COSMOS-E** and **DrasChem – COSMOS-E**.

- The portal reads the registry live from a Google Sheet (two tabs, one per register) and refreshes every 30 seconds.
- Add and edit actions in the Google Sheet (**Add / edit in Google Sheet** button). Keep the column order: No. | Request / Action | Date Issued | From | To | Responsible | Due Date | Status | Remarks.
- Anyone with the link can view and download CSV.
- The Google Sheet ID is set in `config.js`.
