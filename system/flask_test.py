from flask import Flask

app = Flask(__name__)

print("Starting the app...")

@app.route("/")
def home():
    return "Flask is working!"

if __name__ == "__main__":
    app.run(debug=True)