"""Offline, non-neural export fallback using Piper's bundled GPL eSpeak NG."""
import ctypes
from pathlib import Path
import sys
import wave
import onnxruntime
onnxruntime.disable_telemetry_events()
import piper

def synthesize(text: str, output: Path, voice: str = 'en-us', speed: float = 1.0):
    root = Path(piper.__file__).parent
    lib = ctypes.CDLL(str(root / 'espeakbridge.so'))
    lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    rate = lib.espeak_Initialize(2, 0, str(root).encode(), 0)
    if rate <= 0:
        raise RuntimeError('eSpeak initialization failed')
    pcm = bytearray()
    callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    def callback(samples, count, events):
        if samples and count:
            pcm.extend(ctypes.string_at(samples, count * 2))
        return 0
    cb = callback_type(callback)
    lib.espeak_SetSynthCallback(cb)
    lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
    if lib.espeak_SetVoiceByName(voice.encode()) != 0:
        raise RuntimeError('eSpeak voice not available')
    lib.espeak_SetParameter(1, int(175 * speed), 0)
    raw = text.encode('utf-8') + b'\0'
    lib.espeak_Synth.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    if lib.espeak_Synth(raw, len(raw), 0, 1, 0, 1, None, None) != 0:
        raise RuntimeError('eSpeak synthesis failed')
    lib.espeak_Synchronize()
    with wave.open(str(output), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)

if __name__ == '__main__':
    synthesize(sys.stdin.read(), Path(sys.argv[1]), sys.argv[2], float(sys.argv[3]))
