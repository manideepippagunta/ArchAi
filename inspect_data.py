import re

with open('model_data.json', 'r') as f:
    content = f.read()

count = content.count('"input":')
print(f'Number of training entries: {count}')

content_stripped = content.rstrip()
print('Ends with ]:', content_stripped.endswith(']'))
print('Last 20 chars:', repr(content_stripped[-20:]))
