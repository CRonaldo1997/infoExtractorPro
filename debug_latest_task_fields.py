import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Guessing env paths based on project structure
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    # Try reading from backend/.env
    with open("backend/.env") as f:
        for line in f:
            if "SUPABASE_URL=" in line:
                SUPABASE_URL = line.split("=")[1].strip().strip('"')
            if "SUPABASE_SERVICE_ROLE_KEY=" in line:
                SUPABASE_KEY = line.split("=")[1].strip().strip('"')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Get the prompt set used in the latest task
res_task = supabase.table("tasks").select("*").order("created_at", desc=True).limit(1).execute()
if res_task.data:
    row = res_task.data[0]
    prompt_set_id = row.get("prompt_set_id")
    print(f"Latest Task: {row['id']}, Prompt Set: {prompt_set_id}")
    
    if prompt_set_id:
        res_fields = supabase.table("fields").select("*").eq("prompt_set_id", prompt_set_id).execute()
        for f in res_fields.data:
            print(f"- Field: {f['name']} (ID: {f['id']})")
else:
    print("No tasks found.")
