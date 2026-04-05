import json
import random
import os
import uuid

def parse_rplan_dataset(rplan_json_path, output_dir="parsed_data"):
    """
    Dummy parser that converts RPLAN or similar architectural datasets
    into Archai's JSON wall format:
    [{ "type": "wall", "id": "uuid", "start": [x, z], "end": [x, z], "thickness": 0.2, "height": 3.0 }]
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # In a real scenario, this loads the RPLAN boundaries and graph data
    # with open(rplan_json_path, 'r') as f:
    #     raw_data = json.load(f)
    print(f"Loading raw dataset from {rplan_json_path}...")
    
    # Simulate extraction of a house with 4 walls
    houses = []
    
    for i in range(5000): # Simulating parsing 5000 houses
        # Randomize a basic house shape for the dummy data
        width = random.randint(4, 12)
        depth = random.randint(4, 10)
        
        house_layout = [
            {"type": "wall", "start": [0, 0], "end": [width, 0]},
            {"type": "wall", "start": [width, 0], "end": [width, depth]},
            {"type": "wall", "start": [width, depth], "end": [0, depth]},
            {"type": "wall", "start": [0, depth], "end": [0, 0]}
        ]
        
        # In reality, this loop would map the exact Vector points from the dataset
        
        house_metadata = {
            "id": str(uuid.uuid4()),
            "width": width,
            "depth": depth,
            "area": width * depth,
            "walls": house_layout
        }
        houses.append(house_metadata)

    output_path = os.path.join(output_dir, "archai_normalized_layouts.json")
    with open(output_path, "w") as f:
        json.dump(houses, f, indent=2)
    
    print(f"Successfully normalized and saved {len(houses)} layouts to {output_path}")

if __name__ == "__main__":
    parse_rplan_dataset("path/to/raw/rplan.json")
