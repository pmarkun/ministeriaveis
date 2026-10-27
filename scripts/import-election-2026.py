"""Build the public candidate seed from TSE 2026 results and candidacies.

Never exports CPF, email, birth date, voter registration or contact information.
Usage: python scripts/import-election-2026.py --votes-zip /path/results.zip
       --candidates-zip /path/candidates.zip --as-of 2026-10-27
Use --aggregate-json to reuse a verified aggregate instead of rereading the vote zip.
"""
import argparse,csv,io,json,re,unicodedata,zipfile,hashlib
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
RESULTS='https://dadosabertos.tse.jus.br/dataset/resultados-2026'
CANDIDATES='https://dadosabertos.tse.jus.br/dataset/candidatos-2026'
VOTES_ZIP='https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip'
CANDIDATES_ZIP='https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'
UFS=set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def aggregate(path):
 records={};generations=set();rows=0
 with zipfile.ZipFile(path) as z:
  files=sorted(n for n in z.namelist() if n.endswith('.csv') and n.rsplit('_',1)[-1][:-4] in UFS)
  assert len(files)==27,'Use the complete national results archive; expected 27 state files.'
  fields=['SQ_CANDIDATO','SG_UF','CD_CARGO','NM_CANDIDATO','NM_URNA_CANDIDATO','NR_CANDIDATO','SG_PARTIDO','DS_SIT_TOT_TURNO','CD_ELEICAO','NM_TIPO_ELEICAO']
  for name in files:
   reader=csv.reader(io.TextIOWrapper(z.open(name),encoding='latin1'),delimiter=';');ix={k:i for i,k in enumerate(next(reader))}
   for r in reader:
    rows+=1
    if r[ix['NR_TURNO']]!='1' or r[ix['CD_CARGO']] not in ('5','6') or r[ix['CD_TIPO_ELEICAO']]!='2':continue
    key=(r[ix['SG_UF']],r[ix['SQ_CANDIDATO']])
    if key not in records:records[key]={**{k:r[ix[k]] for k in fields},'votes':0,'validVotes':0}
    records[key]['votes']+=int(r[ix['QT_VOTOS_NOMINAIS']]);records[key]['validVotes']+=int(r[ix['QT_VOTOS_NOMINAIS_VALIDOS']])
    generations.add(r[ix['DT_GERACAO']]+' '+r[ix['HH_GERACAO']])
   print('Aggregated',name,flush=True)
 return {'records':list(records.values()),'sourceGeneration':sorted(generations),'rowsRead':rows}
def metadata(path):
 public=['SQ_CANDIDATO','NM_CANDIDATO','NM_URNA_CANDIDATO','SG_UF','NR_CANDIDATO','CD_CARGO','SG_PARTIDO','DS_GENERO','DS_COR_RACA','DS_OCUPACAO','DS_SIT_TOT_TURNO','DT_GERACAO','HH_GERACAO','CD_ELEICAO']
 with zipfile.ZipFile(path) as z:
  name=next(n for n in z.namelist() if n.endswith('_BRASIL.csv'))
  return {r['SQ_CANDIDATO']:{k:r[k] for k in public} for r in csv.DictReader(io.TextIOWrapper(z.open(name),encoding='latin1'),delimiter=';') if r['CD_CARGO'] in ('5','6') and r['NR_TURNO']=='1' and r['CD_TIPO_ELEICAO']=='2'}
