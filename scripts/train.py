"""Train an event-level ESA CDM model without leaking later observations."""
import argparse,json,zipfile
from pathlib import Path
import numpy as np,pandas as pd,joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error,mean_squared_error
ROOT=Path(__file__).resolve().parents[1]
FEATURES=['risk','max_risk_estimate','miss_distance','relative_speed','time_to_tca','relative_position_r','relative_position_t','relative_position_n','relative_velocity_r','relative_velocity_t','relative_velocity_n','t_sigma_r','t_sigma_t','t_sigma_n','c_sigma_r','c_sigma_t','c_sigma_n']
INPUTS=FEATURES.copy()
def read_data(path):
 p=Path(path)
 if p.suffix.lower()=='.zip':
  with zipfile.ZipFile(p) as z:
   names=[n for n in z.namelist() if n.lower().endswith('train_data.csv')]
   if not names: raise ValueError('ZIP must contain train_data.csv')
   with z.open(names[0]) as f:return pd.read_csv(f,low_memory=False)
 return pd.read_csv(p,low_memory=False)
def prepare(df):
 needed={'event_id','time_to_tca','risk'}
 if not needed.issubset(df):raise ValueError('Missing ESA columns: '+str(needed-set(df)))
 df=df.copy()
 for c in FEATURES:
  if c not in df:df[c]=np.nan
  df[c]=pd.to_numeric(df[c],errors='coerce')
 # ESA target is last available risk, but only observations >=2 days before TCA are allowed as predictors.
 df=df.sort_values(['event_id','time_to_tca'],ascending=[True,False])
 final=df.groupby('event_id',sort=False).tail(1)[['event_id','risk']].rename(columns={'risk':'target'})
 early=df[df.time_to_tca>=2].groupby('event_id',sort=False).tail(1)
 merged=early.merge(final,on='event_id',how='inner').dropna(subset=['target'])
 merged=merged[np.isfinite(merged.target)]
 return merged

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--data',default=str(ROOT/'data'/'train_data.csv'));args=ap.parse_args()
 df=read_data(args.data);events=prepare(df)
 if len(events)<100:raise ValueError('Need at least 100 eligible events for meaningful validation')
 X=events[INPUTS].replace([np.inf,-np.inf],np.nan);y=events.target.clip(-30,0)
 train_idx,test_idx=train_test_split(np.arange(len(events)),test_size=.2,random_state=42)
 model=Pipeline([('imputer',SimpleImputer(strategy='median',add_indicator=False)),('regressor',HistGradientBoostingRegressor(max_iter=180,max_leaf_nodes=15,l2_regularization=2,random_state=42))])
 model.fit(X.iloc[train_idx],y.iloc[train_idx]);pred=model.predict(X.iloc[test_idx])
 mae=float(mean_absolute_error(y.iloc[test_idx],pred));rmse=float(np.sqrt(mean_squared_error(y.iloc[test_idx],pred)))
 out=ROOT/'models';out.mkdir(exist_ok=True)
 joblib.dump({'pipeline':model,'features':INPUTS},out/'risk_model.joblib')
 # Save only eligible pre-TCA rows for website examples; exclude target and unseen future data.
 sample=events[['event_id']+INPUTS].sample(min(250,len(events)),random_state=42).replace([np.inf,-np.inf],np.nan)
 sample.to_json(ROOT/'data'/'encounter_samples.json',orient='records')
 metrics={'dataset':'ESA Kelvins Collision Avoidance Challenge','eligible_events':len(events),'training_events':len(train_idx),'validation_events':len(test_idx),'mae_log10_risk':round(mae,4),'rmse_log10_risk':round(rmse,4),'model':'HistGradientBoostingRegressor','target':'final log10 collision probability','minimum_lead_time_days':2,'note':'Event-level split; predictions are estimates, not operational collision warnings.'}
 (out/'metrics.json').write_text(json.dumps(metrics,indent=2));print(json.dumps(metrics,indent=2))
if __name__=='__main__':main()
