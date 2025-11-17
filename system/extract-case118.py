# extract_case118.py
import json
from pypower import case118

ppc = case118.case118()

# Define separate data files
data = {
    'buses': ppc['bus'].tolist(),
    'generators': ppc['gen'].tolist(),
    'branches': ppc['branch'].tolist(),
    'gencosts': ppc['gencost'].tolist(),
    'baseMVA': ppc['baseMVA']
}

# Save to JSON
with open('case118_data.json', 'w') as f:
    json.dump(data, f, indent=2)