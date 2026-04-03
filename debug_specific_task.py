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

# Search task by name or ID
# The user's screenshot shows "clause_4FD1..." which likely looks like a task name.
res = supabase.table("tasks").select("*").ilike("name", "%4FD1F6B7%").execute()
print(f"Tasks: {res.data}")

if res.data:
    task_id = res.data[0]['id']
    # Check files in this task
    res_files = supabase.table("files").select("*").eq("task_id", task_id).execute()
    for f in res_files.data:
        print(f"File {f['id']} ({f['name']}): {f['status']}")
