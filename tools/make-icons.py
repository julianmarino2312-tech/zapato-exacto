# Dibuja los íconos de la app (dos cartas sobre fondo oscuro).
# Uso: python3 tools/make-icons.py
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BG = (18, 22, 20)
CREAM = (250, 247, 238)
RED = (194, 44, 44)
BLUE = (31, 95, 191)
GREEN = (15, 122, 67)

def font(size):
    for f in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Bold.ttf']:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

def draw(size, safe=1.0, rounded=True):
    S = size * 4  # dibuja grande y reduce para bordes suaves
    img = Image.new('RGBA', (S, S), BG + (255,))
    d = ImageDraw.Draw(img)
    s = S * safe
    off = (S - s) / 2
    cw, ch = s * 0.42, s * 0.60
    # carta trasera azul, inclinada a la izquierda
    back = Image.new('RGBA', (int(cw), int(ch)), (0, 0, 0, 0))
    ImageDraw.Draw(back).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=cw * 0.12, fill=BLUE)
    back = back.rotate(14, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(back, (int(off + s * 0.16), int(off + s * 0.16)))
    # carta delantera crema con un 7 rojo
    front = Image.new('RGBA', (int(cw), int(ch)), (0, 0, 0, 0))
    fd = ImageDraw.Draw(front)
    fd.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=cw * 0.12, fill=CREAM)
    f = font(int(ch * 0.62))
    bbox = fd.textbbox((0, 0), '7', font=f)
    fd.text(((cw - (bbox[2] - bbox[0])) / 2 - bbox[0], (ch - (bbox[3] - bbox[1])) / 2 - bbox[1]), '7', font=f, fill=RED)
    front = front.rotate(-8, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(front, (int(off + s * 0.40), int(off + s * 0.20)))
    # punto verde de "ventaja"
    r = s * 0.07
    cx, cy = off + s * 0.80, off + s * 0.20
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    img = img.resize((size, size), Image.LANCZOS)
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img

os.makedirs(ROOT, exist_ok=True)
draw(192).save(os.path.join(ROOT, 'icon-192.png'))
draw(512).save(os.path.join(ROOT, 'icon-512.png'))
draw(512, safe=0.72, rounded=False).save(os.path.join(ROOT, 'maskable-512.png'))  # Android recorta en círculo
draw(180, rounded=False).convert('RGB').save(os.path.join(ROOT, 'apple-touch-icon.png'))  # iOS redondea solo
print('íconos listos')
