# Data Visualization Project 

## “POWER GRID SYSTEM”

*Two interactive interfaces for monitoring and problem-solving in the power grid.*

**Author: William O’Grady**,   
**Supervisor: Rémy Rey**,  
**KTH, Stockholm, Sweden**

---

## 🖥️ Overview

This project is an interactive system for visualizing and manipulating the IEEE-118 power grid. It showcases two interfaces:

* **List View** — a structured, card-based interface which shows exact numbers. Has an interactive map element, but is not the focus.
* **Map View** — a geographic-based visualization which extends the map element to be the only way to control the grid. 

The system is used for **scenario-based experiments**, allowing users  to solve grid-control tasks while the system evaluates safety, efficiency, and performance metrics through a gameified scoring system.

---

## 🚀 Features

### Core Functionality

* Interactive manipulation of generator output
* Steady-state power-flow calculation using PyPower
* Line load visualization & overload detection
* Cost- and emissions budget trade-offs
* Slack-bus aware simulation engine
* Scenario-based game with time- and score-evaluated grid challenges

### Interfaces

* **Map View:**

  * Interactive map element
  * Interactive overview bar with filters

* **List View:**

  * Vertical generator cards with numerical stats
  * Sortable lists divided by on/off status
  * Overview bar with system state
  * Interactive map element

### Scenario System

  * Scenarios are modular JSON-based files that are used as "levels" in the power grid game.
  * These can be configured in a sequence, allowing for different sets of levels. 
  * Scenarios dictate the requirements of the player:
    * Target demand (MW),
    * Budgets (cost and CO2) sensitivity of certain lines, slack generators, locked and disabled generators.

---

## 📂 Project Structure

```
/system/
    app.py
    grid.py
    scenarios.py
    full_nodes.json
    full_lines.json
    generator_info.py

  /sequences/
    P1.json
    P2.json
    ...
    P8.json

  /scenarios/
    A_final.json
    ...
    E_final.json

/static/
  /js/
    results.js
    testRunner.js
  /css/
    listView-coreB.css
    mapView-coreB.css

/templates/
  mapView-prototypeB.html
  listView-prototypeB.html
  start.html
  results.html
  testRunner.html
  tutorial_slides_unified.html

```

---

📚 Credits / References

D3.js https://d3js.org/

PyPower Case118 Documentation https://rwl.github.io/PYPOWER/api/pypower.case118-module.html
