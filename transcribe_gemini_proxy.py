import base64
import os
import sys
import requests

key = os.environ.get("GEMINI_API_KEY", "")
audio_path = r"c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\audio1376507227.m4a"
output_path = r"c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\audio1376507227_gemini.txt"

proxies = {
    "http": "http://127.0.0.1:10808",
    "https": "http://127.0.0.1:10808"
}

print(f"Reading audio file: {audio_path}...")
with open(audio_path, "rb") as f:
    audio_bytes = f.read()

audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
print(f"Base64 encoded size: {len(audio_b64)} chars. Sending to Gemini API (gemini-3.1-flash-lite)...")
sys.stdout.flush()

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={key}"

payload = {
    "contents": [
        {
            "parts": [
                {
                    "inline_data": {
                        "mime_type": "audio/mp4",
                        "data": audio_b64
                    }
                },
                {
                    "text": (
                        "Сделай полную, дословную, максимально точную расшифровку (транскрипцию) этой аудиозаписи на русском языке. "
                        "Не сокращай, не пересказывай. Запиши только расшифрованный текст без лишних вступительных слов."
                    )
                }
            ]
        }
    ],
    "generationConfig": {
        "maxOutputTokens": 8192
    }
}

resp = requests.post(url, json=payload, proxies=proxies, timeout=120)

if resp.status_code != 200:
    print(f"API Error {resp.status_code}: {resp.text[:500]}")
    sys.exit(1)

data = resp.json()
try:
    transcription = data["candidates"][0]["content"]["parts"][0]["text"]
except Exception as e:
    print(f"Failed to extract transcription: {e}")
    print(data)
    sys.exit(1)

with open(output_path, "w", encoding="utf-8") as f:
    f.write(transcription)

print(f"\nSUCCESS! Transcription strictly saved to file: {output_path}")
print(f"File size: {os.path.getsize(output_path)} bytes")
