"""Check the public release allowlist and sensitive text, including XLSX XML."""
from pathlib import Path
import argparse,json,re,zipfile,hashlib

ROOT=Path(__file__).resolve().parents[1]
ALLOWED={
 '.gitignore','.nojekyll','LICENSE','README.md','index.html',
 '.github/workflows/validate.yml','src/index.template.html','src/styles.css','src/app.js',
 'examples/math-graph.json','examples/math-taxonomy.json','examples/math-nodes.csv',
 'docs/schema.md','docs/public-release.md',
 'scripts/build.mjs','scripts/audit.py','tests/test_taxonomy.py','assets/math.png'
}
PATTERNS={
 'home_directory':re.compile(r'/(?:Users|home)/[A-Za-z0-9_\-]+/|[A-Z]:\\Users\\',re.I),
 'private_host':re.compile(r'(?:[a-z0-9-]+\.)*(?:alibaba-inc|antfin)\.com|(?:[a-z0-9-]+\.)*aliyuncs\.com',re.I),
 'private_storage':re.compile(r'oss'+r'://|s3'+r'://|/root/'+r'storage/|/pod-terminal\?',re.I),
 'signed_url':re.compile(r'(?:[?&]|&amp;)(?:Signature|OSSAccessKeyId|SecurityToken|X-Amz-Signature|X-Oss-Signature|sig)=',re.I),
 'access_key':re.compile(r'\b(?:AKIA[0-9A-Z]{16}|LTAI[0-9A-Za-z]{12,})\b'),
 'token':re.compile(r'\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_\-]{20,}\b'),
 'private_key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'email':re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'),
 'private_ip':re.compile(r'(?<![\d.])(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?![\d.])'),
 'site_identity':re.compile(r'appgprj_[A-Za-z0-9]+|oaiapp_[A-Za-z0-9]+')
}

def release_paths():
 paths=[]
 for p in ROOT.rglob('*'):
  rel=p.relative_to(ROOT).as_posix()
  if '.git' in p.relative_to(ROOT).parts or '__pycache__' in p.relative_to(ROOT).parts:continue
  if p.is_file() or p.is_symlink():paths.append((rel,p))
 return sorted(paths)

def audit():
 issues=[];files=[]
 for rel,p in release_paths():
  if rel not in ALLOWED:issues.append({'file':rel,'issue':'not_allowlisted'});continue
  if p.is_symlink():issues.append({'file':rel,'issue':'symlink'});continue
  body=p.read_bytes();files.append({'path':rel,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
  if p.suffix=='.png':
   if not body.startswith(b'\x89PNG\r\n\x1a\n'):issues.append({'file':rel,'issue':'invalid_png'})
   # Screenshots are additionally reviewed visually before publication.
   continue
  if p.suffix=='.xlsx':
   with zipfile.ZipFile(p) as z:
    texts=[(f'{rel}:{n}',z.read(n).decode('utf-8')) for n in z.namelist() if n.endswith(('.xml','.rels'))]
    if any(n.startswith('xl/externalLinks/') for n in z.namelist()):issues.append({'file':rel,'issue':'external_workbook_link'})
  else:
   try:texts=[(rel,body.decode('utf-8-sig'))]
   except UnicodeDecodeError:issues.append({'file':rel,'issue':'unexpected_binary'});continue
  for name,text in texts:
   for category,pattern in PATTERNS.items():
    if pattern.search(text):issues.append({'file':name,'issue':category})
 return {'status':'PASS' if not issues else 'FAIL','files':files,'issues':issues}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--report',type=Path);args=parser.parse_args()
 report=audit()
 if args.report:args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'status':report['status'],'file_count':len(report['files']),'issues':report['issues']},ensure_ascii=False))
 raise SystemExit(bool(report['issues']))
