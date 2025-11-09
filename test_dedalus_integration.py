"""
Test script for Dedalus Labs integration with playwright MCP server.
"""
import asyncio
import os
from dedalus_labs import AsyncDedalus, DedalusRunner
from dotenv import load_dotenv

load_dotenv()

async def test_dedalus():
    """Test basic Dedalus functionality with web search."""
    api_key = os.getenv("DEDALUS_API_KEY")
    
    if not api_key:
        print("❌ ERROR: DEDALUS_API_KEY not set in environment")
        print("   Set it in your .env file or with: export DEDALUS_API_KEY='your-key'")
        return False
    
    print("=" * 70)
    print("Dedalus Labs Integration Test")
    print("=" * 70)
    print()
    print(f"🔑 API Key: {api_key[:20]}...")
    print(f"🤖 Model: openai/gpt-4o-mini")
    print(f"🔧 MCP Servers: windsor/playwright-mcp")
    print()
    
    try:
        print("📡 Initializing Dedalus client...")
        client = AsyncDedalus(api_key=api_key)
        runner = DedalusRunner(client)
        
        print("✅ Client initialized")
        print()
        print("🧪 Running test query (with web search capabilities)...")
        print("   Query: 'What are common aviation safety concerns for low altitude flight?'")
        print()
        
        response = await runner.run(
            input="What are common aviation safety concerns for low altitude flight? Provide 2-3 key points.",
            model="openai/gpt-4o-mini",
            mcp_servers=["windsor/playwright-mcp"]
        )
        
        print("✅ SUCCESS! Dedalus API responded")
        print()
        print("📝 Response:")
        print("-" * 70)
        print(response.final_output)
        print("-" * 70)
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_simple_completion():
    """Test simple completion without MCP servers."""
    api_key = os.getenv("DEDALUS_API_KEY")
    
    if not api_key:
        return False
    
    print("\n" + "=" * 70)
    print("Simple Completion Test (No MCP)")
    print("=" * 70)
    print()
    
    try:
        client = AsyncDedalus(api_key=api_key)
        runner = DedalusRunner(client)
        
        print("🧪 Running simple test...")
        response = await runner.run(
            input="Generate a JSON object with a 'tasks' key containing an empty array. Return ONLY the JSON.",
            model="openai/gpt-4o-mini"
        )
        
        print("✅ SUCCESS!")
        print(f"Response: {response.final_output[:100]}...")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        return False

if __name__ == "__main__":
    print("\nTesting Dedalus Labs Integration...")
    print()
    
    # Run both tests
    result1 = asyncio.run(test_simple_completion())
    result2 = asyncio.run(test_dedalus())
    
    print()
    print("=" * 70)
    print("Test Summary")
    print("=" * 70)
    print(f"Simple completion: {'✅ PASS' if result1 else '❌ FAIL'}")
    print(f"Web search test: {'✅ PASS' if result2 else '❌ FAIL'}")
    print()
    
    if result1 and result2:
        print("🎉 All tests passed! Dedalus is ready to use.")
    else:
        print("⚠️  Some tests failed. Check the error messages above.")
    print()
