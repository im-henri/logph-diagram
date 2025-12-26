This app is GitHub Pages–friendly (static hosting).

Run locally (any static server):
  python -m http.server 5173
  Open: http://localhost:5173/

For "CoolProp-like" accuracy without a backend:
  1) Generate property tables offline (once):
       python tools\\generateTablesCoolProp.py
  2) Commit the generated JSON files under:
       assets\\tables\\*.json

At runtime the frontend loads those static tables and never needs Python/servers.
