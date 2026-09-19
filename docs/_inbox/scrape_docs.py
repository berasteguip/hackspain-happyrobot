#!/usr/bin/env python3
"""Mirror docs.happyrobot.ai to local Markdown.

The docs are a Mintlify site behind a shared access code. This authenticates
once, enumerates every page from llms.txt, and saves each as Markdown under
docs/. The session JWT lives ~15 minutes, so it re-authenticates as it goes.

Usage:
    HR_DOCS_CODE=<access-code> python3 docs/_inbox/scrape_docs.py [outdir]

Defaults to the raw-material folder the knowledge base expects
(docs/_inbox/2026-09-18-happyrobot-docs-oficiales), per AGENTS.md rule 5.
"""
import http.cookiejar
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://docs.happyrobot.ai"
OPENAPI_URL = "https://platform.happyrobot.ai/api/v2/docs/json"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")

CODE = os.environ.get("HR_DOCS_CODE")
if not CODE:
    sys.exit("set HR_DOCS_CODE to the docs access code")
OUT = (sys.argv[1] if len(sys.argv) > 1
       else "docs/_inbox/2026-09-18-happyrobot-docs-oficiales")

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [("User-Agent", UA)]
_lock = threading.Lock()
_last_auth = 0.0


def auth(force=False):
    """(Re)authenticate. The JWT expires in ~15 min, so refresh every 10."""
    global _last_auth
    with _lock:
        if not force and time.time() - _last_auth < 600:
            return
        req = urllib.request.Request(
            f"{BASE}/login/callback/password",
            data=json.dumps({"password": CODE}).encode(),
            headers={"Content-Type": "application/json", "User-Agent": UA},
            method="POST")
        opener.open(req, timeout=30).read()
        _last_auth = time.time()


def fetch(url, tries=4):
    url = urllib.parse.quote(url, safe=":/-._~")  # paths contain curly quotes
    for n in range(tries):
        auth()
        try:
            body = opener.open(urllib.request.Request(url), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                auth(force=True)
                continue
            if e.code == 404:
                return None, "404"
            if n == tries - 1:
                return None, f"HTTP {e.code}"
            time.sleep(1.5 * (n + 1))
            continue
        except Exception as e:
            if n == tries - 1:
                return None, type(e).__name__
            time.sleep(1.5 * (n + 1))
            continue
        # the gate page is served with a 200, so detect it by content
        if b"Access Restricted" in body[:60000]:
            auth(force=True)
            time.sleep(0.5)
            continue
        return body, None
    return None, "gated/retries exhausted"


def save(url, body):
    path = url[len(BASE) + 1:]
    if not path.endswith(".md"):
        path += ".md"
    dest = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(body)


def main():
    auth(force=True)

    index, err = fetch(f"{BASE}/llms.txt")
    if err:
        sys.exit(f"could not fetch llms.txt: {err}")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "llms.txt"), "wb") as f:
        f.write(index)

    urls = sorted(set(re.findall(
        r"\((https://docs\.happyrobot\.ai/[^)]+\.md)\)", index.decode("utf-8"))))
    print(f"{len(urls)} pages listed in llms.txt")

    failed = []

    def job(u):
        body, err = fetch(u)
        if err:
            failed.append((u, err))
            print(f"  FAIL {err:12s} {u}", flush=True)
        else:
            save(u, body)

    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(job, urls))

    # llms.txt omits a few pages reachable only via internal links, and those
    # pages can link to further ones -- follow until the set stops growing.
    dead = set()
    while True:
        seen = {"/" + os.path.relpath(os.path.join(r, n), OUT)[:-3]
                for r, _, fs in os.walk(OUT) for n in fs if n.endswith(".md")}
        links = set()
        for root, _, files in os.walk(OUT):
            for n in files:
                if not n.endswith(".md"):
                    continue
                txt = open(os.path.join(root, n), encoding="utf-8",
                           errors="replace").read()
                links.update(re.findall(r"\]\((/[^)\s#?]+)", txt))
                links.update(re.findall(r'href="(/[^"#?]+)"', txt))
        extra = sorted(
            l for l in links - seen - dead
            if not l.startswith(("/images", "/logo", "/mintlify", "/_next", "/assets/img"))
            and not re.search(r"\.(png|jpe?g|svg|gif|webp|mp4|pdf|zip|json|txt|css|js)$", l))
        if not extra:
            break
        for l in extra:
            body, err = fetch(f"{BASE}{l}.md")
            if err:
                dead.add(l)
                failed.append((l, err))
                print(f"  FAIL {err:12s} {l}")
            else:
                save(f"{BASE}{l}.md", body)
                print(f"  + {l}")

    # the public OpenAPI spec the docs link to
    try:
        spec = urllib.request.urlopen(
            urllib.request.Request(OPENAPI_URL, headers={"User-Agent": UA}), timeout=60).read()
        with open(os.path.join(OUT, "openapi.json"), "w", encoding="utf-8") as f:
            json.dump(json.loads(spec), f, indent=2, ensure_ascii=False)
        print("saved openapi.json")
    except Exception as e:
        print(f"  FAIL openapi.json: {e}")

    total = sum(1 for _, _, fs in os.walk(OUT) for n in fs if n.endswith(".md"))
    print(f"\n{total} markdown pages in {OUT}/  |  {len(failed)} failed")
    for u, e in failed:
        print(f"  {e}: {u}")


if __name__ == "__main__":
    main()
