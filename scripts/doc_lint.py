"""doc_lint — mechanical checks for the project documentation framework.

Checks what `references/framework.md` asserts and nothing enforces. Scoped to
the LIVING surface (guide, adapter, glossary, runbooks, folder READMEs) plus the
decision records, so ephemera (specs, plans, archives) never generate noise.

Checks:
  file-refs      linked / backticked repo paths in living docs exist
  decisions      frontmatter valid (status, date, deciders), supersedes resolves,
                 index.json regenerated from frontmatter
  archive-links  no living doc links into an archive dir
  archive-banner every archived .md starts with the "> Archived" banner
  readme-map     every folder README is named in the guide's directory map
  forbidden      no status doc, open-questions doc, or handoff dir exists;
                 no living doc carries a pending/status section
  cap            guide + adapter stay under the token cap
  sql-objects    (opt-in) typed-prefix object names in living docs exist in sql/

Usage:
    python doc_lint.py                 # report to stdout
    python doc_lint.py --strict        # exit 1 on any finding (CI / hook)
    python doc_lint.py --report        # also write DOC_LINT.md at repo root
    python doc_lint.py --config path   # default: <repo>/doc-lint.toml

Stdlib only (Python 3.11+ for tomllib). Repo root = the directory holding
doc-lint.toml, found by walking up from cwd.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import tomllib
from datetime import date
from pathlib import Path

DEFAULTS: dict = {
    "guide": "AGENTS.md",
    "adapter": ".github/instructions/ai-workflow.instructions.md",
    "glossary": "CONTEXT.md",
    "decisions": "docs/decisions",
    "living": ["README.md", "docs/runbooks"],
    "archive_dirs": ["_archive"],
    "ephemera": ["docs/specs", "docs/plans", "docs/research", "docs/maps",
                 "docs/superpowers", ".scratch", ".superpowers"],
    "skip_dirs": [".git", "node_modules", ".venv", "__pycache__", ".pytest_cache",
                  "dist", "build", ".claude", ".snowflake", "test-results"],
    "forbidden_paths": ["docs/handoffs", "docs/STATUS.md", "docs/open-questions.md"],
    "token_cap": 2000,
    "checks": {"sql_objects": False},
    "sql": {"dir": "sql", "object_pattern": ""},
}

PATH_TOKEN = re.compile(
    r"(?:\]\(|`)((?:[\w.\-]+/)*[\w.\-]+\.(?:sql|py|md|csv|js|ts|tsx|json|yml|yaml|toml|txt|sh|ps1|html|css))(?:\)|`|#)")
STATUS_FILENAME = re.compile(
    r"(progress|status|open-questions|open_questions|handoff|continuation)", re.I)
STATUS_HEADING = re.compile(
    r"^#{2,4}\s.*\b(open questions?|continuation point|remaining (work|gates?)|"
    r"implementation progress|current status|latest verification|next steps)\b", re.I)
DECISION_STATUSES = {"accepted", "superseded"}
DECISION_TYPES = {"design", "business_rule", "structural"}
BANNER = re.compile(r"^> Archived \d{4}-\d{2}-\d{2}")


# ---------------------------------------------------------------- setup

def find_repo(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / "doc-lint.toml").exists():
            return p
    sys.exit("doc_lint: no doc-lint.toml found walking up from cwd")


def load_config(repo: Path, path: Path | None) -> dict:
    cfg = json.loads(json.dumps(DEFAULTS))  # deep copy
    cfg_path = path or repo / "doc-lint.toml"
    if cfg_path.exists():
        user = tomllib.loads(cfg_path.read_text(encoding="utf-8"))
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    return cfg


class Lint:
    def __init__(self, repo: Path, cfg: dict):
        self.repo = repo
        self.cfg = cfg
        self.guide = repo / cfg["guide"]
        self.adapter = repo / cfg["adapter"]
        self.decisions_dir = repo / cfg["decisions"]
        self.living = self._living_docs()

    # -- helpers
    def rel(self, p: Path) -> str:
        return p.relative_to(self.repo).as_posix()

    def read(self, p: Path) -> str:
        return p.read_text(encoding="utf-8", errors="ignore")

    def in_skipped(self, p: Path) -> bool:
        rel = self.rel(p)
        parts = set(p.relative_to(self.repo).parts)
        if parts & set(self.cfg["skip_dirs"]):
            return True
        if parts & set(self.cfg["archive_dirs"]):
            return True
        return any(rel == e or rel.startswith(e + "/") for e in self.cfg["ephemera"])

    def _living_docs(self) -> list[Path]:
        out: list[Path] = []
        candidates = [self.guide, self.adapter, self.repo / self.cfg["glossary"]]
        for entry in self.cfg["living"]:
            p = self.repo / entry
            if p.is_dir():
                candidates += sorted(p.rglob("*.md"))
            else:
                candidates.append(p)
        candidates += sorted(self.repo.rglob("README.md"))
        for p in candidates:
            if p.exists() and p.is_file() and not self.in_skipped(p) and p not in out:
                out.append(p)
        return out

    # -- checks
    def check_file_refs(self) -> list[str]:
        findings = []
        all_files = [self.rel(p) for p in self.repo.rglob("*")
                     if p.is_file() and not (set(p.relative_to(self.repo).parts)
                                             & set(self.cfg["skip_dirs"]))]
        for doc in self.living:
            text = self.read(doc)
            for m in PATH_TOKEN.finditer(text):
                ref = m.group(1)
                if ref.startswith(("http", "www.")) or "*" in ref or "<" in ref:
                    continue
                ref = ref.removeprefix("./")
                if (doc.parent / ref).exists() or (self.repo / ref).exists():
                    continue
                if any(f.endswith("/" + ref) or f == ref for f in all_files):
                    continue
                f = f"{self.rel(doc)}: referenced path does not exist: `{ref}`"
                if f not in findings:
                    findings.append(f)
        return findings

    def check_decisions(self) -> list[str]:
        findings = []
        if not self.decisions_dir.exists():
            return [f"{self.cfg['decisions']}/ missing"]
        records: dict[str, dict] = {}
        files = sorted(p for p in self.decisions_dir.glob("*.md")
                       if not set(p.parts) & set(self.cfg["archive_dirs"]))
        for p in files:
            rel = self.rel(p)
            fm = parse_frontmatter(self.read(p))
            if fm is None:
                findings.append(f"{rel}: no YAML frontmatter")
                continue
            slug = p.stem
            for key in ("status", "date", "deciders"):
                if key not in fm or fm[key] in ("", [], None):
                    findings.append(f"{rel}: frontmatter missing `{key}`")
            if fm.get("status") not in DECISION_STATUSES:
                findings.append(f"{rel}: status must be one of {sorted(DECISION_STATUSES)}")
            if not valid_date(fm.get("date")):
                findings.append(f"{rel}: date is not ISO (YYYY-MM-DD)")
            if fm.get("type") and fm["type"] not in DECISION_TYPES:
                findings.append(f"{rel}: type must be one of {sorted(DECISION_TYPES)}")
            sup = fm.get("supersedes")
            if sup:
                target = self.decisions_dir / f"{sup}.md"
                if not target.exists():
                    findings.append(f"{rel}: supersedes `{sup}` which does not exist")
                else:
                    tfm = parse_frontmatter(self.read(target)) or {}
                    if tfm.get("status") != "superseded":
                        findings.append(
                            f"{self.rel(target)}: superseded by {slug} but status is not `superseded`")
            records[slug] = {
                "title": first_heading(self.read(p)),
                "status": fm.get("status"),
                "date": fm.get("date"),
                "deciders": as_list(fm.get("deciders")),
                "type": fm.get("type"),
                "supersedes": sup or None,
                "path": rel,
            }
        index_path = self.decisions_dir / "index.json"
        new = json.dumps(records, indent=2, ensure_ascii=False) + "\n"
        old = index_path.read_text(encoding="utf-8") if index_path.exists() else ""
        if new != old:
            index_path.write_text(new, encoding="utf-8")
            findings.append(f"{self.rel(index_path)}: regenerated (was stale) — commit it")
        return findings

    def check_archive_links(self) -> list[str]:
        findings = []
        names = self.cfg["archive_dirs"]
        pat = re.compile(r"(?:\]\(|`)([^)`\s]*(?:" + "|".join(map(re.escape, names)) + r")/[^)`\s]+)")
        for doc in self.living:
            for m in pat.finditer(self.read(doc)):
                findings.append(f"{self.rel(doc)}: living doc links into an archive: `{m.group(1)}`")
        return findings

    def check_archive_banner(self) -> list[str]:
        findings = []
        for name in self.cfg["archive_dirs"]:
            for d in self.repo.rglob(name):
                if not d.is_dir() or set(d.relative_to(self.repo).parts) & set(self.cfg["skip_dirs"]):
                    continue
                for p in d.rglob("*.md"):
                    head = self.read(p).lstrip().splitlines()[:3]
                    if not any(BANNER.match(line) for line in head):
                        findings.append(f"{self.rel(p)}: archived file lacks `> Archived YYYY-MM-DD — …` banner")
        return findings

    def check_readme_map(self) -> list[str]:
        findings = []
        if not self.guide.exists():
            return [f"guide `{self.cfg['guide']}` missing"]
        guide = self.read(self.guide)
        for p in sorted(self.repo.rglob("README.md")):
            if p.parent == self.repo or self.in_skipped(p):
                continue
            folder = self.rel(p.parent)
            if f"`{folder}/`" in guide or f"`{folder}`" in guide or f"`{p.parent.name}/`" in guide:
                continue
            findings.append(
                f"{self.rel(p)}: folder `{folder}/` is not in the guide's directory map "
                f"(add the row, or drop the README if no trigger applies)")
        return findings

    def check_forbidden(self) -> list[str]:
        findings = []
        for f in self.cfg["forbidden_paths"]:
            if (self.repo / f).exists():
                findings.append(f"`{f}` exists — status and pending items belong in the tracker")
        docs_dir = self.repo / "docs"
        if docs_dir.exists():
            for p in sorted(docs_dir.rglob("*.md")):
                if self.in_skipped(p) or p.is_relative_to(self.decisions_dir):
                    continue
                if STATUS_FILENAME.search(p.name):
                    findings.append(
                        f"{self.rel(p)}: status-shaped document — its rows belong in the tracker; "
                        f"archive or delete the file")
        for doc in self.living:
            for line in self.read(doc).splitlines():
                if STATUS_HEADING.match(line):
                    findings.append(
                        f"{self.rel(doc)}: section `{line.strip('# ').strip()}` looks like "
                        f"status/pending content — move it to the tracker")
        return findings

    def check_cap(self) -> list[str]:
        words = 0
        for p in (self.guide, self.adapter):
            if p.exists():
                words += len(self.read(p).split())
        tokens = int(words * 1.35)
        if tokens > self.cfg["token_cap"]:
            return [f"guide + adapter ≈ {tokens} tokens, over the {self.cfg['token_cap']} cap"]
        return []

    def check_sql_objects(self) -> list[str]:
        if not self.cfg["checks"].get("sql_objects"):
            return []
        pat = self.cfg["sql"].get("object_pattern")
        if not pat:
            return ["checks.sql_objects is on but sql.object_pattern is empty"]
        token = re.compile(pat)
        sql_text = "\n".join(
            self.read(p).upper() for p in (self.repo / self.cfg["sql"]["dir"]).rglob("*.sql")
            if not set(p.parts) & set(self.cfg["archive_dirs"]))
        findings = []
        for doc in self.living:
            for t in sorted(set(token.findall(self.read(doc)))):
                if t not in sql_text:
                    findings.append(f"{self.rel(doc)}: object `{t}` not found under {self.cfg['sql']['dir']}/")
        return findings


# ---------------------------------------------------------------- utils

def parse_frontmatter(text: str) -> dict | None:
    """Minimal YAML subset: `key: value`, `key: [a, b]`, `key:` (null)."""
    lines = text.lstrip().splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    out: dict = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return out
        if ":" not in line or line.startswith((" ", "\t", "#")):
            continue
        key, _, val = line.partition(":")
        val = val.split(" #", 1)[0].strip()
        if val.startswith("[") and val.endswith("]"):
            out[key.strip()] = [v.strip().strip("'\"") for v in val[1:-1].split(",") if v.strip()]
        else:
            out[key.strip()] = val.strip("'\"") or None
    return None


def as_list(v) -> list:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def valid_date(v) -> bool:
    try:
        return isinstance(v, str) and bool(date.fromisoformat(v))
    except ValueError:
        return False


def first_heading(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="exit 1 on any finding")
    ap.add_argument("--report", action="store_true", help="write DOC_LINT.md at repo root")
    ap.add_argument("--config", type=Path)
    args = ap.parse_args()

    repo = find_repo(Path.cwd())
    lint = Lint(repo, load_config(repo, args.config))
    sections = {
        "file-refs": lint.check_file_refs(),
        "decisions": lint.check_decisions(),
        "archive-links": lint.check_archive_links(),
        "archive-banner": lint.check_archive_banner(),
        "readme-map": lint.check_readme_map(),
        "forbidden": lint.check_forbidden(),
        "cap": lint.check_cap(),
        "sql-objects": lint.check_sql_objects(),
    }
    total = sum(len(v) for v in sections.values())
    lines = [f"# Doc Lint — {time.strftime('%Y-%m-%d %H:%M')}", "",
             f"**{total} finding(s)** across {len(lint.living)} living docs.", ""]
    for name, items in sections.items():
        lines.append(f"## {name} ({len(items)})")
        lines += [f"- {i}" for i in items] or ["- clean"]
        lines.append("")
    report = "\n".join(lines)
    print(report)
    if args.report:
        (repo / "DOC_LINT.md").write_text(report, encoding="utf-8")
    return 1 if (args.strict and total) else 0


if __name__ == "__main__":
    sys.exit(main())
