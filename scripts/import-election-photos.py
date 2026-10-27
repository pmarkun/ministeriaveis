"""Import only selected public TSE portraits; requires Pillow for thumbnail output."""
from pathlib import Path
import json,urllib.request,zipfile,io,concurrent.futures,argparse
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--metadata-json',required=True,type=Path);p.add_argument('--cache-dir',required=True,type=Path);a=p.parse_args();a.cache_dir.mkdir(exist_ok=True,parents=True)
path=ROOT/'data/elections-2026.json';seed=json.loads(path.read_text());meta=json.loads(a.metadata_json.read_text());resources={r['name'].split(' - ')[0]:r['url'] for r in meta['result']['resources'] if ' - Fotos de candidatos' in r['name']};groups={}
for person in seed['people']:groups.setdefault(person['election']['uf'],[]).append(person)
(ROOT/'public/photos').mkdir(exist_ok=True)
def one(item):
 uf,persons=item;cache=a.cache_dir/('photos_'+uf+'.zip');url=resources[uf]
 try:
  if not cache.exists():
   with urllib.request.urlopen(url,timeout=30) as r,open(cache,'wb') as f:
    while True:
     chunk=r.read(1024*1024)
     if not chunk:break
     f.write(chunk)
  with zipfile.ZipFile(cache) as z:
   files={Path(n).name.lower():n for n in z.namelist()};count=0;miss=[]
   for person in persons:
    candidate=person['election']['candidateId'];prefix=('F'+uf+candidate+'_div.').lower();name=next((name for key,name in files.items() if key.startswith(prefix)),None)
    if not name:miss.append(candidate);continue
    try:
     with Image.open(io.BytesIO(z.read(name))) as im:
      im=im.convert('RGB');im.thumbnail((260,320));target='tse-2026-'+candidate+'.webp';im.save(ROOT/'public/photos'/target,quality=88)
     person['photo']='/photos/'+target;person['photoSource']=url;count+=1
    except Exception:miss.append(candidate)
   print(uf,count,'photos',('missing '+','.join(miss)) if miss else '',flush=True)
   return count
 except Exception as e:print(uf,'PHOTO ERROR',str(e),flush=True);return 0
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:counts=list(pool.map(one,sorted(groups.items())))
path.write_text(json.dumps(seed,ensure_ascii=False,indent=2));print('TOTAL',sum(counts),'/',len(seed['people']),flush=True)
