# dvproject
Masters' Thesis Project

## Structure

power-grid-visualization/
│
├── index.html                 # Main entry point
│
├── css/
│   └── style.css              # All styling (shared across views)
│
├── data/
│   ├── grid-topology.json     # Main topology (buses, lines)
│   └── generator-info.json    # Cost, emissions, etc. (optional split)
│
├── js/
│   ├── main.js                # App setup, view switching, shared utils
│   ├── mapview.js             # D3 drawing code for the map view
│   ├── listview.js            # D3 code or DOM rendering for list view
│   ├── simulation.js          # Logic for generator dispatch & line loading
│   └── utils.js               # Small reusable helper functions
│
├── assets/
│   └── map.svg                # Background map image if any (for Map View)
│
└── README.md                  # Project overview (if shared or public)
