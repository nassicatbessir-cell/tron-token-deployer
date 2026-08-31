from PIL import Image, ImageEnhance
import os

def img_hash(path):
    img = Image.open(path).convert('L').resize((8, 8))
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    return ''.join('1' if p > avg else '0' for p in pixels)

def hd(a, b):
    return sum(1 for x, y in zip(a, b) if x != y)

target = img_hash("real_tether.png")
print(f"🎯 هش هدف: {target[:16]}...")

best = 999
count = 0

# تغییرات ترکیبی: روشنایی، کنتراست، شارپنس
for b in [i * 0.001 for i in range(-30, 31, 2)]:
    for c in [i * 0.001 for i in range(-30, 31, 2)]:
        for s in [i * 0.01 for i in range(-5, 6, 1)]:
            img = Image.open("my_logo.png")
            img = ImageEnhance.Brightness(img).enhance(1 + b)
            img = ImageEnhance.Contrast(img).enhance(1 + c)
            img = ImageEnhance.Sharpness(img).enhance(1 + s)
            
            tmp = f"temp_{count}.png"
            img.save(tmp)
            d = hd(target, img_hash(tmp))
            os.remove(tmp)
            count += 1
            
            if d < best:
                best = d
                print(f"✅ بهبود: {d}  (b={b:.3f}, c={c:.3f}, s={s:.2f})")
                if d < 5:
                    img.save("final_logo.png")
                    print(f"🎉 لوگوی نهایی با فاصله {d} ساخته شد!")
                    exit(0)

print(f"❌ بهترین فاصله: {best}")
