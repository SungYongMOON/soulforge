#!/usr/bin/env python3
"""게이트 번호 체계 변환 스크립트"""
import re

# 변환 규칙: 현재 게이트 코드 → 새 게이트 코드
GATE_MAPPING = {
    20: 30,
    40: 60,
    60: 90,
    80: 120,
    110: 150,
    130: 180,
    150: 210,
    170: 240,
}

# 태스크 ID 변환: 기존 범위 → 새 시작
TASK_MAPPING = {
    (21, 38): 31,   # 20→30: tasks 21-38 → 31-48
    (41, 54): 61,   # 40→60: tasks 41-54 → 61-74
    (61, 78): 91,   # 60→90: tasks 61-78 → 91-108
    (81, 103): 121, # 80→120: tasks 81-103 → 121-143
    (111, 129): 151, # 110→150: tasks 111-129 → 151-169
    (131, 145): 181, # 130→180: tasks 131-145 → 181-195
    (151, 164): 211, # 150→210: tasks 151-164 → 211-224
    (171, 177): 241, # 170→240: tasks 171-177 → 241-247
}

def convert_task_id(old_id: int) -> int:
    """태스크 ID 변환"""
    for (start, end), new_start in TASK_MAPPING.items():
        if start <= old_id <= end:
            return new_start + (old_id - start)
    return old_id

def process_file(input_path: str, output_path: str):
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 게이트 코드 변환 (- code: XX 형식)
    for old_code, new_code in GATE_MAPPING.items():
        content = re.sub(
            rf'^(- code: ){old_code}$',
            rf'\g<1>{new_code}',
            content,
            flags=re.MULTILINE
        )
    
    # 태스크 ID 변환 (  - id: XX 형식)
    def replace_task_id(match):
        old_id = int(match.group(2))
        new_id = convert_task_id(old_id)
        return f"{match.group(1)}{new_id}"
    
    content = re.sub(
        r'^(  - id: )(\d+)$',
        replace_task_id,
        content,
        flags=re.MULTILINE
    )
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"변환 완료: {output_path}")

if __name__ == "__main__":
    import sys
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file
    process_file(input_file, output_file)
