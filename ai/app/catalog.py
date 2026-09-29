"""Scoped, paginated supporting data and aggregate reporting."""

from fastapi import HTTPException
from .database import connection, read
from .store import MODE, normalize_search

CATALOGS = {
    'organizations': {
        'fields': 'id,code,name,type,tax_code,address,legal_rep,phone,email,cert_number,cert_grade,cert_expiry,status,updated_at',
        'name': 'name',
        'category': 'type',
        'search': ['name', 'code', 'tax_code', 'address'],
    },
    'personnel': {
        'fields': 'id,code,full_name,cert_number,cert_authority,cert_grade,cert_expiry,specialties,org_id,org_name,email,phone,status,updated_at',
        'name': 'full_name',
        'category': 'cert_grade',
        'search': ['full_name', 'code', 'cert_number', 'org_name'],
    },
    'material_prices': {
        'fields': 'id,code,name,unit,standard_price,market_price,region,period,supplier,updated_at',
        'name': 'name',
        'category': 'region',
        'search': ['name', 'code', 'region', 'period', 'supplier'],
    },
}
for spec in CATALOGS.values():
    spec['fields'] += ',revision'

FIELDS = {
    'organizations': {
        'code',
        'name',
        'type',
        'tax_code',
        'address',
        'legal_rep',
        'phone',
        'email',
        'cert_number',
        'cert_grade',
        'cert_expiry',
        'status',
    },
    'personnel': {
        'code',
        'full_name',
        'id_card',
        'cert_number',
        'cert_authority',
        'cert_grade',
        'cert_expiry',
        'specialties',
        'org_id',
        'email',
        'phone',
        'status',
    },
    'material_prices': {'code', 'name', 'unit', 'standard_price', 'market_price', 'region', 'period', 'supplier'},
}


def can_edit(s):
    return MODE != 'demo' and s.actor['role'] in ('admin', 'head_of_department')


def write(s, kind, body, id=None):
    from datetime import date
    from decimal import Decimal, InvalidOperation

    if not can_edit(s):
        raise HTTPException(403, 'Trưởng phòng hoặc quản trị viên được cập nhật danh mục của tỉnh.')
    values = dict(body.values)
    if set(values) - FIELDS[kind]:
        raise HTTPException(422, 'Có trường không được phép sửa.')
    required = {
        'organizations': ['code', 'name', 'type', 'address', 'status'],
        'personnel': [
            'full_name',
            'cert_number',
            'cert_authority',
            'cert_grade',
            'cert_expiry',
            'specialties',
            'status',
        ],
        'material_prices': ['code', 'name', 'unit', 'region', 'period', 'standard_price', 'market_price'],
    }[kind]
    if kind == 'personnel' and not id:
        required += ['id_card']
    for key in required:
        if key not in values or values[key] is None or values[key] == '':
            raise HTTPException(422, 'Nhập đầy đủ các trường bắt buộc.')
    for key, value in list(values.items()):
        if key == 'specialties':
            if (
                not isinstance(value, list)
                or not 1 <= len(value) <= 30
                or any(not isinstance(v, str) or not v.strip() or len(v) > 200 for v in value)
            ):
                raise HTTPException(422, 'Nhập ít nhất một lĩnh vực hành nghề.')
        elif key in ('standard_price', 'market_price'):
            try:
                number = Decimal(str(value))
                if not number.is_finite() or number < 0 or number > Decimal('9000000000000000'):
                    raise InvalidOperation
                values[key] = number
            except (InvalidOperation, ValueError):
                raise HTTPException(422, 'Giá phải là số không âm hợp lệ.')
        elif value is not None:
            if not isinstance(value, str) or len(value) > 1000:
                raise HTTPException(422, 'Trường văn bản vượt giới hạn.')
            values[key] = value.strip() or None
            if key in required and not values[key]:
                raise HTTPException(422, 'Trường bắt buộc không được để trống.')
            if key == 'cert_expiry' and value:
                try:
                    values[key] = date.fromisoformat(value)
                except ValueError:
                    raise HTTPException(422, 'Ngày hết hạn chưa hợp lệ.')
    if kind == 'personnel' and id and not values.get('id_card'):
        values.pop('id_card', None)
    spec = CATALOGS[kind]
    with connection(s.actor['id']) as con:
        if kind == 'personnel':
            org = None
            if values.get('org_id'):
                org = con.execute(
                    'select name from public.organizations where id=%s and province_code=%s',
                    (values['org_id'], s.actor['tenantId']),
                ).fetchone()
                if not org:
                    raise HTTPException(422, 'Đơn vị không thuộc danh mục trong phạm vi quyền.')
            values['org_name'] = org['name'] if org else None
        if id:
            fields = list(values)
            row = con.execute(
                'update public.'
                + kind
                + ' set '
                + ','.join(k + '=%s' for k in fields)
                + ',revision=revision+1 where id=%s and revision=%s returning '
                + spec['fields'],
                [values[k] for k in fields] + [id, body.revision],
            ).fetchone()
            if not row:
                raise HTTPException(409, 'Bản ghi đã thay đổi hoặc nằm ngoài phạm vi quyền. Tải lại trước khi sửa.')
        else:
            values['province_code'] = s.actor['tenantId']
            fields = list(values)
            row = con.execute(
                'insert into public.'
                + kind
                + ' ('
                + ','.join(fields)
                + ') values ('
                + ','.join(['%s'] * len(fields))
                + ') returning '
                + spec['fields'],
                [values[k] for k in fields],
            ).fetchone()
    return row


