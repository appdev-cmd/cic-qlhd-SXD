"""Transactional read projection: list/dashboard queries never parse source text."""

FIELDS = [
    'id',
    'name',
    'province',
    'department',
    'projectId',
    'projectName',
    'projectCode',
    'sample',
    'submissionCode',
    'submissionRound',
    'dossierId',
    'previousSubmissionId',
    'sampleScenario',
    'legalDate',
    'createdAt',
    'updatedAt',
    'status',
    'revision',
    'procedure',
    'documentCount',
    'searchText',
    'slaDueDate',
    'slaPaused',
    'slaCompletedAt',
    'workflowState',
    'slaWaitingDue',
    'slaOutcome',
    'slaDueKind',
]
# Summary columns read from nested payload paths.
PATHS = {
    'slaDueDate': '$.sla.dueDate',
    'slaPaused': '$.sla.paused',
    'slaCompletedAt': '$.sla.completedAt',
    'workflowState': '$.workflow.state',
    'slaWaitingDue': '$.sla.waitingDueDate',
    'slaOutcome': '$.sla.outcome',
    'slaDueKind': '$.sla.dueKind',
}


def ensure(con):
    columns = [r[1] for r in con.execute('pragma table_info(case_summaries)')]
    if columns == FIELDS:
        return
    with con:
        con.execute('begin immediate')
        if columns:
            # Projection schema changed: rebuild from the source payloads in the same transaction.
            for event in ('insert', 'update', 'delete'):
                con.execute('drop trigger if exists cases_summary_' + event)
            con.execute('drop table case_summaries')
        integers = {'sample', 'submissionRound', 'revision', 'documentCount', 'slaPaused'}
        con.execute(
            'create table if not exists case_summaries ('
            + ','.join(
                '"' + k + '" ' + ('integer' if k in integers else 'text') + (' primary key' if k == 'id' else '')
                for k in FIELDS
            )
            + ')'
        )

        def expressions(prefix):
            get = lambda key: "json_extract(" + prefix + "payload,'$." + key + "')"
            values = []
            for key in FIELDS:
                if key == 'id':
                    value = prefix + 'id'
                elif key == 'procedure':
                    value = "coalesce(" + get(key) + ",'bcnckt')"
                elif key == 'documentCount':
                    value = "coalesce(json_array_length(" + prefix + "payload,'$.documents'),0)"
                elif key == 'dossierId':
                    value = (
                        'coalesce('
                        + get(key)
                        + ', (select dossierId from case_summaries where id='
                        + get('previousSubmissionId')
                        + '),'
                        + prefix
                        + 'id)'
                    )
                elif key in PATHS:
                    value = "json_extract(" + prefix + "payload,'" + PATHS[key] + "')"
                elif key == 'searchText':
                    value = " || ' ' || ".join(
                        'coalesce(' + get(k) + ",'')" for k in ['name', 'province', 'projectName', 'projectCode']
                    )
                else:
                    value = get(key)
                values.append(value)
            return ','.join(values)

        statement = 'insert or replace into case_summaries values(' + expressions('NEW.') + ');'
        for event in ('insert', 'update'):
            con.execute(
                'create trigger if not exists cases_summary_'
                + event
                + ' after '
                + event
                + ' on cases begin '
                + statement
                + ' end'
            )
        con.execute(
            'create trigger if not exists cases_summary_delete after delete on cases begin delete from case_summaries where id=OLD.id; end'
        )
        con.execute('insert or replace into case_summaries select ' + expressions('cases.') + ' from cases')
        # Resolve legacy supplement chains even when their rows were inserted out of order.
        con.execute("""update case_summaries set dossierId=(with recursive ancestors(id,previous,depth) as (
          select id,previousSubmissionId,0 from case_summaries s where s.id=case_summaries.id
          union all select s.id,s.previousSubmissionId,a.depth+1 from case_summaries s join ancestors a on s.id=a.previous where a.depth<1000
        ) select id from ancestors order by depth desc limit 1)
        where previousSubmissionId is not null""")
        for name in (
            'name',
            'updatedAt',
            'projectId',
            'procedure',
            'status',
            'sample',
            'dossierId',
            'slaDueDate',
            'previousSubmissionId',
        ):
            con.execute('create index if not exists idx_case_summary_' + name + ' on case_summaries("' + name + '",id)')
