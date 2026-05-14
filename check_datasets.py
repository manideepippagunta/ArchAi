import os, json, datetime

files = [
    ('train.jsonl', 'root/train.jsonl'),
    ('model_data.json', 'model_data.json'),
    ('model_data_fixed.json', 'model_data_fixed.json'),
    ('ml_pipeline/processed/training_pairs.jsonl', 'training_pairs.jsonl'),
    ('ml_pipeline/processed/cubicasa_schema.jsonl', 'cubicasa_schema.jsonl'),
    ('ml_pipeline/processed/houseexpo_schema.jsonl', 'houseexpo_schema.jsonl'),
    ('custom_train.jsonl', 'custom_train.jsonl'),
]
for fpath, label in files:
    if os.path.exists(fpath):
        stat = os.stat(fpath)
        mtime = datetime.datetime.fromtimestamp(stat.st_mtime)
        size_mb = round(stat.st_size / (1024*1024), 2)
        print(label + ': size=' + str(size_mb) + 'MB, modified=' + mtime.strftime('%Y-%m-%d %H:%M'))
    else:
        print(label + ': NOT FOUND')

# Check what train.jsonl looks like
print()
print('=== train.jsonl (first entry) ===')
with open('train.jsonl', 'r', encoding='utf-8', errors='replace') as f:
    first = f.readline()
import json
d = json.loads(first)
print('prompt:', d.get('prompt',''))
print('completion (first 150):', str(d.get('completion',''))[:150])

# Check model_data.json structure
print()
print('=== model_data.json (first 200 chars) ===')
with open('model_data.json', 'r') as f:
    print(f.read(200))
