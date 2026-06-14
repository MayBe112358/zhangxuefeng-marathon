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


# ---- 1. 6 帧跑步图：去背景后按列分割（底边到 230 以保留腿脚）----
run_strip = im.crop((40, 45, 900, 230))
run_strip = remove_bg(run_strip)
arr = np.array(run_strip)
alpha = arr[:, :, 3] > 8
# 仅用上半身(0~140行)定位每帧的列区间，避开脚下扬尘造成的误分割
colmass = alpha[0:140, :].sum(axis=0)
cols = colmass > 6
segments = []
start = None
for x, v in enumerate(cols):
    if v and start is None:
        start = x
    elif not v and start is not None:
        if x - start > 30:  # 忽略碎片
            segments.append((start, x))
        start = None
if start is not None:
    segments.append((start, len(cols)))
print("run segments found:", len(segments), segments)
for i, (a, b) in enumerate(segments):
    pad = 6  # 列区间左右各放宽，避免裁掉前后摆动的腿
    frame = run_strip.crop((max(0, a - pad), 0, min(run_strip.width, b + pad), run_strip.height))
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

# ---- 3. 受伤（撞击/游戏结束时显示）----
save(trim(remove_bg(im.crop((1290, 500, 1468, 690)))), "crouch.png")

# ---- 4. Logo ----
save(trim(remove_bg(im.crop((1230, 95, 1522, 345)))), "logo.png")

# ---- 5. 滑铲动作（单张大图，去白底裁边）----
slide = Image.open("滑铲.png").convert("RGBA")
save(trim(remove_bg(slide)), "slide.png")

# ---- 6. 整合背景（健身房+跑步机一体，水平循环；裁掉顶部标注与白边）----
bg = Image.open("背景.png").convert("RGB").crop((0, 224, 1774, 730))
save(bg.convert("RGBA"), "bg.png")

print("ALL DONE")
