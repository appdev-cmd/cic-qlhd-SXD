"""Project image metadata with optimistic concurrency and scoped private originals."""
import base64
import hashlib
import json
from io import BytesIO
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from .store import MODE, db, remote
from .database import connection

BUCKET='appraisal-project-images'
LABELS={'phoi_canh':'Phối cảnh 3D','hien_trang':'Hiện trạng thực địa','ban_ve':'Bản vẽ quy hoạch','tien_do':'Tiến độ thực địa'}


def read(s,id):
    project=s.project(id)
    if MODE=='demo':
        with db() as con:
            schema(con)
            row=con.execute('select revision,payload from project_galleries where project_id=?',(id,)).fetchone()
        return {'images':json.loads(row[1]) if row else project.get('images',[]),'revision':row[0] if row else 1}
    return {'images':project.get('images') or [],'revision':project['images_revision']}


def schema(con):
    con.execute('create table if not exists project_galleries(project_id text primary key,revision integer not null,payload text not null)')
    con.execute('create table if not exists project_image_files(project_id text,id text,data blob,primary key(project_id,id))')
    con.execute('create table if not exists project_image_audit(id text primary key,project_id text,actor text,created_at text,detail text)')


def add(s,id,body):
    if s.actor['role'] not in ('officer','head_of_department','admin'):raise HTTPException(403,'Tài khoản không có quyền bổ sung ảnh.')
    current=read(s,id)
    if not body.title.strip():raise HTTPException(422,'Nhập tiêu đề ảnh.')
    if body.revision!=current['revision']:raise HTTPException(409,'Thư viện ảnh đã thay đổi. Tải lại trước khi lưu.')
    if len(current['images'])>=200:raise HTTPException(422,'Tối đa 200 ảnh mỗi dự án.')
    image_id=str(uuid4());data=None;storage_path=None
    url=body.url.strip() if body.url else ''
    if body.contentBase64:
        try:data=base64.b64decode(body.contentBase64,validate=True)
        except ValueError:raise HTTPException(422,'Nội dung ảnh chưa hợp lệ.') from None
        if not 0<len(data)<=5*1024*1024:raise HTTPException(422,'Ảnh tối đa 5 MB.')
        if data.startswith(b'\xff\xd8\xff'):mime='image/jpeg'
        elif data.startswith(b'\x89PNG\r\n\x1a\n'):mime='image/png'
        elif data[:4]==b'RIFF' and data[8:12]==b'WEBP':mime='image/webp'
        else:raise HTTPException(422,'Chỉ nhận ảnh JPEG, PNG hoặc WebP.')
        from PIL import Image, UnidentifiedImageError
        try:
            with Image.open(BytesIO(data)) as original:
                if original.width*original.height>25_000_000:raise ValueError('Image too large')
                original.verify()
        except (ValueError,OSError,UnidentifiedImageError,Image.DecompressionBombError):
            raise HTTPException(422,'Ảnh không hợp lệ hoặc vượt 25 triệu điểm ảnh.') from None
        storage_path=id+'/'+image_id
        url='/api/appraisal/projects/'+id+'/images/'+image_id+'/content'
    elif urlparse(url).scheme!='https' or not urlparse(url).hostname:
        raise HTTPException(422,'Chọn tệp ảnh hoặc nhập liên kết HTTPS hợp lệ.')
    image={'id':image_id,'url':url,'thumbnailUrl':url,'title':body.title.strip(),'category':body.category,
           'categoryLabel':LABELS[body.category],'date':datetime.now(timezone.utc).date().isoformat(),
           'author':s.actor['name'],'description':body.description.strip()}
    if data:image.update(storagePath=storage_path,sha256=hashlib.sha256(data).hexdigest(),size=len(data))
    images=[image,*current['images']]
    if MODE=='demo':
        with db() as con:
            schema(con);con.execute('BEGIN IMMEDIATE')
            row=con.execute('select revision from project_galleries where project_id=?',(id,)).fetchone()
            if (row[0] if row else 1)!=body.revision:raise HTTPException(409,'Thư viện ảnh đã thay đổi. Tải lại trước khi lưu.')
            con.execute('insert into project_galleries values(?,?,?) on conflict(project_id) do update set revision=excluded.revision,payload=excluded.payload',(id,body.revision+1,json.dumps(images,ensure_ascii=False)))
            if data:con.execute('insert into project_image_files values(?,?,?)',(id,image_id,data))
            con.execute('insert into project_image_audit values(?,?,?,?,?)',(str(uuid4()),id,json.dumps(s.actor,ensure_ascii=False),datetime.now(timezone.utc).isoformat(),'Bổ sung ảnh: '+image['title']))
        return {'images':images,'revision':body.revision+1}
    if data:remote('/storage/v1/object/'+BUCKET+'/'+storage_path,s.token,'POST',content=data,headers={'Content-Type':mime,'x-upsert':'false'})
    try:
        with connection(s.actor['id']) as con:
            result=con.execute('select public.save_project_images(%s,%s,%s) as result',(id,body.revision,Jsonb(images))).fetchone()['result']
        return result
    except Exception:
        if data:
            try:remote('/storage/v1/object/'+BUCKET,s.token,'DELETE',json={'prefixes':[storage_path]})
            except HTTPException:pass
        raise


def content(s,project_id,image_id):
    gallery=read(s,project_id)
    image=next((i for i in gallery['images'] if i['id']==image_id and i.get('storagePath')),None)
    if not image:raise HTTPException(404,'Không tìm thấy bản gốc ảnh trong phạm vi quyền.')
    if MODE=='demo':
        with db() as con:
            schema(con)
            row=con.execute('select data from project_image_files where project_id=? and id=?',(project_id,image_id)).fetchone()
        if not row:raise HTTPException(404,'Không tìm thấy bản gốc ảnh.')
        return row[0]
    return remote('/storage/v1/object/authenticated/'+BUCKET+'/'+image['storagePath'],s.token).content
