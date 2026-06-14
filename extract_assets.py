# -*- coding: utf-8 -*-
"""从『补充素材.png』拼版图提取独立透明 PNG 素材。"""
import os
import numpy as np
from PIL import Image

SRC = "补充素材.png"
OUT = "assets"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
W, H = im.size
print("source:", W, H)


def remove_bg(rgba, thresh=192):
    """边缘洪泛去除浅色背景，保留人物/物体内部的白色。"""
    arr = np.array(rgba)
    rgb = arr[:, :, :3].astype(np.int32)
    candidate = rgb.min(axis=2) >= thresh  # 浅色像素 = 可能是背景

    h, w = candidate.shape
    mask = np.zeros((h, w), dtype=bool)
    # 种子 = 四条边上的浅色像素
    mask[0, :] |= candidate[0, :]
    mask[-1, :] |= candidate[-1, :]
    mask[:, 0] |= candidate[:, 0]
    mask[:, -1] |= candidate[:, -1]

    # 迭代膨胀，限制在 candidate 内（连通背景）
    for _ in range(2000):
        new = mask.copy()
        new[1:, :] |= mask[:-1, :]
        new[:-1, :] |= mask[1:, :]
        new[:, 1:] |= mask[:, :-1]
        new[:, :-1] |= mask[:, 1:]
        new &= candidate
        if np.array_equal(new, mask):
            break
        mask = new

    arr[:, :, 3] = np.where(mask, 0, arr[:, :, 3])
    return Image.fromarray(arr, "RGBA")


def trim(rgba, pad=2):
    """按非透明像素裁边。"""
    arr = np.array(rgba)
    ys, xs = np.where(arr[:, :, 3] > 8)
    if len(xs) == 0:
        return rgba
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(rgba.width, x1 + pad + 1); y1 = min(rgba.height, y1 + pad + 1)
    return rgba.crop((x0, y0, x1, y1))


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print("saved", name, img.size)


# ---- 1. 6 帧跑步图：去背景后按列分割 ----
run_strip = im.crop((40, 45, 900, 182))
run_strip = remove_bg(run_strip)
arr = np.array(run_strip)
colmass = (arr[:, :, 3] > 8).sum(axis=0)  # 每列非透明像素数
# 找出连续有内容的列区间
cols = colmass > 3
segments = []
start = None
for x, v in enumerate(cols):
    if v and start is None:
        start = x
    elif not v and start is not None:
        if x - start > 15:  # 忽略碎片
            segments.append((start, x))
        start = None
if start is not None:
    segments.append((start, len(cols)))
print("run segments found:", len(segments), segments)
for i, (a, b) in enumerate(segments):
    frame = run_strip.crop((a, 0, b, run_strip.height))
    frame = trim(frame)
    save(frame, f"run{i}.png")

# ---- 2. 障碍物 / 道具：去背景后按列分割，避开上方标签文字 ----
item_strip = remove_bg(im.crop((0, 292, 760, 472)))
arr2 = np.array(item_strip)
cols2 = (arr2[:, :, 3] > 8).sum(axis=0) > 2
segs2 = []
start = None
for x, v in enumerate(cols2):
    if v and start is None:
        start = x
    elif not v and start is not None:
        if x - start > 20:
            segs2.append((start, x))
        start = None
if start is not None:
    segs2.append((start, len(cols2)))
print("item segments:", len(segs2), segs2)
item_names = ["obstacle_sprite.png", "obstacle_icecream.png", "book2.png", "book1.png"]
for (a, b), name in zip(segs2, item_names):
    save(trim(item_strip.crop((a, 0, b, item_strip.height))), name)

# ---- 3. 蹲下 / 受伤 ----
save(trim(remove_bg(im.crop((1290, 500, 1468, 690)))), "crouch.png")

# ---- 4. Logo ----
save(trim(remove_bg(im.crop((1230, 95, 1522, 345)))), "logo.png")

# ---- 5. 天空背景层 ----
save(im.crop((6, 498, 1078, 625)).convert("RGBA"), "sky.png")

# ---- 6. 远景层（健身房/跑道）----
save(im.crop((5, 655, 1085, 792)).convert("RGBA"), "far.png")

# ---- 7. 地面（跑步机）----
save(trim(remove_bg(im.crop((5, 838, 1465, 1016)))), "ground.png")

print("ALL DONE")
