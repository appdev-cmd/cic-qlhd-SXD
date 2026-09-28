"""Provision dedicated staging identities, retaining passwords only in a private file."""
import json
import os
from pathlib import Path
import secrets
from bootstrap_cloud import request
from supabase_admin import query

ROLES=[('officer','Chuyên viên thử nghiệm'),('head_of_department','Trưởng phòng thử nghiệm'),
       ('director','Lãnh đạo Sở thử nghiệm'),('admin','Quản trị thử nghiệm')]

def main():
    private=Path.home()/'.config/buildappraisal/test-accounts.json'
    ref=os.environ['SUPABASE_PROJECT_REF']
    keys=request(f'https://api.supabase.com/v1/projects/{ref}/api-keys',{'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN']})
    service=next(k['api_key'] for k in keys if k['name']=='service_role')
    headers={'apikey':service,'Authorization':'Bearer '+service,'Content-Type':'application/json'}
    saved=json.loads(private.read_text(encoding='utf-8')) if private.exists() else {'projectRef':ref,'accounts':[]}
    if saved['projectRef']!=ref:raise RuntimeError('Test identities belong to another project.')
    quote=lambda value:"'"+str(value).replace("'","''")+"'"
    for role,name in ROLES:
        account=next((a for a in saved['accounts'] if a['role']==role),None)
        if not account:
            email=role.replace('_','-')+'@buildappraisal.test';password=secrets.token_urlsafe(32)
            user=request(f'https://{ref}.supabase.co/auth/v1/admin/users',headers,
                {'email':email,'password':password,'email_confirm':True,'user_metadata':{'full_name':name},
                 'app_metadata':{'staging_test_account':True}})
            account={'role':role,'name':name,'email':email,'password':password,'user_id':user['id']}
            saved['accounts'].append(account)
            private.write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding='utf-8')
        uid=quote(account['user_id']);email=quote(account['email']);label=quote(name);r=quote(role)
        query(f"""begin;
        insert into public.profiles(id,full_name,email,role,province_id,department,is_active)
        values({uid}::uuid,{label},{email},{r},'DB','Phòng Quản lý Xây dựng',true)
        on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,province_id=excluded.province_id,department=excluded.department,is_active=true;
        insert into public.staff_users(id,full_name,title,department,role,email,province_code,is_active,auth_user_id)
        values('auth-'||{uid},{label},{label},'Phòng Quản lý Xây dựng',{r},{email},'DB',true,{uid}::uuid)
        on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,department=excluded.department,province_code=excluded.province_code,is_active=true;
        commit;""",False)
    print(json.dumps({'test_roles':[r for r,_ in ROLES],'credentials_file':str(private),'emails_sent':False}))

if __name__=='__main__':main()
