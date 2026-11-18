import struct
import zlib
import os

def create_png(width, height, r, g, b, a=255):
    # Generates a solid colored RGBA PNG with a simple shield border
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type none
        for x in range(width):
            # Simple shield border effect
            border = (x == 0 or x == width - 1 or y == 0 or y == height - 1)
            if border:
                raw_data.extend([200, 30, 30, 255])
            else:
                raw_data.extend([r, g, b, a])
    
    compressed = zlib.compress(raw_data)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(struct.pack('>I', len(ihdr_data)))
    png.extend(b'IHDR')
    png.extend(ihdr_data)
    png.extend(struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data)))
    
    # IDAT
    png.extend(struct.pack('>I', len(compressed)))
    png.extend(b'IDAT')
    png.extend(compressed)
    png.extend(struct.pack('>I', zlib.crc32(b'IDAT' + compressed)))
    
    # IEND
    png.extend(struct.pack('>I', 0))
    png.extend(b'IEND')
    png.extend(struct.pack('>I', zlib.crc32(b'IEND')))
    
    return bytes(png)

os.makedirs('icons', exist_ok=True)
for size in [16, 32, 48, 128]:
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(create_png(size, size, 230, 50, 50))
print("Icons generated successfully.")

