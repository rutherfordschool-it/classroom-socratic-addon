import os
import sys
import json
import requests

proxies = {
    "http": "http://127.0.0.1:10808",
    "https": "http://127.0.0.1:10808"
}

key = os.environ.get("GEMINI_API_KEY", "")

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({"error": "Empty input to runner"}))
            return

        data = json.loads(raw_input)
        system_prompt = data.get("systemPrompt", "")
        messages = data.get("messages", [])
        model = data.get("model", "gemini-3.1-flash-lite")

        # Format contents
        contents = []
        for m in messages:
            role = "model" if m.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})

        payload = {
            "contents": contents
        }
        if system_prompt:
            payload["systemInstruction"] = {
                "parts": [{"text": system_prompt}]
            }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        resp = requests.post(url, json=payload, proxies=proxies, timeout=25)

        if resp.status_code != 200:
            print(json.dumps({"error": f"API Error {resp.status_code}: {resp.text}"}))
            return

        res_json = resp.json()
        text = res_json["candidates"][0]["content"]["parts"][0]["text"]
        print(json.dumps({"text": text}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
