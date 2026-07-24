import os

desktop_dir = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\desktop_agent"

def search_files(directory):
    results = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.cs', '.py', '.js', '.json', '.config', '.bat')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    if 'started_at' in content or 'ingest' in content or 'ended_at' in content:
                        for idx, line in enumerate(content.splitlines()):
                            if 'started_at' in line or 'ingest' in line or 'ended_at' in line:
                                results.append({
                                    'file': filepath,
                                    'line_num': idx + 1,
                                    'content': line.strip()
                                })
                except Exception as e:
                    pass
    return results

if __name__ == "__main__":
    found = search_files(desktop_dir)
    print(f"Found {len(found)} references:")
    for item in found[:30]:
        rel = os.path.relpath(item['file'], desktop_dir)
        print(f"{rel}:{item['line_num']}: {item['content']}")
