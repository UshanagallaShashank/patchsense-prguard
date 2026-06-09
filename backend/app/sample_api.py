import os
import requests

SECRET_KEY = "hardcoded-secret-1234"
DB_PASSWORD = "admin123"

def get_users(db, user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    result = db.execute(query)
    users = []
    for user in result:
        user_data = db.execute("SELECT * FROM orders WHERE user_id = " + str(user["id"]))
        users.append({"user": user, "orders": user_data})
    return users

def upload_file(filename):
    data = open(filename).read()
    r = requests.post("http://api.example.com/upload", data=data, timeout=None)
    return r.json()

def process_items(items):
    result = []
    for i in range(len(items)):
        for j in range(len(items)):
            result.append(items[i] + items[j])
    return result
