# DrasChem NaCN Production Facility — Action Registry

Live action & request tracking register shared between:

| Role | Party |
|---|---|
| Client | DrasChem |
| Process Engineer | EPC-E |
| Detailed Design Engineer | COSMOS-E |

Two registers: **DrasChem – EPC-E – COSMOS-E** and **DrasChem – COSMOS-E**.

- Anyone with the link can view the registry and download CSV.
- Team members add, edit and delete actions in the portal after **Unlock editing** with the team passcode. Each change records who made it and when.
- Data is stored in a Google Sheet (one tab per register) through a Google Apps Script web app owned by the registry administrator.
- `config.js` holds the Google Sheet ID and the web app URL.
