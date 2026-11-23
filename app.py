import json,sqlite3,os
from datetime import datetime,timezone
from pathlib import Path
import numpy as np,pandas as pd,joblib
from flask import Flask,render_template,request,jsonify
ROOT=Path(__file__).resolve().parent
app=Flask(__name__)
DB=Path(os.environ.get('ORBITGUARD_DB',str(ROOT/'data'/'history.db')))
FEATURES=['risk','max_risk_estimate','miss_distance','relative_speed','time_to_tca','relative_position_r','relative_position_t','relative_position_n','relative_velocity_r','relative_velocity_t','relative_velocity_n','t_sigma_r','t_sigma_t','t_sigma_n','c_sigma_r','c_sigma_t','c_sigma_n']
MODEL=None

def init_db():
 DB.parent.mkdir(parents=True,exist_ok=True)
 with sqlite3.connect(DB) as c:c.execute('CREATE TABLE IF NOT EXISTS predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, event_name TEXT NOT NULL, log_risk REAL NOT NULL, probability REAL NOT NULL, category TEXT NOT NULL, inputs TEXT NOT NULL)')

def load_model():
 global MODEL
 p=ROOT/'models'/'risk_model.joblib'
 if p.exists() and MODEL is None:MODEL=joblib.load(p)
 return MODEL

def category(pc):
 # Educational bands, NOT ESA operational maneuver thresholds.
 return 'ELEVATED' if pc>=1e-4 else ('WATCH' if pc>=1e-6 else 'LOW')
@app.get('/')
def index():return render_template('index.html')
@app.get('/api/status')
def status():
 m=load_model();path=ROOT/'models'/'metrics.json';metrics=json.loads(path.read_text()) if path.exists() else None
 return jsonify(ready=m is not None,metrics=metrics)
@app.get('/api/samples')
def samples():
 p=ROOT/'data'/'encounter_samples.json'
 return jsonify(samples=json.loads(p.read_text()) if p.exists() else [])
@app.post('/api/predict')
def predict():
 m=load_model()
 if m is None:return jsonify(error='Model not trained. Download ESA data and run python scripts/train.py --data data/train_data.csv first.'),503
 data=request.get_json(silent=True) or {};inputs={}
 try:
  for k in FEATURES:
   v=data.get(k,None)
   inputs[k]=float(v) if v is not None and str(v).strip()!='' else np.nan
   if not np.isnan(inputs[k]) and not np.isfinite(inputs[k]):raise ValueError('Non-finite value')
  if not np.isfinite(inputs['time_to_tca']) or inputs['time_to_tca']<2:raise ValueError('Time to closest approach must be at least 2 days')
  if not np.isfinite(inputs['risk']) or not (-30<=inputs['risk']<=0):raise ValueError('Current log10 risk must be between -30 and 0')
  if not np.isfinite(inputs['miss_distance']) or inputs['miss_distance']<0:raise ValueError('Miss distance must be nonnegative')
  if not np.isfinite(inputs['relative_speed']) or inputs['relative_speed']<0:raise ValueError('Relative speed must be nonnegative')
 except (ValueError,TypeError) as e:return jsonify(error='Invalid input: '+str(e)),400
 frame=pd.DataFrame([inputs],columns=m['features']);pred=float(np.clip(m['pipeline'].predict(frame)[0],-30,0));prob=float(10**pred);cat=category(prob)
 name=str(data.get('event_name') or 'Custom encounter')[:80];created=datetime.now(timezone.utc).isoformat()
 with sqlite3.connect(DB) as c:c.execute('INSERT INTO predictions (created_at,event_name,log_risk,probability,category,inputs) VALUES (?,?,?,?,?,?)',(created,name,pred,prob,cat,json.dumps({k:None if np.isnan(v) else v for k,v in inputs.items()})))
 return jsonify(event_name=name,log_risk=pred,probability=prob,category=cat,created_at=created,disclaimer='Research estimate only; not suitable for real collision-avoidance decisions.')
@app.get('/api/history')
def history():
 with sqlite3.connect(DB) as c:
  c.row_factory=sqlite3.Row;rows=c.execute('SELECT id,created_at,event_name,log_risk,probability,category FROM predictions ORDER BY id DESC LIMIT 100').fetchall()
 return jsonify(history=[dict(r) for r in rows])
@app.get('/health')
def health():return jsonify(status='ok',model_ready=load_model() is not None)
init_db()
if __name__=='__main__':app.run(debug=os.environ.get('FLASK_DEBUG')=='1',host='0.0.0.0',port=int(os.environ.get('PORT','5000')))
