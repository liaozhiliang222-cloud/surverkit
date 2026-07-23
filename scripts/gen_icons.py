"""按 public/icon.svg 的设计，用 Pillow 栅格化生成标准 PWA PNG 图标。

设计（viewBox 0 0 512 512）：
  - 圆角矩形背景 512×512 rx112 填充 #0f766e
  - 四条文档条（teal 亮色，带透明度）
  - 右下橙色圆点 + 中心 teal 小圆
"""
from PIL import Image, ImageDraw

BG = (15, 118, 110, 255)        # #0f766e
BAR1 = (94, 234, 212, 255)      # #5eead4
BAR2 = (153, 246, 225, 217)     # #99f6e1 @0.85
BAR3 = (153, 246, 225, 179)     # #99f6e1 @0.70
BAR4 = (153, 246, 225, 140)     # #99f6e1 @0.55
ACCENT = (245, 158, 11, 255)    # #f59e0b
DOT = (15, 118, 110, 255)


def draw_logo(d: ImageDraw.ImageDraw, N: int, scale: float = 1.0, off: int = 0):
    s = (N / 512) * scale

    def rect(x, y, w, h, r, fill):
        x0, y0 = int(x * s) + off, int(y * s) + off
        x1, y1 = int((x + w) * s) + off, int((y + h) * s) + off
        d.rounded_rectangle([x0, y0, x1, y1], radius=int(r * s), fill=fill)

    def circle(cx, cy, r, fill):
        cxp, cyp = int(cx * s) + off, int(cy * s) + off
        rr = int(r * s)
        d.ellipse([cxp - rr, cyp - rr, cxp + rr, cyp + rr], fill=fill)

    rect(96, 120, 320, 48, 24, BAR1)
    rect(96, 208, 240, 40, 20, BAR2)
    rect(96, 272, 280, 40, 20, BAR3)
    rect(96, 336, 180, 40, 20, BAR4)
    circle(384, 356, 56, ACCENT)
    circle(384, 356, 22, DOT)


def make_standard(N: int, path: str):
    img = Image.new("RGBA", (N, N))
    d = ImageDraw.Draw(img)
    # 圆角背景（四角透明）
    d.rounded_rectangle([0, 0, N, N], radius=int(112 * N / 512), fill=BG)
    draw_logo(d, N)
    img.save(path, "PNG")
    print(f"written {path} ({N}x{N})")


def make_maskable(N: int, path: str):
    img = Image.new("RGBA", (N, N), BG)  # 满铺背景，无透明
    d = ImageDraw.Draw(img)
    # 内容缩放到中心 82% 安全区
    scale = 0.82
    off = int((N - N * scale) / 2)
    draw_logo(d, N, scale=scale, off=off)
    img.save(path, "PNG")
    print(f"written {path} ({N}x{N})")


if __name__ == "__main__":
    make_standard(192, "public/icon-192.png")
    make_standard(512, "public/icon-512.png")
    make_maskable(512, "public/icon-512-maskable.png")
    print("done")
