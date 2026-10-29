#!/usr/bin/env python3
"""Build the synthetic scanned gazette page used by the N3 demo and smoke check.

The page is fictional (no real institution, case or person), typeset like a
special edition of an official journal: a full-width masthead, two independent
columns, a notification-deadline table, an official stamp and a signature.

    python3 scripts/make-gazette-sample.py

Requires ImageMagick (`magick`) and DejaVu fonts. The committed PNG is the
output; re-run the script only when the fixture must change.
"""

from __future__ import annotations

import pathlib
import subprocess

WIDTH = 1240
HEIGHT = 1754
MARGIN = 60
COLUMN_WIDTH = 520
GUTTER = 80
COL2_X = MARGIN + COLUMN_WIDTH + GUTTER
BODY_TOP = 218
BLOCK_GAP = 24

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "web" / "public" / "samples" / "gazette-p1.png"
WORK = ROOT / ".gazette-build"

INK = "#1a1a1a"
RED = "#a3231c"
BLUE = "#1f3b66"


def run(*args: str) -> None:
    subprocess.run(["magick", *args], check=True)


def text_block(text: str, *, width: int, size: int, font: str = "DejaVu-Serif", fill: str = INK,
               gravity: str = "west", leading: int = 5, out: pathlib.Path) -> pathlib.Path:
    run(
        "-background", "white",
        "-fill", fill,
        "-font", font,
        "-pointsize", str(size),
        "-size", f"{width}x",
        "-interline-spacing", str(leading),
        "-gravity", gravity,
        f"caption:{text}",
        str(out),
    )
    return out


def height(path: pathlib.Path) -> int:
    result = subprocess.run(["magick", "identify", "-format", "%h", str(path)], check=True, capture_output=True, text=True)
    return int(result.stdout.strip())


def rule(width: int, out: pathlib.Path) -> pathlib.Path:
    run("-size", f"{width}x2", "xc:#3a3a3a", str(out))
    return out


def table(out: pathlib.Path) -> pathlib.Path:
    rows = [
        ("INCIDENT", "AUTORITÉ", "DÉLAI"),
        ("Violation de\ndonnées", "APD", "72 heures"),
        ("Incident de\nsanté", "Ministère de la\nSanté", "Sans délai"),
        ("Cyberattaque\ncritique", "ANSSI-CM", "24 heures"),
    ]
    xs = [12, 252, 430]
    widths = [230, 168, 80]
    lines = ["0,0 519,0", "0,44 519,44", "0,92 519,92", "0,140 519,140", "0,188 519,188", "0,238 519,238",
             "0,0 0,238", "240,0 240,238", "420,0 420,238", "519,0 519,238"]
    draw = " ".join(f"line {line}" for line in lines)
    run("-size", "520x240", "xc:white", "-fill", "none", "-stroke", "#444444", "-strokewidth", "1",
        "-draw", draw, str(out))
    for index, row in enumerate(rows):
        for cell, x, width in zip(row, xs, widths):
            y = 10 + index * 48
            if index == 0:
                run(str(out), "-font", "DejaVu-Sans-Bold", "-pointsize", "12", "-fill", INK,
                    "-gravity", "northwest", "-annotate", f"+{x}+{y}", cell, str(out))
            else:
                run(str(out), "-font", "DejaVu-Sans", "-pointsize", "12", "-fill", INK,
                    "-gravity", "northwest", "-annotate", f"+{x}+{y}", cell, str(out))
    return out


def stamp(out: pathlib.Path) -> pathlib.Path:
    run(
        "-size", "230x230", "xc:none",
        "-stroke", RED, "-strokewidth", "5", "-fill", "none",
        "-draw", "circle 115,115 115,18",
        "-stroke", RED, "-strokewidth", "2",
        "-draw", "circle 115,115 115,30",
        "-font", "DejaVu-Sans-Bold", "-pointsize", "14", "-fill", RED,
        "-gravity", "center", "-annotate", "+0-36", "VU ET APPROUVÉ",
        "-font", "DejaVu-Sans", "-pointsize", "14",
        "-gravity", "center", "-annotate", "+0-2", "12 OCT. 2026",
        "-font", "DejaVu-Sans-Bold", "-pointsize", "12",
        "-gravity", "center", "-annotate", "+0+30", "SCELLÉ",
        "-rotate", "-8",
        str(out),
    )
    return out


