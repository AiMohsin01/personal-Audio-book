import json
import time
import wave
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from companion import app as module

@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(module, 'DATABASE', tmp_path / 'jobs.sqlite3')
    monkeypatch.setattr(module, 'AUDIO', tmp_path / 'audio')
    monkeypatch.setattr(module, 'VOICES', tmp_path / 'voices')
    module.AUDIO.mkdir(); module.VOICES.mkdir()
    module.STOP.clear()
    with module.connect() as conn:
        conn.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE, payload TEXT, status TEXT, done INTEGER DEFAULT 0, total INTEGER, chapter INTEGER DEFAULT 0, error TEXT DEFAULT "", segments TEXT DEFAULT "[]")')
    return TestClient(module.app)

def payload(text='A good story begins here. The sun rose over a quiet garden.'):
    return {'book_id':'test-book','voice':'espeak-en-us','speed':1,'chapters':[{'index':0,'title':'First chapter','text':text},{'index':1,'title':'Second chapter','text':'Another chapter, another adventure.'}]}

def run(api, job):
    with module.connect() as conn:
        conn.execute("UPDATE jobs SET status='running' WHERE id=?",(job['id'],))
    module.process_job(job['id'])
    return next(j for j in api.get('/jobs').json() if j['id']==job['id'])

def test_real_speech_generation_and_download(api):
    response = api.post('/jobs',json=payload())
    assert response.status_code == 200
    job = response.json()
    assert api.post('/jobs',json=payload()).json()['id'] == job['id']
    result = run(api, job)
    assert result['status']=='completed', result
    assert result['done']==result['total']==2
    assert len(result['segments'])==2
    audio = api.get(result['segments'][0]['url'])
    assert audio.status_code==200 and audio.content.startswith(b'RIFF')
    with wave.open(str(module.AUDIO / result['id'] / 'chapter-0.wav')) as wav:
        assert wav.getnframes()>1000 and wav.getframerate()>10000
    assert result['segments'][0]['duration']>0

def test_pause_resume_and_retry_keeps_finished_chunks(api,monkeypatch):
    job=api.post('/jobs',json=payload('A sentence. ' * 120)).json()
    assert api.post('/jobs/'+job['id']+'/pause').json()['status']=='paused'
    assert api.post('/jobs/'+job['id']+'/resume').json()['status']=='queued'
    original = module.synthesize
    calls = 0
    def fail_on_second(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError('Deliberate test engine interruption')
        return original(*args)
    monkeypatch.setattr(module,'synthesize',fail_on_second)
    failed=run(api,job)
    assert failed['status']=='failed' and failed['done']==1
    finished = module.AUDIO / job['id'] / '0-0.wav'
    before = finished.stat().st_mtime_ns
    monkeypatch.setattr(module,'synthesize',original)
    api.post('/jobs/'+job['id']+'/resume')
    completed=run(api,job)
    assert completed['status']=='completed'
    assert finished.stat().st_mtime_ns==before

def test_preview_is_real_audio_and_cleaned_up(api):
    res=api.post('/preview',json={'voice':'espeak-en-us-f3','text':'Welcome to your library.','speed':1})
    assert res.status_code==200 and len(res.content)>1000
    assert not list(module.AUDIO.glob('preview-*'))

def test_input_validation_and_local_security(api):
    assert api.post('/jobs',json={**payload(),'voice':'../../secret'}).status_code==400
    assert api.post('/jobs',json={**payload(),'speed':0}).status_code==422
    assert api.post('/jobs',json=payload('')).status_code==200 # second chapter still readable
    empty={**payload(),'chapters':[{'index':0,'title':'Empty','text':''}]}
    assert api.post('/jobs',json=empty).status_code==400
    assert api.post('/jobs',json=payload(),headers={'Origin':'https://untrusted.example'}).status_code==403
    assert api.get('/health',headers={'Host':'untrusted.example'}).status_code==400
    assert api.get('/audio/not-a-uuid/chapter-0.wav').status_code==400

def test_chunking_never_drops_non_whitespace():
    text=('A sentence.\nAnother one! ' * 1000)+'x'*1000
    chunks=list(module.split_text(text))
    assert all(0<len(c)<=700 for c in chunks)
    assert ''.join(''.join(c.split()) for c in chunks)==''.join(text.split())
