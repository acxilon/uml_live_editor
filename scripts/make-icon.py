"""Generate the UML Live app icon (gradient tile + diagram glyph).

Run with: python scripts/make-icon.py
Outputs: build/icon.ico, build/icon.png.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SIZE = 1024
SS = 4  # supersampling factor for crisp antialiased edges


def gradient(size: int) -> Image.Image:
    """Diagonal indigo -> violet -> cyan gradient."""
    stops = np.array(
        [
            [99, 102, 241],   # indigo
            [124, 58, 237],   # violet
            [6, 182, 212],    # cyan
        ],
        dtype=np.float64,
    )
    positions = np.array([0.0, 0.52, 1.0])
    ys, xs = np.mgrid[0:size, 0:size]
    t = np.clip((xs / (size - 1)) * 0.62 + (ys / (size - 1)) * 0.38, 0.0, 1.0)
    flat = t.ravel()
    rgb = np.empty((flat.size, 3), dtype=np.float64)
    for channel in range(3):
        rgb[:, channel] = np.interp(flat, positions, stops[:, channel])
    rgb = rgb.reshape(size, size, 3).astype(np.uint8)

    # Soft radial highlight in the upper-left gives the tile some depth.
    yy, xx = np.mgrid[0:size, 0:size]
    dist = np.sqrt((xx - size * 0.22) ** 2 + (yy - size * 0.16) ** 2) / (size * 0.8)
    glow = np.clip(1.0 - dist, 0.0, 1.0) ** 2 * 0.16
    rgb = np.clip(rgb.astype(np.float64) + glow[..., None] * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(rgb, "RGB")


def rounded_mask(size: int, radius: int, inset: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=radius,
        fill=255,
    )
    return mask


def draw_glyph(image: Image.Image) -> Image.Image:
    """Draw a small network/class diagram glyph on top of the gradient tile."""
    draw = ImageDraw.Draw(image)
    white = (255, 255, 255, 246)
    soft = (255, 255, 255, 190)
    s = image.size[0]

    def pt(x: float, y: float) -> tuple[float, float]:
        return (x * s, y * s)

    # Connectors (behind the nodes).
    line_w = int(s * 0.027)
    a = pt(0.315, 0.345)
    b = pt(0.705, 0.292)
    c = pt(0.523, 0.705)
    draw.line([a, c], fill=soft, width=line_w, joint="curve")
    draw.line([b, c], fill=soft, width=line_w, joint="curve")

    # Dashed connector from A to B.
    dash_len = 0.032 * s
    gap_len = 0.026 * s
    ax, ay = a
    bx, by = b
    total = math.dist(a, b)
    dx, dy = (bx - ax) / total, (by - ay) / total
    traveled = 0.0
    while traveled < total:
        end = min(traveled + dash_len, total)
        draw.line(
            [(ax + dx * traveled, ay + dy * traveled), (ax + dx * end, ay + dy * end)],
            fill=white,
            width=line_w,
        )
        traveled = end + gap_len

    # Node A: outlined circle.
    r = s * 0.082
    cx, cy = a
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=white)
    inner = r * 0.52
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=(124, 58, 237, 255))

    # Node B: solid circle.
    r = s * 0.054
    cx, cy = b
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=white)

    # Node C: rounded square with an inner accent.
    w = s * 0.155
    cx, cy = c
    draw.rounded_rectangle(
        (cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2),
        radius=int(s * 0.036),
        fill=white,
    )
    inner = w * 0.48
    draw.rounded_rectangle(
        (cx - inner / 2, cy - inner / 2, cx + inner / 2, cy + inner / 2),
        radius=int(s * 0.018),
        fill=(6, 148, 200, 255),
    )
    return image


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    big = gradient(SIZE * SS)
    mask = rounded_mask(SIZE * SS, int(SIZE * SS * 0.215), int(SIZE * SS * 0.025))
    big = draw_glyph(big)
    big.putalpha(mask)
    big = big.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    # Subtle outer shadow for the PNG preview (not baked into the ICO alpha edges).
    icon = big
    icon.save(BUILD / "icon.png")

    ico_sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    icon.save(
        BUILD / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
    )
    print(f"Wrote {BUILD / 'icon.ico'} and {BUILD / 'icon.png'}")


if __name__ == "__main__":
    main()