def build(a):
 agg=json.loads(a.aggregate_json.read_text()) if a.aggregate_json else aggregate(a.votes_zip);meta=metadata(a.candidates_zip)
 records=agg['records'];deputies=sorted([r for r in records if r['CD_CARGO']=='6' and r['DS_SIT_TOT_TURNO'].startswith('ELEITO')],key=lambda r:(-r['votes'],r['NM_CANDIDATO'],r['SQ_CANDIDATO']))
 assert len(deputies)==513,f'Expected 513 elected federal deputies, got {len(deputies)}'
 senators={uf:sorted([r for r in records if r['CD_CARGO']=='5' and r['SG_UF']==uf],key=lambda r:(-r['votes'],r['NM_CANDIDATO'],r['SQ_CANDIDATO'])) for uf in sorted(UFS)}
 assert all(senators.values()),'Missing senate state results'
 assert sum(r['DS_SIT_TOT_TURNO']=='ELEITO' for rs in senators.values() for r in rs)==54,'Expected 54 senators elected in 2026'
 selected=[]
 for rank,r in enumerate(deputies[:50],1):selected.append((r,rank,'chamber'))
 for uf,rs in senators.items():
  for rank,r in enumerate(rs,1):
   if rank<=5 or r['DS_SIT_TOT_TURNO']=='ELEITO':selected.append((r,rank,'senate'))
 base=json.loads((ROOT/'data/people.json').read_text());gov=json.loads((ROOT/'data/current-government.json').read_text());known=base+gov['people'];byname={norm(p['name']):p for p in known};export=[];senateIds=defaultdict(list);chamberIds=[]
 for r,rank,group in selected:
  sq=r['SQ_CANDIDATO'];m=meta.get(sq)
  assert m is not None,f'Missing candidacy metadata for {sq}'
  previous=byname.get(norm(r['NM_CANDIDATO'])) or byname.get(norm(r['NM_URNA_CANDIDATO']));id=previous['id'] if previous else 'tse-2026-'+sq
  name=previous['name'] if previous else ' '.join(w.lower() if w.lower() in ('de','da','do','das','dos','e') else w for w in r['NM_URNA_CANDIDATO'].title().split());elected=r['DS_SIT_TOT_TURNO'].startswith('ELEITO');office='Deputado Federal' if group=='chamber' else 'Senador'
  gender={'MASCULINO':'Homem','FEMININO':'Mulher'}.get(m['DS_GENERO'],'Não informado');race={'BRANCA':'Branca','PRETA':'Preta','PARDA':'Parda','AMARELA':'Amarela','INDÍGENA':'Indígena'}.get(m['DS_COR_RACA'],'Não informado')
  election={'year':2026,'office':office,'uf':r['SG_UF'],'votes':r['votes'],'validVotes':r['validVotes'],'rank':rank,'elected':elected,'status':r['DS_SIT_TOT_TURNO'],'candidateId':sq,'electionId':r['CD_ELEICAO'],'number':r['NR_CANDIDATO'],'source':RESULTS,'candidateSource':CANDIDATES}
  bio=('Eleito para a Câmara dos Deputados' if group=='chamber' else 'Eleito para o Senado' if elected else 'Candidato ao Senado')+' por '+r['SG_UF']+' em 2026. '+format(r['votes'],',').replace(',','.')+' votos nominais; '+r['DS_SIT_TOT_TURNO'].lower()+'.'
  p={**(previous or {}),'id':id,'name':name,'bio':bio,'party':r['SG_PARTIDO'],'gender':gender,'race':race,'demographicSource':CANDIDATES,'reference':CANDIDATES,'photo':previous['photo'] if previous else '', 'photoSource':previous.get('photoSource',CANDIDATES) if previous else CANDIDATES,'ministryIds':previous['ministryIds'] if previous else [],'sourceType':'tse','partyNote':'Partido da candidatura de 2026; pode diferir da filiação atual.','verifiedAt':a.as_of,'uf':r['SG_UF'],'groups':list(dict.fromkeys([*(previous.get('groups',[]) if previous else []),group])),'election':election}
  export.append(p)
  (chamberIds if group=='chamber' else senateIds[r['SG_UF']]).append(id)
 assert len(chamberIds)==50 and len(set(chamberIds))==50
 assert len(set(p['id'] for p in export))==len(export),'Deduplicated public figures unexpectedly overlap selected records'
 out={'year':2026,'turn':1,'asOf':a.as_of,'sourceGeneration':agg['sourceGeneration'],'sources':{'results':RESULTS,'candidates':CANDIDATES,'votesArchive':VOTES_ZIP,'candidatesArchive':CANDIDATES_ZIP},'criteria':{'chamber':'50 eleitos à Câmara com mais votos nominais, em todo o Brasil','senate':'5 mais votados de cada UF, incluindo todos os eleitos','votes':'Soma de QT_VOTOS_NOMINAIS por SQ_CANDIDATO e UF, no primeiro turno da eleição ordinária; cada arquivo estadual é contado uma vez. QT_VOTOS_NOMINAIS_VALIDOS é preservado separadamente.','demographics':'Gênero e raça/cor registrados na candidatura do TSE; sem inferência por foto ou nome.'},'counts':{'electedDeputiesInSource':513,'electedSenatorsInSource':54,'chamber':50,'senate':sum(len(v) for v in senateIds.values()),'states':27},'chamberIds':chamberIds,'senateByUf':dict(senateIds),'people':export}
 a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2));print('Exported',len(export),'public profiles to',a.output,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--votes-zip',type=Path);p.add_argument('--candidates-zip',type=Path,required=True);p.add_argument('--aggregate-json',type=Path);p.add_argument('--output',type=Path,default=ROOT/'data/elections-2026.json');p.add_argument('--as-of',default='2026-10-27');a=p.parse_args()
 if not a.aggregate_json and not a.votes_zip:p.error('--votes-zip or --aggregate-json is required')
 build(a)
