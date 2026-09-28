"""Backend-only PostgreSQL connections with transaction-scoped Auth identity and RLS."""
from contextlib import contextmanager
import os
import certifi
import psycopg
from psycopg.rows import dict_row
from fastapi import HTTPException


@contextmanager
def connection(actor_id=None):
    url = os.getenv('APPRAISAL_DATABASE_URL')
    if not url:
        raise HTTPException(503, 'Chưa cấu hình kết nối database cho backend.')
    try:
        with psycopg.connect(url, connect_timeout=10, sslmode='verify-full',
                             sslrootcert=os.getenv('APPRAISAL_DATABASE_CA',certifi.where()), row_factory=dict_row,
                             prepare_threshold=None) as con:
            with con.transaction():
                con.execute("select set_config('statement_timeout','15000',true)")
                if actor_id:
                    con.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(actor_id),))
                yield con
    except psycopg.errors.SerializationFailure:
        raise HTTPException(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.') from None
    except psycopg.errors.InsufficientPrivilege:
        raise HTTPException(403, 'Thao tác nằm ngoài phạm vi quyền của tài khoản.') from None
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, 'Mã đã tồn tại. Vui lòng dùng mã khác.') from None
    except (psycopg.errors.CheckViolation, psycopg.errors.InvalidParameterValue):
        raise HTTPException(422, 'Dữ liệu không đáp ứng điều kiện lưu hồ sơ.') from None
    except psycopg.Error:
        raise HTTPException(503, 'Không thể hoàn thành giao dịch dữ liệu. Vui lòng thử lại.') from None
