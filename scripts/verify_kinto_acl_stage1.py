#!/usr/bin/env python3
"""Static, non-destructive contract checks for KINTO ACL Stage 1 SQL."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
M = (ROOT / "sql/kinto-public-acl-stage1-v1.sql").read_text()
V = (ROOT / "sql/kinto-public-acl-stage1-verify-v1.sql").read_text()
R = (ROOT / "sql/kinto-public-acl-stage1-rollback-v1.sql").read_text()

def scoped_tables(text, verb, destination):
    pattern = rf"{verb} TRUNCATE, TRIGGER, REFERENCES ON TABLE\s*(.*?)\s*{destination} anon, authenticated;"
    match = re.search(pattern, text, re.S | re.I)
    assert match, f"Missing exact scoped {verb} statement"
    tables = [t.strip() for t in match.group(1).split(",")]
    assert all(re.fullmatch(r"public\.[a-z][a-z0-9_]*", t) for t in tables)
    assert len(tables) == len(set(tables)) == 23
    return set(tables)

migration = scoped_tables(M, "REVOKE", "FROM")
rollback = scoped_tables(R, "GRANT", "TO")
assert migration == rollback, "Rollback scope must equal migration scope"
verify_match = re.search(r"WITH scope\(table_name\) AS \(\s*VALUES (.*?)\s*\), roles", V, re.S)
assert verify_match, "Missing verification scope"
verify = {"public." + t for t in re.findall(r"\('([a-z][a-z0-9_]*)'\)", verify_match.group(1))}
assert verify == migration, "Read-only verification must cover exactly the migration tables"
for forbidden in [r"\bREVOKE\s+(?:SELECT|INSERT|UPDATE|DELETE)", r"\bDROP\s+POLICY", r"\bALTER\s+TABLE", r"\bDELETE\s+FROM", r"\bUPDATE\s+public\."]:
    assert not re.search(forbidden, M, re.I), f"Unexpected high-impact operation: {forbidden}"
assert "COMMIT;" in M and "BEGIN;" in M and "RAISE EXCEPTION" in M
assert "GRANT TRUNCATE" not in M
print("PASS: 23 matching tables, no CRUD/RLS changes, rollback/verification scope consistent")

# Also run session-RPC migration and JS syntax tests in the existing required CI job.
import runpy
import subprocess
runpy.run_path(str(ROOT / 'scripts/verify_kinto_session_rpc_v1.py'), run_name='__main__')
for js_file in ('js/admin-featured-requests-v2.js', 'js/admin-featured-campaigns-v1-core-v15.js'):
    subprocess.run(['node','--check',str(ROOT/js_file)],check=True)
print('PASS: session RPC migration static checks and JS syntax')
