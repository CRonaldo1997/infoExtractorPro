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

file_id = "f77f1e7b-b624-4797-8246-154ad1e544f0"

# Check extraction results for this file
res = supabase.table("extraction_results").select("*").eq("file_id", file_id).execute()
print(f"Results for 123.txt: {res.data}")
