from pathlib import Path
import math, struct, wave, zipfile
root=Path(__file__).parent/'fixtures'
with wave.open(str(root/'Quiet Garden.wav'),'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000)
    f.writeframes(b''.join(struct.pack('<h',int(math.sin(i*2*math.pi*220/16000)*3000)) for i in range(16000*12)))
with zipfile.ZipFile(root/'Garden.epub','w') as z:
    z.writestr('mimetype','application/epub+zip')
    z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
    z.writestr('OEBPS/content.opf','<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>The Quiet Garden</dc:title><dc:creator>Ada Rivers</dc:creator></metadata><manifest><item id="c1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>')
    z.writestr('OEBPS/one.xhtml','<html><head><title>Morning</title></head><body><h1>Morning</h1><p>A good story begins in a quiet garden. The sun rises over the trees.</p></body></html>')
    z.writestr('OEBPS/two.xhtml','<html><body><h1>Evening</h1><p>Another chapter, another adventure. A book is waiting for you.</p></body></html>')
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
stream=b'BT /F1 18 Tf 70 700 Td (A quiet garden. A good book.) Tj ET'
objects.append(b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream')
data=b'%PDF-1.4\n';offsets=[0]
for i,obj in enumerate(objects):
    offsets.append(len(data));data+=str(i+1).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{o:010} 00000 n \n'.encode() for o in offsets[1:]);data+=f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
(root/'Garden.pdf').write_bytes(data)
