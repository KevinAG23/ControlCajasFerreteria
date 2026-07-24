import os

frontend_dir = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src"

def search_files(directory):
    results = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.js', '.jsx')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines):
                        if 'hablante' in line or 'Hablante' in line or 'speaker' in line or 'Speaker' in line or 'Cajero:' in line or 'Usuario:' in line or 'transcrip' in line.lower():
                            if any(k in line for k in ['render', 'modal', 'class', 'style', 'span', '<', '>', 'Format', 'map']):
                                results.append({
                                    'file': filepath,
                                    'line_num': idx + 1,
                                    'content': line.strip()
                                })
                except Exception as e:
                    pass
    return results

if __name__ == "__main__":
    found = search_files(frontend_dir)
    print(f"Found {len(found)} references:")
    for item in found[:40]:
        rel = os.path.relpath(item['file'], frontend_dir)
        print(f"{rel}:{item['line_num']}: {item['content']}")
