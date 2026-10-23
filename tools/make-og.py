# Renders tools/og.html to assets/og-share.jpg (1200x630), the share image
# WhatsApp and X show for the page link.
import os
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "og.html")
OUT = os.path.join(ROOT, "assets", "og-share.jpg")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.goto("file:///" + SRC.replace("\\", "/"), wait_until="networkidle")
    pg.wait_for_timeout(500)
    png = pg.screenshot()
    b.close()

Image.open(BytesIO(png)).convert("RGB").save(OUT, quality=88)
print(OUT, os.path.getsize(OUT) // 1024, "KB")
