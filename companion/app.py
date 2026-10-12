"""Folio's loopback-only companion. Books never leave the local machine."""
from contextlib import asynccontextmanager
from pathlib import Path
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
import wave
from urllib.request import urlopen
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field

ROOT = Path(os.environ.get('FOLIO_DATA', Path(__file__).resolve().parent.parent / '.local')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
VOICES = ROOT / 'voices'
VOICES.mkdir(exist_ok=True)
AUDIO = ROOT / 'audio'
AUDIO.mkdir(exist_ok=True)
DATABASE = ROOT / 'jobs.sqlite3'
ORIGINS = os.environ.get('FOLIO_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',')
# Neural models are user-installed, not silently downloaded. License text is fetched first.
CATALOG = [
 {'id':'en_US-ljspeech-medium','name':'LJ Speech · neural','language':'en-US','gender':'Female','size_mb':64,'license':'Public-domain LJ Speech dataset; inspect model card before installing','path':'en/en_US/ljspeech/medium'},
 {'id':'en_US-hfc_male-medium','name':'HiFi Captain · neural','language':'en-US','gender':'Male','size_mb':64,'license':'HiFi Captain dataset: CC BY-SA 4.0; inspect model card before installing','path':'en/en_US/hfc_male/medium'},
]
BUILTIN = [
 {'id':'espeak-en-us','name':'eSpeak English · robotic fallback','language':'en-US','gender':'Male-style','size_mb':0,'license':'eSpeak NG GPL-3.0; bundled with Piper','installed':True},
 {'id':'espeak-en-us-f3','name':'eSpeak English · robotic fallback','language':'en-US','gender':'Female-style','size_mb':0,'license':'eSpeak NG GPL-3.0; bundled with Piper','installed':True},
]

def connect():
    conn = sqlite3.connect(DATABASE, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn

with connect() as conn:
    conn.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE, payload TEXT, status TEXT, done INTEGER DEFAULT 0, total INTEGER, chapter INTEGER DEFAULT 0, error TEXT DEFAULT "", segments TEXT DEFAULT "[]")')
    conn.execute("UPDATE jobs SET status='paused' WHERE status='running'")

def split_text(text: str, size: int = 700):
    # Bounded chunks, prefer punctuation then whitespace, always make progress.
    text = text.strip()
    while text:
        if len(text) <= size:
            yield text
            break
        stop = max(text.rfind('. ', 0, size), text.rfind('\n', 0, size))
        if stop < size // 3:
            stop = text.rfind(' ', 0, size)
        if stop < 1:
            stop = size
        else:
            stop += 1
        yield text[:stop].strip()
        text = text[stop:].strip()

def get_job(job_id):
    with connect() as conn:
        row = conn.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Job not found')
    payload = json.loads(row['payload'])
    return {'id':row['id'], 'book_id':payload['book_id'], 'voice':payload['voice'], 'source_fingerprint':payload.get('source_fingerprint',''), 'status':row['status'], 'done':row['done'], 'total':row['total'], 'chapter':row['chapter'], 'error':row['error'], 'segments':json.loads(row['segments'])}

def valid_voice(voice):
    if voice in {v['id'] for v in BUILTIN}:
        return True
    return bool(re.fullmatch(r'[A-Za-z0-9_-]+', voice)) and (VOICES / f'{voice}.onnx').is_file() and (VOICES / f'{voice}.onnx.json').is_file() and (VOICES / f'{voice}.license.txt').is_file()

ENGINE_CACHE = {}

def synthesize(text, output, voice, speed):
    if voice.startswith('espeak-'):
        selected = 'en-us+f3' if voice.endswith('-f3') else 'en-us'
        result = subprocess.run([sys.executable, '-m', 'companion.espeak', str(output), selected, str(speed)], input=text, text=True, capture_output=True, timeout=180)
        if result.returncode:
            raise RuntimeError(result.stderr[-1500:])
    else:
        import onnxruntime
        onnxruntime.disable_telemetry_events()
        from piper import PiperVoice, SynthesisConfig
        if voice not in ENGINE_CACHE:
            ENGINE_CACHE.clear()  # Keep only one model resident in memory.
            ENGINE_CACHE[voice] = PiperVoice.load(str(VOICES / f'{voice}.onnx'))
        engine = ENGINE_CACHE[voice]
        with wave.open(str(output), 'wb') as wav:
            engine.synthesize_wav(text, wav, SynthesisConfig(length_scale=1.0 / speed))
    with wave.open(str(output), 'rb') as wav:
        if wav.getnframes() == 0:
            raise RuntimeError('Speech engine returned empty audio')

def combine(paths, output):
    # Stream PCM; no full-book audio buffer.
    tmp = output.with_suffix('.tmp.wav')
    with wave.open(str(tmp), 'wb') as dst:
        expected = None
        for path in paths:
            with wave.open(str(path), 'rb') as src:
                params = (src.getnchannels(), src.getsampwidth(), src.getframerate())
                if expected is None:
                    expected = params
                    dst.setnchannels(params[0]); dst.setsampwidth(params[1]); dst.setframerate(params[2])
                if params != expected:
                    raise RuntimeError('Audio segment format mismatch')
                while data := src.readframes(16384):
                    dst.writeframesraw(data)
    tmp.replace(output)
    with wave.open(str(output), 'rb') as wav:
        return wav.getnframes() / wav.getframerate()

STOP = threading.Event()
SYNTH_LOCK = threading.Lock()
INSTALL_LOCK = threading.Lock()

def process_job(job_id):
    try:
        with connect() as conn:
            row = conn.execute('SELECT payload FROM jobs WHERE id=?', (job_id,)).fetchone()
        payload = json.loads(row['payload'])
        folder = AUDIO / job_id
        folder.mkdir(exist_ok=True)
        chunks = [(chapter['index'], i, text) for chapter in payload['chapters'] for i,text in enumerate(split_text(chapter['text']))]
        for n,(chapter,i,text) in enumerate(chunks):
            if STOP.is_set() or get_job(job_id)['status'] != 'running':
                return
            output = folder / f'{chapter}-{i}.wav'
            if not output.exists():
                tmp = output.with_suffix('.tmp.wav')
                with SYNTH_LOCK:
                    synthesize(text, tmp, payload['voice'], payload['speed'])
                tmp.replace(output)
            with connect() as conn:
                conn.execute('UPDATE jobs SET done=?, chapter=? WHERE id=?', (n+1,chapter,job_id))
        segments = []
        for chapter in payload['chapters']:
            paths = [folder / f"{c}-{i}.wav" for c,i,_ in chunks if c == chapter['index']]
            if not paths:
                continue
            output = folder / f"chapter-{chapter['index']}.wav"
            duration = combine(paths, output)
            segments.append({'chapter':chapter['index'], 'url':f"/audio/{job_id}/{output.name}", 'duration':duration, 'chapter_id':chapter.get('id',''), 'text_sha256':hashlib.sha256(chapter['text'].encode()).hexdigest()})
        with connect() as conn:
            conn.execute("UPDATE jobs SET status='completed', segments=?, error='' WHERE id=? AND status='running'", (json.dumps(segments),job_id))
    except Exception as exc:
        with connect() as conn:
            conn.execute("UPDATE jobs SET status='failed', error=? WHERE id=?", (str(exc)[-2000:],job_id))

def worker():
    while not STOP.wait(.3):
        with connect() as conn:
            row = conn.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
            if row:
                conn.execute("UPDATE jobs SET status='running' WHERE id=? AND status='queued'", (row['id'],))
        if row:
            process_job(row['id'])

@asynccontextmanager
async def lifespan(app):
    STOP.clear()
    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    yield
    STOP.set()
    thread.join(timeout=5)
    with connect() as conn:
        conn.execute("UPDATE jobs SET status='paused' WHERE status='running'")

app = FastAPI(title='Folio local companion', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['GET','POST'], allow_headers=['Content-Type'])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost','127.0.0.1','testserver'])

@app.middleware('http')
async def protect_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin not in ORIGINS:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail':'Origin not allowed'}, status_code=403)
    return await call_next(request)

@app.get('/health')
def health():
    return {'status':'ok','engine':'Piper + eSpeak fallback','storage':'local SQLite and WAV'}

@app.get('/voices')
def voices():
    result = BUILTIN + [{k:v for k,v in voice.items() if k != 'path'} | {'installed':valid_voice(voice['id'])} for voice in CATALOG]
    ids = {v['id'] for v in result}
    for path in sorted(VOICES.glob('*.onnx')):
        if path.stem not in ids and valid_voice(path.stem):
            config = json.loads(path.with_suffix('.onnx.json').read_text())
            result.append({'id':path.stem,'name':path.stem,'language':config.get('language',{}).get('code','Custom'),'gender':'Custom model','size_mb':round(path.stat().st_size/1048576),'license':path.with_suffix('.license.txt').read_text()[:200],'installed':True})
    return result

@app.get('/voices/{voice_id}/license')
def license_info(voice_id: str):
    voice = next((v for v in CATALOG if v['id']==voice_id), None)
    if not voice:
        raise HTTPException(404, 'Unknown catalog voice')
    url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{voice['path']}/MODEL_CARD"
    try:
        with urlopen(url, timeout=30) as res:
            card = res.read(100000).decode()
        return {'card':card,'source':url}
    except Exception as exc:
        raise HTTPException(502, f'Model card could not be checked: {exc}') from exc

@app.post('/voices/{voice_id}/install')
def install(voice_id: str):
    voice = next((v for v in CATALOG if v['id']==voice_id), None)
    if not voice:
        raise HTTPException(404, 'Unknown catalog voice')
    if not INSTALL_LOCK.acquire(blocking=False):
        raise HTTPException(409, 'Another voice download is in progress')
    try:
        card = license_info(voice_id)['card']
        base = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{voice['path']}/{voice_id}"
        # Read upstream model metadata, including LFS SHA256, before downloading.
        metadata_url = f"https://huggingface.co/api/models/rhasspy/piper-voices/tree/main/{voice['path']}"
        with urlopen(metadata_url, timeout=30) as res:
            metadata = json.load(res)
        expected = next((f.get('lfs',{}).get('oid') for f in metadata if f.get('path','').endswith(voice_id+'.onnx')),None)
        if not expected or not re.fullmatch('[a-f0-9]{64}', expected):
            raise RuntimeError('Upstream model SHA256 unavailable; refusing an unverified model')
        for suffix in ['.onnx','.onnx.json']:
            output = VOICES / (voice_id+suffix)
            tmp = output.with_suffix(output.suffix+'.partial')
            hasher = hashlib.sha256()
            with urlopen(base+suffix, timeout=90) as res, tmp.open('wb') as stream:
                while chunk := res.read(1024*1024):
                    stream.write(chunk); hasher.update(chunk)
            if suffix == '.onnx' and hasher.hexdigest() != expected:
                tmp.unlink(missing_ok=True)
                raise RuntimeError('Model checksum mismatch')
            if suffix == '.onnx.json':
                json.loads(tmp.read_text())
            tmp.replace(output)
        (VOICES / f'{voice_id}.license.txt').write_text(card)
        return {'status':'installed'}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f'Voice installation failed: {exc}') from exc
    finally:
        INSTALL_LOCK.release()

class Chapter(BaseModel):
    id: str = Field(default='',max_length=100)
    index: int = Field(ge=0, le=100000)
    title: str = Field(max_length=1000)
    text: str = Field(max_length=10000000)
class Conversion(BaseModel):
    book_id: str = Field(min_length=1, max_length=100)
    source_fingerprint: str = Field(default='',max_length=64)
    voice: str = Field(max_length=100)
    speed: float = Field(default=1.0, ge=.5, le=3)
    chapters: list[Chapter] = Field(min_length=1,max_length=100000)
class Preview(BaseModel):
    voice: str = Field(max_length=100)
    text: str = Field(max_length=500, min_length=1)
    speed: float = Field(default=1.0,ge=.5,le=3)

@app.post('/preview')
def preview(body: Preview):
    if not valid_voice(body.voice):
        raise HTTPException(400,'Install this voice first')
    path = AUDIO / f'preview-{uuid.uuid4()}.wav'
    try:
        with SYNTH_LOCK:
            synthesize(body.text,path,body.voice,body.speed)
        from starlette.background import BackgroundTask
        return FileResponse(path,media_type='audio/wav',background=BackgroundTask(path.unlink,missing_ok=True))
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(500,str(exc)) from exc

@app.post('/jobs')
def create_job(body: Conversion):
    if not valid_voice(body.voice):
        raise HTTPException(400,'Install this voice first')
    if len({c.index for c in body.chapters}) != len(body.chapters):
        raise HTTPException(400,'Duplicate chapter index')
    payload = body.model_dump()
    total = sum(sum(1 for _ in split_text(c.text)) for c in body.chapters)
    if total == 0:
        raise HTTPException(400,'No extractable text. Run local OCR for scanned PDFs.')
    encoded = json.dumps(payload,sort_keys=True)
    fingerprint = hashlib.sha256(encoded.encode()).hexdigest()
    with connect() as conn:
        existing = conn.execute('SELECT id FROM jobs WHERE fingerprint=?',(fingerprint,)).fetchone()
        if existing:
            return get_job(existing['id'])
        job_id = str(uuid.uuid4())
        conn.execute('INSERT INTO jobs(id,fingerprint,payload,status,total) VALUES(?,?,?,?,?)',(job_id,fingerprint,encoded,'queued',total))
    return get_job(job_id)

@app.get('/jobs')
def jobs():
    with connect() as conn:
        ids = conn.execute('SELECT id FROM jobs ORDER BY rowid DESC').fetchall()
    return [get_job(row['id']) for row in ids]

@app.post('/jobs/{job_id}/pause')
def pause(job_id: str):
    get_job(job_id)
    with connect() as conn:
        conn.execute("UPDATE jobs SET status='paused' WHERE id=? AND status IN ('running','queued')",(job_id,))
    return get_job(job_id)

@app.post('/jobs/{job_id}/resume')
def resume(job_id: str):
    get_job(job_id)
    with connect() as conn:
        conn.execute("UPDATE jobs SET status='queued',error='' WHERE id=? AND status IN ('paused','failed')",(job_id,))
    return get_job(job_id)

@app.get('/audio/{job_id}/{filename}')
def audio(job_id: str, filename: str):
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(400,'Invalid job ID')
    if not re.fullmatch(r'chapter-\d+\.wav',filename):
        raise HTTPException(400,'Invalid audio path')
    path = AUDIO / job_id / filename
    if not path.is_file():
        raise HTTPException(404,'Audio not found')
    return FileResponse(path,media_type='audio/wav')
