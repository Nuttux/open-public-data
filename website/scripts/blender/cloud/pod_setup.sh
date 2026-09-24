#!/bin/bash
# ON THE POD (run by pod.sh over ssh). Idempotent. Installs Blender 5.2.2 (same as the Mac), the libs it
# needs, and maps the Mac's absolute paths onto QIPU_ROOT so a snapshot runs unchanged:
#   /Users/daniel/code/qipu-render-work          -> $QIPU_ROOT/qw
#   /Users/daniel/code/qipu-assets, ~/code/qipu-assets -> $QIPU_ROOT/assets
#   /Users/daniel/code/opd-render/website/public/data/us/sf/city -> $QIPU_ROOT/pubcity
set -e
R=${QIPU_ROOT:-/root/q}; mkdir -p $R/qw $R/assets $R/pubcity
if [ ! -x $R/blender/blender ]; then
  (apt-get update -qq && apt-get install -y -qq libxi6 libxkbcommon0 libsm6 libgl1 libxrender1 libxxf86vm1 libxfixes3 libegl1 rsync xz-utils zstd python3 python3-numpy python3-pil >/dev/null) 2>&1 | tail -2
  cd $R && curl -sSL https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz | tar -xJ && mv blender-5.2.2-linux-x64 blender
fi
python3 -c "import numpy, PIL" 2>/dev/null && command -v rsync >/dev/null && command -v zstd >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync zstd python3-numpy python3-pil libxi6 libxkbcommon0 libsm6 libgl1 libxrender1 libxxf86vm1 libxfixes3 libegl1 >/dev/null)
mkdir -p /Users/daniel/code/opd-render/website/public/data/us/sf /root/code
ln -sfn $R/qw /Users/daniel/code/qipu-render-work
ln -sfn $R/assets /Users/daniel/code/qipu-assets; ln -sfn $R/assets /root/code/qipu-assets
ln -sfn $R/pubcity /Users/daniel/code/opd-render/website/public/data/us/sf/city
ln -sf $R/blender/blender /usr/local/bin/blender
blender --version | head -1
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
free -g | awk '/Mem/ {print "RAM", $2 " GB"}'
echo "container RAM limit $(( $(cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes) / 1073741824 )) GB, vCPU $(nproc)"
# device warm-up in the background (it overlaps the upload): renders a tiny scene with OptiX, which also compiles
# and caches the OptiX kernels; if OptiX fails, CUDA is tried. pod_render.sh waits for $R/device and uses it.
cat > $R/warm.py <<'PY'
import bpy, os, sys
d = os.environ['DEV']; p = bpy.context.preferences.addons['cycles'].preferences
p.compute_device_type = d; p.get_devices()
for v in p.devices: v.use = v.type != 'CPU'
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'; sc.cycles.samples = 4
sc.render.resolution_x = sc.render.resolution_y = 64; sc.cycles.denoising_use_gpu = True
sc.render.filepath = '/tmp/warm.png'; bpy.ops.render.render(write_still=True)
print('WARM_OK', d, [v.name for v in p.devices if v.use])
PY
rm -f $R/device
nohup bash -c "for D in OPTIX CUDA; do DEV=\$D blender -b --factory-startup -P $R/warm.py > $R/warm_\$D.log 2>&1; grep -q WARM_OK $R/warm_\$D.log && { echo \$D > $R/device; exit; }; done; echo NONE > $R/device" > /dev/null 2>&1 &
