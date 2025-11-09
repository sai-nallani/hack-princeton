"""
Generate audio files for specific task IDs
"""
import json
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs import ElevenLabs

load_dotenv()

TASKS_FILE = Path(__file__).parent / "services" / "tasks.json"
AUDIO_DIR = Path(__file__).parent / "services" / "audio"

async def generate_audio_for_task_standalone(task_id: int, pilot_message: str) -> str | None:
    """Generate audio file for a task's pilot message using ElevenLabs TTS."""
    try:
        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            print(f"❌ ElevenLabs API key not found in environment")
            return None
        
        client = ElevenLabs(api_key=api_key)
        filename = f"task_{task_id}.mp3"
        filepath = AUDIO_DIR / filename
        
        # Generate audio
        print(f"🔊 Generating audio for task {task_id}...")
        audio_generator = client.text_to_speech.convert(
            voice_id="JBFqnCBsd6RMkjVDRZzb",
            output_format="mp3_44100_128",
            text=pilot_message,
            model_id="eleven_multilingual_v2"
        )
        audio_data = b"".join(audio_generator)
        
        # Save to file
        with open(filepath, 'wb') as f:
            f.write(audio_data)
        
        print(f"✓ Audio saved: {filename}")
        return filename
        
    except Exception as e:
        print(f"❌ Error generating audio for task {task_id}: {e}")
        return None

async def generate_audio_for_ids(task_ids: list[int]):
    """Generate audio for specific task IDs"""
    
    # Load tasks
    with open(TASKS_FILE, 'r') as f:
        tasks = json.load(f)
    
    # Find tasks with these IDs
    target_tasks = [t for t in tasks if t.get('id') in task_ids]
    
    if not target_tasks:
        print(f"❌ No tasks found with IDs: {task_ids}")
        return
    
    print(f"Found {len(target_tasks)} tasks to generate audio for:")
    for task in target_tasks:
        print(f"  - ID {task['id']}: {task.get('aircraft_callsign')} - {task.get('priority')} - {task.get('category')}")
    
    # Generate audio for each task
    generated_count = 0
    for task in target_tasks:
        task_id = task['id']
        pilot_message = task.get('pilot_message')
        
        if not pilot_message:
            print(f"⚠️  Task {task_id} has no pilot_message, skipping")
            continue
        
        audio_filename = await generate_audio_for_task_standalone(task_id, pilot_message)
        
        if audio_filename:
            # Update the task in the JSON
            task['audio_file'] = audio_filename
            generated_count += 1
        else:
            print(f"❌ Failed to generate audio for task {task_id}")
    
    # Save updated tasks back to file
    if generated_count > 0:
        with open(TASKS_FILE, 'w') as f:
            json.dump(tasks, f, indent=2)
        print(f"\n✓ Successfully generated {generated_count} audio files")
        print(f"✓ Updated {TASKS_FILE}")
    else:
        print("\n❌ No audio files were generated")

if __name__ == "__main__":
    # Task IDs to generate audio for
    target_ids = [289097, 594248, 511183]
    
    print("=" * 60)
    print("Audio Generation Script")
    print("=" * 60)
    print(f"Target task IDs: {target_ids}\n")
    
    asyncio.run(generate_audio_for_ids(target_ids))
