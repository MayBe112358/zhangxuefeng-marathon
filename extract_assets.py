# -*- coding: utf-8 -*-
"""从『最终完整素材.png』提取游戏实际使用的 PNG 素材。

生成图里棋盘格是画出来的，不是真透明通道，所以这里对每个角色/道具裁片做
边缘浅色洪泛去底，尽量保留物体内部的白色高光和标签。
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


SRC = Path("最终完整素材.png")
OUT = Path("assets")
OUT.mkdir(exist_ok=True)


def flood_remove_checker(img: Image.Image, threshold: int = 235) -> Image.Image:
    """只移除与裁片边缘连通的浅灰/白色棋盘格背景。"""
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    rgb = arr[:, :, :3].astype(np.int16)
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    candidate = (mn > threshold) & ((mx - mn) < 18)

    h, w = candidate.shape
    seen = np.zeros_like(candidate, dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if candidate[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if candidate[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and candidate[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))

    arr[:, :, 3] = np.where(seen, 0, arr[:, :, 3])
    return Image.fromarray(arr, "RGBA")


def trim_alpha(img: Image.Image, pad: int = 4) -> Image.Image:
    arr = np.array(img)
    ys, xs = np.where(arr[:, :, 3] > 8)
    if len(xs) == 0:
        return img
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def crop_clean(sheet: Image.Image, box: tuple[int, int, int, int], trim: bool = True) -> Image.Image:
    img = flood_remove_checker(sheet.crop(box))
    return trim_alpha(img) if trim else img


def save(img: Image.Image, name: str) -> None:
    path = OUT / name
    img.save(path)
    print(f"saved {name:22s} {img.size}")


def main() -> None:
    sheet = Image.open(SRC).convert("RGB")

    # Top row: 6 running frames. Use consistent y bounds so feet align in-game.
    run_boxes = [
        (36, 24, 204, 270),
        (232, 24, 404, 270),
        (436, 24, 612, 270),
        (632, 24, 820, 270),
        (844, 24, 1020, 270),
        (1018, 24, 1220, 270),
    ]
    for i, box in enumerate(run_boxes):
        save(crop_clean(sheet, box), f"run{i}.png")

    # Special actions.
    save(crop_clean(sheet, (28, 280, 204, 530)), "jump.png")
    # The current game expects these names. Keep sliding as one stable pose.
    save(crop_clean(sheet, (1022, 310, 1232, 540)), "crouch.png")
    save(crop_clean(sheet, (205, 355, 410, 518)), "slide.png")

    # Obstacles and collectibles.
    save(crop_clean(sheet, (90, 532, 294, 762)), "obstacle_sprite.png")
    save(crop_clean(sheet, (370, 528, 548, 762)), "obstacle_icecream.png")
    save(crop_clean(sheet, (628, 528, 840, 762)), "book1.png")
    save(crop_clean(sheet, (916, 528, 1134, 762)), "book2.png")

    # Scene layers.
    save(sheet.crop((16, 782, 1240, 1040)).convert("RGBA"), "bg.png")
    save(crop_clean(sheet, (18, 1088, 1240, 1218), trim=True), "belt.png")


if __name__ == "__main__":
    main()
