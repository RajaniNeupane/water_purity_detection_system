from flask import Flask, request, jsonify
import joblib
import pandas as pd

app = Flask(__name__)

# Load your pre-trained model and scaler artifact
model = joblib.load("logistic_model.pkl")
scaler = joblib.load("scaler.pkl")

# Define the exact column order used during training (X.columns)
# This prevents data scrambling when converting raw JSON keys to a DataFrame
EXPECTED_COLUMNS = [
    "ph",
    "Turbidity",
    "Hardness",
    "Solids",
    "Organic_carbon",
    "Chloramines"
]


@app.route('/')
def home():
    return "API is running"

@app.route('/predict', methods=['GET', 'POST'])
def predict():
    print("Request received")

    data = request.get_json()
    print("Data:", data)

    if request.method == 'GET':
        return "Send POST request with features"

    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON received"}), 400

    # Extract dictionary if the client nests keys under a "features" property
    if isinstance(data, dict) and "features" in data:
        data = data["features"]

    # Validate that all required properties exist
    missing_features = [feat for feat in EXPECTED_COLUMNS if feat not in data]
    if missing_features:
        return jsonify({"error": f"Missing features: {missing_features}"}), 400

    # Convert incoming dictionary to a DataFrame
    df = pd.DataFrame([data])
    
    # CRITICAL: Reindex the DataFrame columns to match training order precisely
    df = df.reindex(columns=EXPECTED_COLUMNS)

    try:
        # Transform using the loaded scaler
        scaled = scaler.transform(df)

        # Generate predictions
        prediction = model.predict(scaled)[0]
        probability = model.predict_proba(scaled)[0][1]

        return jsonify({
            "prediction": int(prediction),
            "probability": float(probability)
        })
    except Exception as e:
        return jsonify({"error": f"Inference engine failure: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)