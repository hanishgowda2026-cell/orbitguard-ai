"""Download the official ESA archived dataset (~221 MB) and extract train_data.csv."""
from pathlib import Path
import hashlib,urllib.request,zipfile,shutil
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'data';DEST.mkdir(exist_ok=True)
URL='https://zenodo.org/records/4463683/files/Collision%20Avoidance%20Challenge%20-%20Dataset.zip?download=1'
archive=DEST/'esa_dataset.zip'
print('Downloading official ESA Zenodo archive (~221 MB). This can take a few minutes...')
urllib.request.urlretrieve(URL,archive)
md5=hashlib.md5(archive.read_bytes()).hexdigest()
if md5!='d19dc8875229f2f6893253c38adddc87':raise RuntimeError('Dataset checksum mismatch; remove archive and retry. Got '+md5)
with zipfile.ZipFile(archive) as z:
 matches=[n for n in z.namelist() if n.lower().endswith('train_data.csv')]
 if not matches:
  print('Available CSVs:',[n for n in z.namelist() if n.lower().endswith('.csv')]);raise RuntimeError('train_data.csv not found; see README for manual extraction')
 with z.open(matches[0]) as source,(DEST/'train_data.csv').open('wb') as target:shutil.copyfileobj(source,target)
print('Ready:',DEST/'train_data.csv')
