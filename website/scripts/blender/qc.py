"""Read the city's QCT1 chunks (src/lib/city/data.ts decodeChunk) into numpy."""
import json, struct, zlib, numpy as np
DT = {'u8': np.uint8, 'i8': np.int8, 'u16': np.uint16, 'i16': np.int16, 'u32': np.uint32, 'i32': np.int32, 'f32': np.float32}
def read(path):
    b = open(path, 'rb').read()
    if b[:4] != b'QCT1': raise ValueError('not a chunk: ' + path)
    hl, pl, crc = struct.unpack('<III', b[4:16])
    base = (16 + hl + 7) & ~7
    head = json.loads(b[16:16 + hl]); pay = b[base:base + pl]
    if zlib.crc32(pay) & 0xffffffff != crc: raise ValueError('crc ' + path)
    return head, {f['n']: np.frombuffer(pay, DT[f['t']], f['c'], f['o']) for f in head['fields']}
