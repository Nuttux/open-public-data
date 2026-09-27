"""Transitions agent klein pods (era keys v2): cloud/pod.py's lifecycle (watchdog = max_hours, COSTS.md, guard), PyTorch image,
RTX 4090 (community ~$0.34/h) first, then A5000 / 3090, then A40 / A6000; never L40 / L40S / 6000 Ada; MAXPRICE 0.55.
python3 pod_tr.py create <label> <max_hours>   (NETVOL=1: the network volume's datacenter first, A5000 / 3090 there)"""
import os, sys
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/cloud')
os.environ.setdefault('MAXPRICE', '0.55')
import pod
pod.GPUS = ['NVIDIA GeForce RTX 4090', 'NVIDIA RTX A5000', 'NVIDIA GeForce RTX 3090', 'NVIDIA A40', 'NVIDIA RTX A6000']   # (A40 / A6000: allowed when no 24 GB card is free)
pod.IMAGE = 'runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04'
_req = pod.req
def req(method, path, body=None, base=pod.API):
    if method == 'POST' and path == '/pods' and body:
        if body.get('cloudType') == 'SECURE': body = dict(body, gpuTypeIds=[g for g in body['gpuTypeIds'] if g in ('NVIDIA RTX A5000', 'NVIDIA GeForce RTX 3090', 'NVIDIA A40', 'NVIDIA RTX A6000')] or pod.GPUS)
        body = dict(body, containerDiskInGb=60, minVCPUPerGPU=4, minRAMPerGPU=min(body.get('minRAMPerGPU', 32), 32))
    return _req(method, path, body, base)
pod.req = req
if __name__ == '__main__':
    assert sys.argv[1] == 'create'; pod.create(sys.argv[2], sys.argv[3])
