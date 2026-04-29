#!/usr/bin/env python3
import re
import os
import sys
import time
import urllib.request
import urllib.parse
import ssl
import json

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
OUT_DIR = "/Users/hakobandreasyan/Documents/Code/retro/imgs"
LIST_PATH = "/Users/hakobandreasyan/Documents/Code/retro/personas-list.md"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def parse_personas(path):
    personas = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line.startswith("|"):
                continue
            parts = [p.strip() for p in line.strip("|").split("|")]
            if len(parts) != 2:
                continue
            slug, name = parts
            if slug.lower() in ("slug", "---") or slug.startswith("---"):
                continue
            if slug.startswith("_"):
                continue
            personas.append((slug, name))
    return personas


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read()


def bing_first_image(query):
    url = "https://www.bing.com/images/search?q=" + urllib.parse.quote(query) + "&form=HDRSC2"
    html = fetch(url).decode("utf-8", errors="ignore")
    # Bing embeds JSON with murl (media URL)
    matches = re.findall(r'murl&quot;:&quot;([^&]+)&quot;', html)
    for m in matches:
        if m.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            return m
    return matches[0] if matches else None


def download(slug, name):
    out_path_base = os.path.join(OUT_DIR, slug)
    # skip if already done with any extension
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if os.path.exists(out_path_base + ext):
            return f"SKIP {slug} (exists)"
    queries = [
        f"{name} character portrait",
        f"{name} character",
        f"{name}",
    ]
    last_err = None
    for q in queries:
        try:
            img_url = bing_first_image(q)
            if not img_url:
                last_err = "no result"
                continue
            data = fetch(img_url, timeout=25)
            # determine extension
            ext = ".jpg"
            low = img_url.lower().split("?")[0]
            for e in (".png", ".jpeg", ".jpg", ".webp"):
                if low.endswith(e):
                    ext = ".jpg" if e == ".jpeg" else e
                    break
            path = out_path_base + ext
            with open(path, "wb") as f:
                f.write(data)
            return f"OK   {slug} <- {q!r} ({len(data)} bytes, {ext})"
        except Exception as e:
            last_err = str(e)
            time.sleep(0.5)
            continue
    return f"FAIL {slug} ({last_err})"


def main():
    personas = parse_personas(LIST_PATH)
    print(f"Total personas: {len(personas)}")
    os.makedirs(OUT_DIR, exist_ok=True)
    # allow filtering by argv
    if len(sys.argv) > 1:
        only = set(sys.argv[1:])
        personas = [p for p in personas if p[0] in only]
    for slug, name in personas:
        msg = download(slug, name)
        print(msg, flush=True)
        time.sleep(0.4)


if __name__ == "__main__":
    main()
