#!/usr/bin/env python3
"""Validate examples and data files against the JSON Schemas of this pack.
Usage: pip install jsonschema referencing && python tools/validate.py
TypeScript contract check: npx tsc --noEmit --strict --lib es2022,dom api/worldmap.d.ts
"""
import json, glob, os, sys
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load = lambda p: json.load(open(os.path.join(ROOT, p), encoding="utf-8"))
registry = Registry()
for f in glob.glob(os.path.join(ROOT, "schemas", "*.json")):
    registry = registry.with_resource(os.path.basename(f), Resource.from_contents(json.load(open(f, encoding="utf-8"))))
failed = 0

def check(schema, instance, name):
    global failed
    errors = list(Draft202012Validator(load("schemas/" + schema), registry=registry).iter_errors(instance))
    print(("OK   " if not errors else "FAIL ") + name)
    for e in errors[:5]:
        print("   -", e.message[:160]); failed += 1

check("world-summary.schema.json", load("examples/world-summary.example.json"), "examples/world-summary.example.json")
check("battle-test-config.schema.json", load("examples/battle-test-config.example.json"), "examples/battle-test-config.example.json")
check("battle-test.schema.json", load("examples/battle-test.example.json"), "examples/battle-test.example.json")
check("watch-proposal.schema.json", load("examples/watch-proposal.example.json"), "examples/watch-proposal.example.json")
check("watch-proposal.schema.json", load("examples/watch-proposal-subnational.example.json"), "examples/watch-proposal-subnational.example.json")
check("watch-bundle.schema.json", load("examples/watch-bundle.example.json"), "examples/watch-bundle.example.json")
check("world-settings.schema.json", load("data/world-settings.example.json"), "data/world-settings.example.json")
for f in sorted(glob.glob(os.path.join(ROOT, "data/*.json"))):
    json.load(open(f, encoding="utf-8")); print("OK   " + os.path.relpath(f, ROOT) + " (valid JSON)")
sys.exit(1 if failed else 0)