def history(s, kind, id, offset=0):
    with connection(s.actor['id']) as con:
        if not con.execute('select id from public.' + kind + ' where id=%s', (id,)).fetchone():
            raise HTTPException(404, 'Không tìm thấy bản ghi trong phạm vi quyền.')
        rows = con.execute(
            "select a.id,a.created_at,a.action,a.changed_fields,coalesce(u.full_name,'Cán bộ hệ thống') as actor from public.audit_logs a left join public.staff_users u on u.id=a.actor_id where a.table_name=%s and a.record_id=%s order by a.created_at desc,a.id limit 50 offset %s",
            (kind, id, offset),
        ).fetchall()
    return {'items': rows, 'offset': offset}


def page(s, kind, search='', category='', status='', offset=0, limit=50, sort='', direction='asc'):
    if MODE == 'demo':
        from .demo_catalog import page as demo_page

        return demo_page(kind, CATALOGS[kind], search, category, status, offset, limit, sort, direction)
    spec = CATALOGS[kind]
    where = []
    values = []
    if search:
        where.append("public.f_unaccent(lower(concat_ws(' '," + ','.join(spec['search']) + "))) like %s escape '\\'")
        values.append(
            '%' + normalize_search(search).replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        )
    for column, value in [(spec['category'], category), ('period' if kind == 'material_prices' else 'status', status)]:
        if value and value != 'all':
            where.append(column + '=%s')
            values.append(value)
    suffix = ' where ' + ' and '.join(where) if where else ''
    sort = sort if sort in spec['fields'].split(',') else spec['name']
    direction = 'desc' if direction == 'desc' else 'asc'
    with connection(s.actor['id']) as con:
        total = con.execute('select count(*) as n from public.' + kind + suffix, values).fetchone()['n']
        rows = con.execute(
            'select '
            + spec['fields']
            + ' from public.'
            + kind
            + suffix
            + ' order by '
            + sort
            + ' '
            + direction
            + ' nulls last,id limit %s offset %s',
            values + [limit, offset],
        ).fetchall()
        categories = con.execute(
            'select distinct '
            + spec['category']
            + ' as value from public.'
            + kind
            + ' where '
            + spec['category']
            + ' is not null order by 1 limit 100'
        ).fetchall()
        state = 'period' if kind == 'material_prices' else 'status'
        statuses = con.execute(
            'select distinct '
            + state
            + ' as value from public.'
            + kind
            + ' where '
            + state
            + ' is not null order by 1 limit 100'
        ).fetchall()
    return {
        'items': rows,
        'total': total,
        'offset': offset,
        'limit': limit,
        'canEdit': can_edit(s),
        'categories': [r['value'] for r in categories],
        'statuses': [r['value'] for r in statuses],
    }


def dashboard(s, kind='all'):
    if MODE == 'demo':
        from .demo_catalog import dashboard as demo_dashboard

        return {**demo_dashboard(kind), 'sla': s.sla_counts(kind)}
    where = (
        " where coalesce((payload->>'sample')::boolean,false)=" + ('true' if kind == 'sample' else 'false')
        if kind in ('sample', 'real')
        else ''
    )
    sla_sql, sla_values, sla_states = s.sla_counts_query(kind)
    # Every dashboard query in one network round trip (single message, one implicit transaction).
    (
        cases_rows,
        projects_rows,
        procedures_rows,
        month_rows_rows,
        statuses_rows,
        top_projects_rows,
        pending_rows,
        sla_cursor_rows,
    ) = read(
        s.actor['id'],
        (
            "select count(*) as total,count(distinct dossier_id) as dossiers,count(*) filter(where payload->>'status' in ('intake','analyzing','analyzed')) as in_progress,coalesce(sum(jsonb_array_length(payload->'documents')),0) as documents,count(*) filter(where payload->>'status'='reviewed') as reviewed,count(*) filter(where payload->>'status'='request_supplement') as supplements from public.appraisal_cases"
            + where,
            None,
        ),
        ('select count(*) as total from public.projects', None),
        (
            "select procedure as id,count(*) as total from public.appraisal_cases"
            + where
            + ' group by procedure order by procedure',
            None,
        ),
        (
            "select to_char(coalesce(nullif(payload->>'createdAt','')::timestamptz::date,created_at::date),'YYYY-MM') as id,procedure,count(*) as total from public.appraisal_cases"
            + where
            + " group by 1,2 order by 1 asc,2",
            None,
        ),
        (
            "select coalesce(payload->>'status','unknown') as id,count(*) as total from public.appraisal_cases"
            + where
            + " group by 1 order by 1",
            None,
        ),
        (
            "with scoped as (select project_id,dossier_id from public.appraisal_cases"
            + where
            + ") select p.id,p.title as name,count(*) as total,count(distinct c.dossier_id) as dossiers from scoped c join public.projects p on p.id=c.project_id group by p.id,p.title order by total desc,p.title,p.id limit 6",
            None,
        ),
        (
            "select id,payload->>'name' as name,payload->>'projectName' as project_name,project_id,payload->>'status' as status from public.appraisal_cases"
            + where
            + ' order by updated_at desc,id limit 10',
            None,
        ),
        (sla_sql, sla_values),
    )
    cases = cases_rows[0]
    projects = projects_rows[0]
    procedures = procedures_rows
    month_rows = month_rows_rows
    statuses = statuses_rows
    top_projects = top_projects_rows
    pending = pending_rows
    sla = s.sla_rows(sla_cursor_rows[0], sla_states)
    months = {}
    for row in month_rows:
        month = months.setdefault(row['id'], {'id': row['id'], 'total': 0, 'procedures': {}})
        month['total'] += row['total']
        month['procedures'][row['procedure']] = row['total']
    return {
        'cases': cases,
        'projects': projects,
        'procedures': procedures,
        'months': list(months.values()),
        'statuses': statuses,
        'top_projects': top_projects,
        'recent': pending,
        'sla': sla,
    }
