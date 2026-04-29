#!/usr/bin/env python3
"""
Download avatar images for every named persona in src/lib/personas.ts.

For each persona this script:
  1. Builds a Wikipedia search query using the persona name plus a hint
     pulled from its description (e.g. "Marvel Comics", "anime", "Game of
     Thrones").
  2. Hits the Wikipedia search API to find the most likely article title.
  3. Fetches the article summary, which exposes a thumbnail / originalimage
     URL.
  4. Downloads the image to public/avatars/<slug>.jpg.

Existing files are left alone (skip), so re-running only fills missing
slots. Pass --force to re-download everything.

Quality varies. Some personas (Hayko / Mko, niche characters) won't have a
clean Wikipedia hit and will fail; you can drop a manual image into
public/avatars/<slug>.jpg afterwards.

Usage:
  pip install requests
  python3 scripts/fetch_avatars.py            # fill in missing avatars
  python3 scripts/fetch_avatars.py --force    # re-download all
  python3 scripts/fetch_avatars.py --only naruto,goku  # subset
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.parse
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Install dependencies first: pip install requests")

ROOT = Path(__file__).resolve().parents[1]
PERSONAS_FILE = ROOT / "src" / "lib" / "personas.ts"
AVATARS_DIR = ROOT / "public" / "avatars"

WP_API = "https://en.wikipedia.org/w/api.php"
WP_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary"
HEADERS = {
    "User-Agent": "RetroAvatarFetcher/1.0 (https://retro.cloudchipr.com; internal tool)"
}

# Manual overrides for tricky disambiguations. Map slug -> Wikipedia article
# title (preferred) or search query.
OVERRIDES: dict[str, str] = {
    "naruto": "Naruto Uzumaki",
    "goku": "Goku",
    "luffy": "Monkey D. Luffy",
    "sailor-moon": "Sailor Moon (character)",
    "pikachu": "Pikachu",
    "totoro": "My Neighbor Totoro",
    "ash-ketchum": "Ash Ketchum",
    "levi": "Levi Ackerman",
    "spike-spiegel": "Spike Spiegel",
    "eren": "Eren Yeager",
    "saitama": "Saitama (One-Punch Man)",
    "zoro": "Roronoa Zoro",
    "light-yagami": "Light Yagami",
    "edward-elric": "Edward Elric",
    "rem": "Rem (Re:Zero)",
    "sasuke": "Sasuke Uchiha",
    "itachi": "Itachi Uchiha",
    "madara": "Madara Uchiha",
    "kakashi": "Kakashi Hatake",
    "vegeta": "Vegeta",
    "piccolo": "Piccolo (Dragon Ball)",
    "frieza": "Frieza",
    "l-lawliet": "L (Death Note)",
    "ryuk": "Ryuk",
    "mikasa": "Mikasa Ackerman",
    "armin": "Armin Arlert",
    "alphonse": "Alphonse Elric",
    "roy-mustang": "Roy Mustang",
    "jet": "Jet Black (Cowboy Bebop)",
    "faye": "Faye Valentine",
    "sanji": "Sanji (One Piece)",
    "nami": "Nami (One Piece)",
    "ace": "Portgas D. Ace",
    "deku": "Izuku Midoriya",
    "all-might": "All Might",
    "bakugo": "Katsuki Bakugo",
    "tanjiro": "Tanjiro Kamado",
    "nezuko": "Nezuko Kamado",
    "zenitsu": "Zenitsu Agatsuma",
    "gojo": "Satoru Gojo",
    "yuji-itadori": "Yuji Itadori",
    "sukuna": "Ryomen Sukuna",

    "shrek": "Shrek (character)",
    "spongebob": "SpongeBob SquarePants (character)",
    "homer": "Homer Simpson",
    "bart": "Bart Simpson",
    "lisa": "Lisa Simpson",
    "marge": "Marge Simpson",
    "mr-burns": "Mr. Burns",
    "stewie": "Stewie Griffin",
    "peter-griffin": "Peter Griffin",
    "brian": "Brian Griffin",
    "lois": "Lois Griffin",
    "bugs-bunny": "Bugs Bunny",
    "daffy": "Daffy Duck",
    "rick": "Rick Sanchez",
    "morty": "Morty Smith",
    "finn": "Finn the Human",
    "jake": "Jake the Dog",
    "princess-bubblegum": "Princess Bubblegum",
    "marceline": "Marceline the Vampire Queen",
    "ice-king": "Ice King",
    "cartman": "Eric Cartman",
    "kenny": "Kenny McCormick",
    "stan": "Stan Marsh",
    "kyle": "Kyle Broflovski",
    "mickey": "Mickey Mouse",
    "donald": "Donald Duck",
    "tom": "Tom Cat",
    "jerry": "Jerry Mouse",
    "scooby": "Scooby-Doo (character)",
    "popeye": "Popeye",
    "pink-panther": "The Pink Panther (character)",
    "pooh": "Winnie-the-Pooh",
    "garfield": "Garfield (character)",
    "squidward": "Squidward Tentacles",
    "sandy": "Sandy Cheeks",
    "mr-krabs": "Mr. Krabs",
    "plankton": "Plankton (SpongeBob SquarePants)",

    "spider-man": "Spider-Man",
    "iron-man": "Iron Man",
    "hulk": "Hulk (character)",
    "captain-america": "Captain America",
    "black-widow": "Black Widow (Natasha Romanova)",
    "black-panther": "Black Panther (character)",
    "doctor-strange": "Doctor Strange",
    "wolverine": "Wolverine (character)",
    "deadpool": "Deadpool",
    "daredevil": "Daredevil (Marvel Comics character)",
    "scarlet-witch": "Scarlet Witch",
    "gamora": "Gamora",
    "groot": "Groot (character)",
    "rocket": "Rocket Raccoon",
    "punisher": "Punisher",
    "thanos": "Thanos",
    "captain-marvel": "Captain Marvel (Carol Danvers)",
    "vision": "Vision (Marvel Comics)",
    "falcon": "Falcon (character)",
    "ant-man": "Ant-Man (Scott Lang)",

    "superman": "Superman",
    "batman": "Batman",
    "wonder-woman": "Wonder Woman",
    "aquaman": "Aquaman",
    "flash": "The Flash (Barry Allen)",
    "green-lantern": "Green Lantern",
    "shazam": "Shazam (DC Comics)",
    "nightwing": "Nightwing",
    "robin": "Robin (character)",
    "joker": "Joker (character)",
    "harley-quinn": "Harley Quinn",
    "catwoman": "Catwoman",
    "lex-luthor": "Lex Luthor",
    "darkseid": "Darkseid",
    "poison-ivy": "Poison Ivy (character)",
    "bane": "Bane (DC Comics)",
    "riddler": "Riddler",
    "penguin": "Penguin (character)",
    "two-face": "Two-Face",
    "green-arrow": "Green Arrow",

    "da-vinci": "Leonardo da Vinci",
    "einstein": "Albert Einstein",
    "newton": "Isaac Newton",
    "tesla": "Nikola Tesla",
    "edison": "Thomas Edison",
    "cleopatra": "Cleopatra",
    "caesar": "Julius Caesar",
    "genghis-khan": "Genghis Khan",
    "napoleon": "Napoleon",
    "churchill": "Winston Churchill",
    "lincoln": "Abraham Lincoln",
    "washington": "George Washington",
    "socrates": "Socrates",
    "plato": "Plato",
    "aristotle": "Aristotle",
    "confucius": "Confucius",
    "sun-tzu": "Sun Tzu",
    "alexander": "Alexander the Great",
    "galileo": "Galileo Galilei",
    "van-gogh": "Vincent van Gogh",
    "picasso": "Pablo Picasso",
    "frida": "Frida Kahlo",
    "shakespeare": "William Shakespeare",
    "beethoven": "Ludwig van Beethoven",
    "mozart": "Wolfgang Amadeus Mozart",
    "bach": "Johann Sebastian Bach",
    "hemingway": "Ernest Hemingway",

    "devil": "Devil",
    "zeus": "Zeus",
    "poseidon": "Poseidon",
    "hades": "Hades",
    "athena": "Athena",
    "apollo": "Apollo",
    "artemis": "Artemis",
    "thor": "Thor",
    "odin": "Odin",
    "loki": "Loki",
    "anubis": "Anubis",
    "ra": "Ra",
    "medusa": "Medusa",
    "hercules": "Heracles",
    "achilles": "Achilles",

    "jon-snow": "Jon Snow (character)",
    "daenerys": "Daenerys Targaryen",
    "tyrion": "Tyrion Lannister",
    "arya": "Arya Stark",
    "cersei": "Cersei Lannister",
    "jaime": "Jaime Lannister",
    "brienne": "Brienne of Tarth",
    "sansa": "Sansa Stark",
    "ned-stark": "Eddard Stark",
    "khal-drogo": "Khal Drogo",
    "bran": "Bran Stark",
    "joffrey": "Joffrey Baratheon",
    "robb-stark": "Robb Stark",
    "the-hound": "Sandor Clegane",

    "ragnar": "Ragnar Lodbrok",
    "lagertha": "Lagertha",
    "bjorn": "Bjorn Ironside",
    "floki": "Floki (Vikings)",
    "rollo": "Rollo",
    "ivar": "Ivar the Boneless",
    "aslaug": "Aslaug",
    "athelstan": "Athelstan (Vikings)",

    "tony-montana": "Tony Montana",
    "thomas-shelby": "Tommy Shelby",
    "vito-corleone": "Vito Corleone",
    "michael-corleone": "Michael Corleone",
    "walter-white": "Walter White (Breaking Bad)",
    "tony-soprano": "Tony Soprano",
    "pablo-escobar": "Pablo Escobar",
    "arthur-shelby": "Arthur Shelby Jr.",
    "polly-gray": "Polly Gray",
    "alfie-solomons": "Alfie Solomons",
    "jesse-pinkman": "Jesse Pinkman",
    "saul-goodman": "Saul Goodman",
    "gus-fring": "Gustavo Fring",
    "christopher-moltisanti": "Christopher Moltisanti",
    "paulie": "Paulie Gualtieri",
    "sonny-corleone": "Sonny Corleone",

    # Niche / no reliable Wikipedia article — leave as searches anyway.
    "hayko": "Kargin Haghordum",
    "mko": "Kargin Haghordum",
    "dj-bobol": "DJ Bobo",
}

ENTRY_RE = re.compile(
    r"\{\s*slug:\s*\"([^\"]+)\",\s*name:\s*\"([^\"]+)\",\s*avatar:\s*\"([^\"]+)\",\s*description:\s*\"([^\"]*)\""
)


def parse_personas() -> list[dict]:
    text = PERSONAS_FILE.read_text(encoding="utf-8")
    out = []
    for m in ENTRY_RE.finditer(text):
        slug, name, avatar, description = m.groups()
        out.append({"slug": slug, "name": name, "avatar": avatar, "description": description})
    return out


def search_wikipedia(query: str) -> str | None:
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": 1,
    }
    r = requests.get(WP_API, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    hits = r.json().get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


def get_image_url(title: str) -> str | None:
    url = f"{WP_SUMMARY}/{urllib.parse.quote(title)}"
    r = requests.get(url, headers=HEADERS, timeout=15)
    if r.status_code != 200:
        return None
    data = r.json()
    img = data.get("originalimage") or data.get("thumbnail")
    return img.get("source") if img else None


def best_query_for(persona: dict) -> str:
    slug = persona["slug"]
    if slug in OVERRIDES:
        return OVERRIDES[slug]
    name = persona["name"]
    desc = persona["description"]
    # Append a category hint so generic names land on the right page.
    if "Marvel Comics" in desc:
        return f"{name} Marvel Comics"
    if "DC Comics" in desc:
        return f"{name} DC Comics"
    if "Game of Thrones" in desc:
        return f"{name} Game of Thrones"
    if "Vikings" in desc:
        return f"{name} Vikings History Channel"
    if "Peaky Blinders" in desc:
        return f"{name} Peaky Blinders"
    if "Breaking Bad" in desc:
        return f"{name} Breaking Bad"
    if "Sopranos" in desc:
        return f"{name} The Sopranos"
    if "Godfather" in desc:
        return f"{name} The Godfather"
    if "anime" in desc.lower():
        return f"{name} character"
    if "cartoon" in desc.lower():
        return f"{name} character"
    return name


def download_image(url: str, dest: Path) -> None:
    r = requests.get(url, headers=HEADERS, timeout=30, stream=True)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    parser.add_argument("--only", type=str, help="Comma-separated slugs to process")
    parser.add_argument("--sleep", type=float, default=0.4, help="Pause between requests in seconds")
    args = parser.parse_args()

    only = set(s.strip() for s in args.only.split(",")) if args.only else None
    entries = parse_personas()
    if only:
        entries = [e for e in entries if e["slug"] in only]
    print(f"Processing {len(entries)} personas; output -> {AVATARS_DIR}")

    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    succeeded, skipped, failed = 0, 0, []

    for i, p in enumerate(entries, 1):
        slug = p["slug"]
        dest = AVATARS_DIR / f"{slug}.jpg"
        if dest.exists() and not args.force:
            skipped += 1
            print(f"[{i}/{len(entries)}] {slug}: already present (use --force to overwrite)")
            continue
        try:
            query = best_query_for(p)
            title = search_wikipedia(query)
            if not title:
                failed.append((slug, f"no Wikipedia hit for '{query}'"))
                print(f"[{i}/{len(entries)}] {slug}: no Wikipedia hit for '{query}'")
                continue
            url = get_image_url(title)
            if not url:
                failed.append((slug, f"no image on '{title}'"))
                print(f"[{i}/{len(entries)}] {slug}: no image on '{title}'")
                continue
            download_image(url, dest)
            succeeded += 1
            print(f"[{i}/{len(entries)}] {slug}: ok (from '{title}')")
        except Exception as e:  # noqa: BLE001 - report-and-continue
            failed.append((slug, str(e)))
            print(f"[{i}/{len(entries)}] {slug}: error {e}")
        finally:
            time.sleep(args.sleep)

    print()
    print(f"Summary: {succeeded} downloaded, {skipped} skipped, {len(failed)} failed")
    if failed:
        print("Failed slugs (drop manual images into public/avatars/<slug>.jpg):")
        for slug, reason in failed:
            print(f"  - {slug}: {reason}")


if __name__ == "__main__":
    main()
