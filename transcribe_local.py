import os
import sys
from faster_whisper import WhisperModel

audio_path = r"c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\audio1376507227.m4a"
output_path = r"c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\audio1376507227_transcription.txt"
model_dir = r"C:\Users\Lenovo ThinkPad\.cache\huggingface\hub\models--Systran--faster-whisper-base\snapshots\ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"

print(f"Loading local Whisper model from {model_dir}...")
model = WhisperModel(model_dir, device="cpu", compute_type="int8")

print(f"Transcribing audio: {audio_path}...")
segments, info = model.transcribe(audio_path, beam_size=5)

print(f"Audio duration: {info.duration:.1f}s | Language: {info.language}")

full_text = []
for segment in segments:
    # Print progress timestamps only, NOT the private text
    print(f"Progress: {segment.end:.1f}s / {info.duration:.1f}s")
    full_text.append(segment.text.strip())

transcription = "\n".join(full_text)

with open(output_path, "w", encoding="utf-8") as f:
    f.write(transcription)

print(f"\nSUCCESS! Transcription strictly saved to file: {output_path}")
print(f"File size: {os.path.getsize(output_path)} bytes")
