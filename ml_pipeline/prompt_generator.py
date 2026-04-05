import json
import random
import os

def generate_prompts_for_layout(layout):
    """
    Given a parsed JSON house layout, generate 3-5 randomized natural language prompts
    that describe it, so the ML model learns to associate human intent with coordinates.
    """
    width = layout.get("width")
    depth = layout.get("depth")
    area = layout.get("area")
    
    # We will generate synthetic prompts based on the layout's size and properties
    prompts = []
    
    if width and depth:
        prompts.append(f"Create a {width}x{depth} room")
        prompts.append(f"Build a {int(area)} square meter house shell")
        prompts.append(f"Generate a rectangular floor plan {width} by {depth}")
        
    if width > 8 and depth > 6:
        prompts.append("Create a large family home layout")
    elif width < 5 and depth < 5:
        prompts.append("Build a small studio apartment")
        
    return prompts

def build_training_dataset(parsed_data_path, output_path="train.jsonl"):
    """
    Reads the normalized layouts, attaches varied textual prompts, 
    and saves them in JSONL format for LoRA/LLM Fine-tuning.
    """
    
    if not os.path.exists(parsed_data_path):
        print(f"Error: Could not find normalized data at {parsed_data_path}")
        return
        
    print(f"Loading parsed architectural layouts from {parsed_data_path}...")
    with open(parsed_data_path, "r") as f:
        layouts = json.load(f)
        
    train_pairs = []
    
    for layout in layouts:
        prompts = generate_prompts_for_layout(layout)
        
        # The ML completion is exactly what Archai needs in its useEditorStore
        completion_json = json.dumps(layout.get("walls", []))
        
        for prompt in prompts:
            # HuggingFace / OpenAI format
            train_pairs.append({
                "prompt": prompt,
                "completion": completion_json
            })
            
    # Shuffle the dataset to ensure a good distribution of training batches
    random.shuffle(train_pairs)
    
    # Write Out to JSONL
    print(f"Writing {len(train_pairs)} training pairs to {output_path}...")
    with open(output_path, "w") as f:
        for pair in train_pairs:
            f.write(json.dumps(pair) + "\n")
            
    print("Done! You are now ready to fine-tune your ML model on this dataset.")

if __name__ == "__main__":
    build_training_dataset(
        parsed_data_path="parsed_data/archai_normalized_layouts.json",
        output_path="train.jsonl"
    )
