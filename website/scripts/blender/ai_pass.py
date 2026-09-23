# SDXL img2img + ControlNet (canny) over a Blender render: the render fixes every
# outline, the model repaints surfaces. usage: ai_pass.py in.png out.png [strength] [seed]
import sys, time, torch, numpy as np, cv2
from PIL import Image
from diffusers import StableDiffusionXLControlNetImg2ImgPipeline, ControlNetModel
src, out = sys.argv[1], sys.argv[2]
strength = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 7
W, H = 1536, 960
img = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
edges = cv2.Canny(np.array(img), 60, 160)
cn_img = Image.fromarray(np.stack([edges] * 3, -1))
dt = torch.float16
cn = ControlNetModel.from_pretrained('diffusers/controlnet-canny-sdxl-1.0', torch_dtype=dt, variant='fp16')
pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained('SG161222/RealVisXL_V5.0', controlnet=cn, torch_dtype=dt, variant='fp16').to('mps')
pipe.enable_attention_slicing()
prompt = ('aerial photograph of San Francisco North Beach at golden hour, oblique view, Victorian row houses '
          'with bay windows, painted facades in cream, white, pastel and grey, varied rooftops with skylights, '
          'vents and roof decks, street trees, parked cars on streets, crisp sunlight, long shadows, sharp, '
          'highly detailed, photorealistic, 8k')
neg = 'blurry, haze, fog, cartoon, painting, lowres, distorted, warped buildings, text, watermark, oversaturated'
t = time.time()
r = pipe(prompt=prompt, negative_prompt=neg, image=img, control_image=cn_img, strength=strength,
         num_inference_steps=30, guidance_scale=5.5, controlnet_conditioning_scale=0.7,
         generator=torch.Generator('cpu').manual_seed(seed)).images[0]
r.resize((1600, 1000), Image.LANCZOS).save(out)
print(f'AI {strength} seed {seed}: {time.time() - t:.0f}s')
