import os
import re

html_files = [f for f in os.listdir('.') if f.endswith('.html')]

# We want to replace href="page" with href="page.html"
# Known pages: index, ingredients, basics, reference, cms, legal
pages = ['index', 'ingredients', 'basics', 'reference', 'cms', 'legal']

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for page in pages:
        content = re.sub(f'href="{page}"', f'href="{page}.html"', content)
        
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Updated links to include .html")
