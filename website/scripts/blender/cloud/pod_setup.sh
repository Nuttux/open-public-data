#!/bin/bash
# ON THE POD (run by pod.sh over ssh). Idempotent. Installs Blender 5.2.2 (same as the Mac), the libs it
# needs, and maps the Mac's absolute paths onto QIPU_ROOT so a snapshot runs unchanged:
#   /Users/daniel/code/qipu-render-work          -> $QIPU_ROOT/qw
#   /Users/daniel/code/qipu-assets, ~/code/qipu-assets -> $QIPU_ROOT/assets
#   /Users/daniel/code/opd-render/website/public/data/us/sf/city -> $QIPU_ROOT/pubcity
set -e
R=${QIPU_ROOT:-/workspace}; mkdir -p $R/qw $R/assets $R/pubcity
if [ ! -x $R/blender/blender ]; then
  (apt-get update -qq && apt-get install -y -qq libxi6 libxkbcommon0 libsm6 libgl1 libxrender1 libxxf86vm1 libxfixes3 libegl1 rsync xz-utils >/dev/null) 2>&1 | tail -2
  cd $R && curl -sSL https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz | tar -xJ && mv blender-5.2.2-linux-x64 blender
fi
command -v rsync >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync libxi6 libxkbcommon0 libsm6 libgl1 libxrender1 libxxf86vm1 libxfixes3 libegl1 >/dev/null)
mkdir -p /Users/daniel/code/opd-render/website/public/data/us/sf /root/code
ln -sfn $R/qw /Users/daniel/code/qipu-render-work
ln -sfn $R/assets /Users/daniel/code/qipu-assets; ln -sfn $R/assets /root/code/qipu-assets
ln -sfn $R/pubcity /Users/daniel/code/opd-render/website/public/data/us/sf/city
ln -sf $R/blender/blender /usr/local/bin/blender
blender --version | head -1
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
free -g | awk '/Mem/ {print "RAM", $2 " GB"}'
