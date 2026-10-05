"""identity.py: the parametrised era_auto copies of this folder against the originals (qipu-render-work/era_anim/auto) for San Francisco.
Each copy, with (1) every line tagged '# ERA_CITY' dropped (the added import / eval), (2) every placeholder put back as SF's literal
(EC.<NAME> -> repr of SF's value; $ERA_<NAME> -> SF's value; the FRAGS below, each one a rewrite whose SF value equals the original),
must equal the original byte for byte. Run with CITY unset:  python3 identity.py [original dir]   -> one line per file, exit 1 on a difference."""
import os, sys, re, difflib
os.environ.pop('CITY', None)
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, D); import eracity as EC
O = sys.argv[1] if len(sys.argv) > 1 else '/Users/daniel/code/qipu-render-work/era_anim/auto'
FILES = ['run_area.sh', 'auto_render.sh', 'auto_ai.sh', 'auto_jobs.py', 'keys.py', 'hybrid.py', 'check.py', 'tsw.py', 'k4r.py', 'burnmask.py']
# (05/10 V-ERAS) the prep tools (era_anim/auto/prep), city-aware copies in prep/
FILES += ['prep/' + f for f in sorted(os.listdir(f'{D}/prep')) if f.endswith(('.py', '.sh'))]
# rewrites that are not a plain literal (the copy's text -> the original's text); SF's values make them equal (checked below by eval)
FRAGS = [("' It is ' + EC.CITY_NAME + ' in %d: no modern", "' It is San Francisco in %d: no modern"),
         ("D=${0:A:h}; P=$D/prep;", "D=/Users/daniel/code/qipu-render-work/era_anim/auto; P=$D/prep;"),
         ("D=/Users/daniel/code/qipu-render-work/era_anim; P=${0:A:h};", "D=/Users/daniel/code/qipu-render-work/era_anim; P=$D/auto/prep;"),
         ("P=${0:A:h};", "P=/Users/daniel/code/qipu-render-work/era_anim/auto/prep;"),
         ("sys.path.insert(0,'${0:A:h}'); import common", "sys.path.insert(0,'/Users/daniel/code/qipu-render-work/era_anim/auto/prep'); import common"),
         ("FIRE = EC.fire_moment()", "FIRE = 1906 + 107 / 365.0"), ("    return EC.moment(Y)", "    return 1906 + 147 / 365.0 if Y == 1906 else Y + 0.5"),
         ("os.path.dirname(os.path.abspath(__file__))); import common as _CMe", "'/Users/daniel/code/qipu-render-work/era_anim/auto/prep'); import common as _CMe"),
         ("os.path.dirname(os.path.abspath(__file__))); import common as CM; S.SNAP", "'/Users/daniel/code/qipu-render-work/era_anim/auto/prep'); import common as CM; S.SNAP"),
         ("year_of = _year_of_factory() if FWJ else None", "year_of = _year_of_factory()"),
         ("(json.load(open(FWJ))['ways'] if FWJ else [])", "json.load(open(FWJ))['ways']"),
         ("' It is ' + EC.CITY_NAME + ' in %d: only cars", "' It is San Francisco in %d: only cars"),
         ("mom = EC.moment;", "mom = lambda Y: 1906 + 147 / 365.0 if Y == 1906 else Y + 0.5;"),
         ("EC.FIRE_STATE[0]", "1905"), ("EC.FIRE_STATE[1]", "1908")]
assert ' It is ' + EC.CITY_NAME + ' in %d: no modern' == ' It is San Francisco in %d: no modern' and EC.FIRE_STATE == (1905, 1908)
assert all(EC.moment(y) == (1906 + 147 / 365.0 if y == 1906 else y + 0.5) for y in (1887, 1905, 1906, 1907, 1959, 2026))
bad = 0
for f in FILES:
    s = open(f'{D}/{f}').read(); o = open(f'{O}/{f}').read()
    s = '\n'.join(l for l in s.split('\n') if not l.rstrip().endswith('# ERA_CITY'))
    for a, b in FRAGS: s = s.replace(a, b)
    s = re.sub(r'EC\.([A-Z0-9_]+)', lambda m: repr(getattr(EC, m.group(1))), s)
    s = re.sub(r'\$\{ERA_([A-Z_]+)\}|\$ERA_([A-Z_]+)', lambda m: str(getattr(EC, m.group(1) or m.group(2))), s)
    n = sum(1 for _ in difflib.unified_diff(o.split('\n'), s.split('\n'), lineterm='', n=0))
    print(f'{f:22s} {"IDENTICAL" if s == o else "DIFFERS"}  placeholders {len(re.findall(r"EC[.]|[$][{]?ERA_", open(f"{D}/{f}").read()))}')
    if s != o:
        bad = 1; sys.stdout.writelines(l + '\n' for l in list(difflib.unified_diff(o.split('\n'), s.split('\n'), lineterm='', n=0))[:12])
sys.exit(bad)
