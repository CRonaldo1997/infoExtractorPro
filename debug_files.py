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

# Check all files order by updated_at
res = supabase.table("files").select("id, name, status, updated_at").order("updated_at", desc=True).limit(20).execute()
for f in res.data:
    print(f"{f['name']}: {f['status']} ({f['updated_at']})")
