# ORBITGUARD AI — Space Debris Collision Risk Prediction

A Flask + scikit-learn educational research application with interactive 3D Earth, ESA encounter risk regression, dashboard, prediction history (SQLite), analytics, and Render deployment.

**Important:** The downloaded dataset is not bundled in the ZIP (official archive is ~221 MB). The model is NOT pre-trained in this distribution. Follow the steps below to download the authentic dataset and train a real model. The dashboard does not invent prediction results. Earth/satellites are illustrative, NOT live satellite positions. Internet access is needed for the CDN-hosted Three.js and Chart.js libraries and fonts.

## Quick start — Windows / VS Code

1. Extract the ZIP, open `orbitguard-ai` folder in VS Code.
2. Open **Terminal > New Terminal** and run:

```powershell
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python scripts/download_data.py
python scripts/train.py --data data/train_data.csv
python app.py
```

3. Open http://127.0.0.1:5000 in your browser.

If PowerShell blocks activation, use `.venv\Scripts\python.exe -m pip install -r requirements.txt` and similarly prefix other Python commands with `.venv\Scripts\python.exe`.

### Manual dataset fallback

If automatic download fails, open https://zenodo.org/records/4463683 and download **Collision Avoidance Challenge - Dataset.zip** (~221 MB). Extract the archive, find `train_data.csv`, and place it at `data/train_data.csv`. Then run `python scripts/train.py --data data/train_data.csv`. You can also use an official ESA train_data.zip from https://kelvins.esa.int/collision-avoidance-challenge/data/ and run `python scripts/train.py --data path/to/train_data.zip`.

## How the ML works

- Source: ESA Kelvins Collision Avoidance Challenge, 2015–2019 CDM encounters.
- Target: final event risk (`risk` = base-10 logarithm of collision probability) from the last CDM of each event.
- Input: last observation **at least 2 days before** time of closest approach, per event. We never use later observations as features.
- Model: median imputation + histogram gradient boosting regression.
- Validation: random 80/20 **event-level** holdout, fixed seed 42; report MAE and RMSE in log10 units.
- Probability conversion: `10 ** predicted_log10_risk`.
- Educational display categories: LOW (< 1e-6), WATCH (1e-6 to < 1e-4), ELEVATED (>= 1e-4). **Not operational ESA thresholds**.
- Note: The ESA competition's hand-picked testing set differs from random train data. This is an educational baseline, not an official leaderboard evaluation or calibrated probability model. Manual form fields are a simplified subset; optional omitted fields use training-set median imputation. For best validity, click **Load real ESA example** after training.

### Metrics

After training: `models/metrics.json` stores held-out validation metrics, and `models/risk_model.joblib` stores the actual trained pipeline. `data/encounter_samples.json` stores 250 early-observation examples for demonstration. No metric is fabricated.

## Project layout

```
orbitguard-ai/
├── app.py                       Flask backend, prediction API, SQLite
├── requirements.txt             Python dependencies
├── render.yaml                  Render Blueprint
├── templates/index.html         Six-page single-page dashboard
├── static/css/style.css         Futuristic UI theme
├── static/js/app.js             3D Earth, charts, UI and API calls
├── scripts/download_data.py     Official ESA dataset download + MD5 verification
├── scripts/train.py             Real ESA model training and validation
├── data/                        ESA CSV, sample encounters, history (generated)
└── models/                      Trained model + metrics (generated)
```

## API

- `GET /health` — server health and model status
- `GET /api/status` — trained model availability and metrics
- `GET /api/samples` — sample ESA early encounter rows (after training)
- `POST /api/predict` — JSON input including `risk`, `time_to_tca`, `miss_distance`, `relative_speed` and optional ESA features
- `GET /api/history` — 100 most recent locally saved predictions

## Deploy on Render

1. **Train locally first** as above. Verify `models/risk_model.joblib` and `models/metrics.json` exist.
2. Create a GitHub repository and push the project **including the trained model and metrics** (the full raw CSV is ignored by `.gitignore`). Example:

```powershell
git init
git add .
git commit -m "Build ORBITGUARD AI"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/orbitguard-ai.git
git push -u origin main
```

3. In Render create a **New Web Service**, connect the repository, select Python, build command `pip install -r requirements.txt`, start command `gunicorn app:app --bind 0.0.0.0:$PORT`. Or deploy using `render.yaml` as a Blueprint if the free plan is available to your account.
4. Visit the Render URL and confirm `/health` returns `model_ready: true`.
5. **Free hosting warning:** Render free filesystem is ephemeral. Prediction history saved in SQLite may disappear on redeploy/restart. For persistent multi-user history, configure a hosted database. Free instances may sleep, and free plan availability/limits can change.

## Troubleshooting

- `py` not found: install Python 3.11 or 3.12 from python.org, select Add to PATH, use `python` instead of `py`.
- `503 Model not trained`: run download and train steps; restart Flask.
- Download blocked: use the manual Zenodo download fallback.
- 3D globe missing: check internet access (Three.js loaded from CDN) and browser WebGL support.
- Empty analytics: make a prediction first.
- Missing packages: ensure the selected VS Code interpreter is `.venv`.

## Data provenance

ESA Kelvins Challenge: https://kelvins.esa.int/collision-avoidance-challenge/data/

Zenodo archived dataset: https://zenodo.org/records/4463683

Dataset citation: Uriot, T. et al., *Collision Avoidance Challenge dataset*, Zenodo, 2021. Follow the source's license and attribution requirements when redistributing data.

**Safety:** Not suitable for actual spacecraft maneuver decisions. Do not confuse the visual orbital animation with live monitoring.
