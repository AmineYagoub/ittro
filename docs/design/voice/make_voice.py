"""Record the English and French direction clips in clips.json with Meta's MMS-TTS.

Needs torch and transformers. Usage: python make_voice.py [models_dir]
Arabic is not recorded here: the app makes the Arabic clips with the phone's own voice on first launch.
"""
import json, os, re, struct, sys, wave

import torch
from transformers import AutoTokenizer, VitsModel

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = sys.argv[1] if len(sys.argv) > 1 else None
CLIPS = json.load(open(os.path.join(HERE, "clips.json")))["clips"]
PAUSE = {"sentence": 0.3, "comma": 0.12}
EDGE = 0.01  # seconds of silence kept before and after the voice, so the clip starts at once

def speak(model, tok, text, rate):
    """MMS ignores punctuation, so speak each phrase alone and add the pause the punctuation asks for."""
    text = text.replace("’", "'")
    out = []
    for chunk, mark in re.findall(r"([^.,:?!]+)([.,:?!]*)", text):
        if not chunk.strip():
            continue
        torch.manual_seed(0)
        with torch.no_grad():
            out += model(**tok(chunk.strip(), return_tensors="pt")).waveform[0].tolist()
        out += [0.0] * int(PAUSE["comma" if mark == "," else "sentence"] * rate)
    return out

def trim(samples, rate, floor=0.02):
    limit = floor * max(abs(x) for x in samples)
    loud = [i for i, v in enumerate(samples) if abs(v) > limit]
    pad = int(EDGE * rate)
    return samples[max(0, loud[0] - pad):loud[-1] + pad]

for lang, code in {"en": "eng", "fr": "fra"}.items():
    name = f"facebook/mms-tts-{code}"
    tok = AutoTokenizer.from_pretrained(name, cache_dir=MODELS)
    model = VitsModel.from_pretrained(name, cache_dir=MODELS).eval()
    rate = model.config.sampling_rate
    vocab = set(tok.get_vocab())
    for clip in CLIPS:
        dropped = {c for c in clip[lang].lower().replace("’", "'") if c not in vocab and c not in " .,:?!"}
        if dropped:
            print(f"{clip['id']}.{lang}: MMS can't say {''.join(sorted(dropped))!r}", file=sys.stderr)
        samples = trim(speak(model, tok, clip[lang], rate), rate)
        peak = max(abs(v) for v in samples)
        with wave.open(os.path.join(HERE, f"{clip['id']}.{lang}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
            w.writeframes(b"".join(struct.pack("<h", int(v / peak * 0.89 * 32767)) for v in samples))
        print(f"{clip['id']}.{lang}.wav\t{len(samples) / rate:.2f} s")
