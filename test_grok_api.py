"""
Simple test script to verify XAI/Grok API connectivity and model availability.
Usage: python test_grok_api.py
Make sure XAI_API_KEY is set in your environment or .env file.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("XAI_API_KEY", "")
API_URL = os.getenv("XAI_API_URL", "https://api.x.ai/v1/chat/completions")
MODEL = os.getenv("GROK_MODEL", "grok-2")

def test_api():
    """Test the XAI API with a simple request."""
    if not API_KEY:
        print("❌ ERROR: XAI_API_KEY environment variable not set!")
        print("   Set it with: export XAI_API_KEY='your-api-key'")
        return False
    
    print(f"🔍 Testing XAI API...")
    print(f"   URL: {API_URL}")
    print(f"   Model: {MODEL}")
    print(f"   API Key: {API_KEY[:8]}...{API_KEY[-4:] if len(API_KEY) > 12 else ''}")
    print()
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant. Reply concisely."
            },
            {
                "role": "user",
                "content": "Say 'API test successful' if you can read this."
            }
        ],
        "temperature": 0.1,
        "max_tokens": 50
    }
    
    try:
        print("📡 Sending test request...")
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage = result.get("usage", {})
            
            print("✅ SUCCESS!")
            print(f"   Response: {content}")
            print(f"   Tokens used: {usage.get('total_tokens', 'N/A')}")
            return True
        else:
            print(f"❌ FAILED - HTTP {response.status_code}")
            try:
                error_body = response.text
                print(f"   Response body: {error_body}")
            except Exception:
                print("   (Could not read response body)")
            
            # Common error suggestions
            if response.status_code == 404:
                print("\n💡 Suggestions for 404 errors:")
                print("   - Check if the model name is correct (try 'grok-2' or 'grok-4')")
                print("   - Verify the API URL is correct")
            elif response.status_code == 401:
                print("\n💡 Suggestion: Check if your API key is valid")
            elif response.status_code == 429:
                print("\n💡 Suggestion: Rate limit exceeded - wait and try again")
            
            return False
            
    except requests.exceptions.Timeout:
        print("❌ TIMEOUT - Request took longer than 30 seconds")
        return False
    except requests.exceptions.ConnectionError as e:
        print(f"❌ CONNECTION ERROR - Could not reach API: {e}")
        return False
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}")
        return False

def list_available_models():
    """List available models from the API."""
    if not API_KEY:
        return
    
    print("\n🔍 Fetching available models...")
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.get("https://api.x.ai/v1/models", headers=headers, timeout=10)
        if response.status_code == 200:
            models = response.json().get("data", [])
            print(f"✅ Found {len(models)} models:")
            for model in models[:10]:  # Show first 10
                model_id = model.get("id", "unknown")
                print(f"   - {model_id}")
            if len(models) > 10:
                print(f"   ... and {len(models) - 10} more")
        else:
            print(f"⚠️  Could not fetch models (HTTP {response.status_code})")
    except Exception as e:
        print(f"⚠️  Could not fetch models: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("XAI/Grok API Test Script")
    print("=" * 60)
    print()
    
    success = test_api()
    
    if success:
        list_available_models()
    
    print()
    print("=" * 60)
    print("Test complete!")
    print("=" * 60)
