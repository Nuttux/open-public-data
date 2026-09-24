# blender -b -P audit_open.py -P hq_city.py -- ...  : logs every file/dir Python opens,
# plus the images/libraries Blender loads, to $AUDIT_LOG (one path per line, deduped).
import sys, os, atexit
LOG = os.environ.get('AUDIT_LOG', '/tmp/audit_open.txt'); seen = set()
def hook(ev, args):
    if ev in ('open', 'os.listdir', 'os.scandir', 'glob.glob', 'np.load') and args:
        p = args[0]
        if isinstance(p, bytes): p = p.decode(errors='replace')
        if isinstance(p, str) and p not in seen: seen.add(p)
sys.addaudithook(hook)
def dump(*_a):
    try:
        import bpy
        for im in bpy.data.images: seen.add('IMG ' + bpy.path.abspath(im.filepath))
        for lb in bpy.data.libraries: seen.add('LIB ' + bpy.path.abspath(lb.filepath))
    except Exception as e: seen.add('ERR ' + repr(e))
    with open(LOG, 'w') as f: f.write('\n'.join(sorted(seen)) + '\n')
atexit.register(dump)
try:
    import bpy; bpy.app.handlers.render_complete.append(dump)
except Exception: pass
