#!/usr/bin/env python3
"""
Simple PO to MO Compiler for GNOME Adaptive Tone Extension
Converts .po files into GNU gettext binary .mo files.
"""

import os
import sys
import struct
import re

def parse_po(file_path):
    translations = {}
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match msgid and msgstr pairs (including multiline)
    pattern = r'msgid\s+("(?:[^"\\]|\\.)*"(?:\s*"(?:[^"\\]|\\.)*")*)\s+msgstr\s+("(?:[^"\\]|\\.)*"(?:\s*"(?:[^"\\]|\\.)*")*)'
    matches = re.findall(pattern, content)

    for msgid_raw, msgstr_raw in matches:
        msgid = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', msgid_raw))
        msgstr = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', msgstr_raw))

        # Decode escape characters
        msgid = msgid.encode('raw_unicode_escape').decode('unicode_escape')
        msgstr = msgstr.encode('raw_unicode_escape').decode('unicode_escape')

        translations[msgid] = msgstr

    return translations

def write_mo(translations, output_path):
    # Ensure charset header is present
    if '' not in translations:
        translations[''] = 'Content-Type: text/plain; charset=UTF-8\n'

    keys = sorted(translations.keys())
    orig_table_offset = 28
    trans_table_offset = 28 + len(keys) * 8
    
    orig_data = b''
    trans_data = b''
    orig_entries = []
    trans_entries = []
    
    data_offset = 28 + len(keys) * 16
    cur_orig_offset = data_offset

    for k in keys:
        enc = k.encode('utf-8') + b'\x00'
        orig_entries.append((len(enc) - 1, cur_orig_offset))
        cur_orig_offset += len(enc)
        orig_data += enc

    cur_trans_offset = cur_orig_offset
    for k in keys:
        enc = translations[k].encode('utf-8') + b'\x00'
        trans_entries.append((len(enc) - 1, cur_trans_offset))
        cur_trans_offset += len(enc)
        trans_data += enc

    header = struct.pack('Iiiiiii', 0x950412de, 0, len(keys), orig_table_offset, trans_table_offset, 0, 0)
    orig_table = b''.join(struct.pack('ii', length, offset) for length, offset in orig_entries)
    trans_table = b''.join(struct.pack('ii', length, offset) for length, offset in trans_entries)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(header + orig_table + trans_table + orig_data + trans_data)

def compile_po_to_mo(po_path, mo_path=None):
    if mo_path is None:
        mo_path = os.path.splitext(po_path)[0] + '.mo'
    translations = parse_po(po_path)
    write_mo(translations, mo_path)
    print(f"Compiled {po_path} -> {mo_path} ({len(translations)} entries)")

def main():
    if len(sys.argv) > 1:
        for po_file in sys.argv[1:]:
            compile_po_to_mo(po_file)
    else:
        # Scan default directory
        repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        locale_dir = os.path.join(repo_dir, 'extension', 'locale')
        for root, _, files in os.walk(locale_dir):
            for file in files:
                if file.endswith('.po'):
                    compile_po_to_mo(os.path.join(root, file))

if __name__ == '__main__':
    main()
