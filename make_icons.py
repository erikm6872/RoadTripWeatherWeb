"""Generate the PWA / Android launcher icons.

Draws a simple flat icon — dark sky, amber sun, and a road receding to the
horizon — at the sizes the manifest needs. Run once (requires Pillow):

    python make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "static" / "icons"

SKY = (15, 23, 42)        # --bg
SUN = (251, 191, 36)      # --accent-2
ROAD = (51, 65, 85)
STRIPE = (226, 232, 240)
ACCENT = (56, 189, 248)   # --accent


def draw_icon(size, safe_margin=0.0):
    """Render the icon. `safe_margin` shrinks artwork toward the centre
    (maskable icons need ~20% padding so circular masks don't clip them)."""
    img = Image.new("RGB", (size, size), SKY)
    d = ImageDraw.Draw(img)
    s = size  # shorthand

    def sc(v):  # scale a 0..1 design coordinate, honouring the safe margin
        return s * (safe_margin + v * (1 - 2 * safe_margin))

    # Sun (upper left)
    d.ellipse([sc(0.14), sc(0.12), sc(0.46), sc(0.44)], fill=SUN)

    # Horizon line
    d.rectangle([sc(0.0), sc(0.55), sc(1.0), sc(0.575)], fill=ACCENT)

    # Road: trapezoid from horizon to bottom
    d.polygon(
        [(sc(0.44), sc(0.575)), (sc(0.56), sc(0.575)),
         (sc(0.82), sc(1.0)), (sc(0.18), sc(1.0))],
        fill=ROAD,
    )
    # Centre dashes
    for top, bottom, w_top, w_bot in [(0.62, 0.70, 0.012, 0.018),
                                      (0.76, 0.85, 0.02, 0.028),
                                      (0.91, 1.0, 0.032, 0.04)]:
        cx = 0.5
        d.polygon(
            [(sc(cx - w_top), sc(top)), (sc(cx + w_top), sc(top)),
             (sc(cx + w_bot), sc(bottom)), (sc(cx - w_bot), sc(bottom))],
            fill=STRIPE,
        )
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png")
    draw_icon(512).save(OUT / "icon-512.png")
    draw_icon(512, safe_margin=0.12).save(OUT / "icon-maskable-512.png")
    # iOS home-screen icon (Safari ignores manifest icons; Apple wants 180px).
    draw_icon(180).save(OUT / "icon-180.png")
    print(f"Icons written to {OUT}")


if __name__ == "__main__":
    main()
