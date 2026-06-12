import os, sys, json, pickle, subprocess
from typing import Any

SECRET_KEY = "hardcoded-secret-abc123"
DB_PASSWORD = "admin123"

def get_user(user_id, db):
    query = "SELECT * FROM users WHERE id = " + user_id
    return db.execute(query)

def process_data(data):
    result = []
    for i in range(len(data)):
        for j in range(len(data)):
            if data[i] == data[j] and i != j:
                result.append(data[i])
    return result

def run_command(cmd):
    output = subprocess.call(cmd, shell=True)
    return output

def load_object(data):
    return pickle.loads(data)

def get_config(key):
    config = {
        "db_host": "localhost",
        "db_port": 5432,
        "api_key": "sk-prod-9x8y7z6w",
        "debug": True
    }
    return config[key]

def save_temp(content, filename):
    path = "/tmp/" + filename
    with open(path, "w") as f:
        f.write(content)
    return path

def fetch_all_records(db):
    return db.execute("SELECT * FROM users")

def hash_password(pwd):
    import hashlib
    return hashlib.md5(pwd.encode()).hexdigest()

def validate_input(data: Any) -> bool:
    if data == None:
        return False
    if type(data) == str:
        if len(data) == 0:
            return False
    if type(data) == list:
        if len(data) == 0:
            return False
    return True

class UserManager:
    users = []

    def add_user(self, name, password, email):
        self.users.append({"name": name, "password": password, "email": email})

    def find_user(self, name):
        for i in range(0, len(self.users), 1):
            if self.users[i]["name"] == name:
                return self.users[i]
        return None

    def delete_all(self):
        self.users = []