def signature(out: pathlib.Path) -> pathlib.Path:
    run(
        "-size", "460x110", "xc:none",
        "-stroke", BLUE, "-strokewidth", "2", "-fill", "none",
        "-draw",
        "bezier 30,55 70,8 92,92 130,44 bezier 130,44 158,12 176,80 214,38 "
        "bezier 214,38 250,4 262,86 306,48 bezier 306,48 338,22 352,70 392,34",
        "-stroke", BLUE, "-strokewidth", "1",
        "-draw", "line 28,88 420,88",
        str(out),
    )
    return out


def main() -> None:
    WORK.mkdir(exist_ok=True)
    parts: list[tuple[pathlib.Path, int, int]] = []

    # ── Masthead ─────────────────────────────────────────────────────────────
    masthead = text_block(
        "RÉPUBLIQUE DU CAMEROUN",
        width=WIDTH - 2 * MARGIN, size=34, font="DejaVu-Serif-Bold", gravity="center", out=WORK / "masthead.png",
    )
    parts.append((masthead, MARGIN, 44))

    journal = text_block(
        "JOURNAL OFFICIEL DE LA RÉPUBLIQUE",
        width=WIDTH - 2 * MARGIN, size=21, font="DejaVu-Serif", gravity="center", out=WORK / "journal.png",
    )
    parts.append((journal, MARGIN, 44 + height(masthead) + 4))

    edition = text_block(
        "ÉDITION SPÉCIALE N° 47 · 12 OCTOBRE 2026",
        width=WIDTH - 2 * MARGIN, size=14, font="DejaVu-Sans", gravity="center", out=WORK / "edition.png",
    )
    parts.append((edition, MARGIN, 44 + height(masthead) + height(journal) + 12))

    divider = rule(WIDTH - 2 * MARGIN, WORK / "rule.png")
    parts.append((divider, MARGIN, 168))

    acts = text_block(
        "LOIS, DÉCRETS, ARRÊTÉS ET AUTRES ACTES",
        width=WIDTH - 2 * MARGIN, size=11, font="DejaVu-Sans", gravity="center", out=WORK / "acts.png",
    )
    parts.append((acts, MARGIN, 180))

    # ── Column 1 ─────────────────────────────────────────────────────────────
    column1 = [
        ("DÉCRET N° 2026/341 DU 08 OCTOBRE 2026", "DejaVu-Serif-Bold", 18),
        ("portant protection des données de santé à caractère personnel.", "DejaVu-Serif-Italic", 15),
        ("LE PRÉSIDENT DE LA RÉPUBLIQUE,", "DejaVu-Sans-Bold", 12),
        ("Vu la Constitution ; Vu la loi n° 2010/012 du 21 décembre 2010 relative à la cybersécurité ; "
         "Vu le décret n° 2025/118 fixant l'organisation du système national de santé numérique ;", "DejaVu-Serif", 13),
        ("ARTICLE 1er · Le présent décret s'applique à tout traitement de données de santé à caractère "
         "personnel mis en œuvre par un établissement public ou privé.", "DejaVu-Serif", 14),
        ("ARTICLE 2 · Le responsable du traitement notifie à l'Autorité nationale de protection des données "
         "toute violation de données dans un délai de soixante-douze heures après en avoir pris connaissance.",
         "DejaVu-Serif", 14),
        ("ARTICLE 3 · Les établissements de santé publics notifient sans délai le ministère de la Santé de "
         "tout incident de sécurité affectant les dossiers médicaux et préservent les traces techniques "
         "nécessaires à l'enquête.", "DejaVu-Serif", 14),
        ("ARTICLE 4 · Les infractions aux dispositions du présent décret sont punies conformément à la loi "
         "n° 2010/012.", "DejaVu-Serif", 15),
        ("ARTICLE 9 · L'Autorité nationale de protection des données publie chaque année un rapport "
         "d'activité et une synthèse des incidents notifiés, sans identifier les personnes concernées.",
         "DejaVu-Serif", 15),
        ("ARTICLE 10 · Les sous-traitants techniques déclarent à l'Autorité les traitements qu'ils mettent "
         "en œuvre pour le compte d'un établissement de santé.", "DejaVu-Serif", 15),
    ]

    y = BODY_TOP
    for index, (text, font, size) in enumerate(column1):
        block = text_block(text, width=COLUMN_WIDTH, size=size, font=font, out=WORK / f"c1-{index}.png")
        parts.append((block, MARGIN, y))
        y += height(block) + BLOCK_GAP
    column1_bottom = y

    # ── Column 2 ─────────────────────────────────────────────────────────────
    column2 = [
        ("ARTICLE 5 · Le traitement de données de santé exige le consentement écrit et éclairé de la "
         "personne concernée, sauf urgence médicale.", "DejaVu-Serif", 15),
        ("ARTICLE 6 · Les données sont conservées pour une durée maximale de dix ans à compter du dernier "
         "contact avec l'établissement.", "DejaVu-Serif", 15),
        ("ARTICLE 7 · Un audit annuel de sécurité est réalisé par un organisme indépendant agréé.",
         "DejaVu-Serif", 15),
        ("ARTICLE 11 · Toute personne concernée peut demander la rectification ou l'effacement de ses "
         "données de santé dans un délai de trente jours.", "DejaVu-Serif", 15),
    ]

    y = BODY_TOP
    for index, (text, font, size) in enumerate(column2):
        block = text_block(text, width=COLUMN_WIDTH, size=size, font=font, out=WORK / f"c2-{index}.png")
        parts.append((block, COL2_X, y))
        y += height(block) + BLOCK_GAP

    table_caption = text_block("DÉLAIS DE NOTIFICATION", width=COLUMN_WIDTH, size=11, font="DejaVu-Sans-Bold",
                               out=WORK / "table-caption.png")
    parts.append((table_caption, COL2_X, y))
    y += height(table_caption) + 6

    grid = table(WORK / "table.png")
    parts.append((grid, COL2_X, y))
    y += 240 + 28

    seal = stamp(WORK / "stamp.png")
    parts.append((seal, COL2_X + 140, y))
    y += 235

    sign = signature(WORK / "signature.png")
    parts.append((sign, COL2_X + 40, y))
    y += 100

    minister = text_block("Le Ministre de la Santé", width=COLUMN_WIDTH, size=12, font="DejaVu-Serif-Italic",
                          gravity="center", out=WORK / "minister.png")
    parts.append((minister, COL2_X, y))

    # ── Footer, confined to column 1 so it is not duplicated ─────────────────
    footer = text_block("Page 1 sur 4 · Journal officiel de la République du Cameroun",
                        width=COLUMN_WIDTH, size=10, font="DejaVu-Sans", fill="#555555",
                        out=WORK / "footer.png")
    parts.append((footer, MARGIN, HEIGHT - 60))

    # ── Compose ──────────────────────────────────────────────────────────────
    command: list[str] = ["-size", f"{WIDTH}x{HEIGHT}", "xc:white"]
    for path, x, top in parts:
        command.extend([str(path), "-geometry", f"+{x}+{top}", "-composite"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # 8-bit output: a 16-bit PNG is four times larger and PNG decoders disagree
    # on how to expose 16-bit samples.
    run(*command, "-depth", "8", "-strip", str(OUT))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
    print(f"column 1 bottom: {column1_bottom}px; column 2 bottom: {y}px")


if __name__ == "__main__":
    main()
