# run_py.py <script> <work dir>: load the fp8 klein pipe as the fp8 runner does (FP8 env), then exec a workhorse-style .py job
import sys, os
src = open('/root/lr_run9v.py').read(); head = src[:src.index("Image.MAX_IMAGE_PIXELS = None; RJ")].replace("R = '/root/lr'; os.chdir(R)", "R = WH_R; os.chdir(R)")
WH_R = sys.argv[2]; g = dict(__name__='__main__', WH_R=WH_R); exec(compile(head, 'fp8head', 'exec'), g)
job = dict(__name__='__wh__', pipe=g['pipe'], WH_R=WH_R, WH_OUT='/root/lr/out', ARGS=[]); os.chdir(WH_R)
exec(compile(open(sys.argv[1]).read(), sys.argv[1], 'exec'), job); print('RUN_PY_DONE')
