"""Bounded strict JSON and project-local canonical bytes (NOT RFC 8785)."""
from __future__ import annotations
import hashlib, json
from datetime import datetime, timezone
from pydantic import BaseModel, ValidationError
from .models import DTO

MAX_WIRE=16*1024*1024
class ContractViolation(ValueError):
    def __init__(self, code:str):
        self.code=code
        super().__init__(code)  # Never echo payload into error strings.

def _walk(value, depth=0):
    if depth>32: raise ContractViolation('JSON_DEPTH')
    if value is None or type(value) is bool: return
    if type(value) is int:
        if abs(value)>2**53-1: raise ContractViolation('JSON_INTEGER_RANGE')
    elif isinstance(value,str):
        if any(0xD800<=ord(c)<=0xDFFF or ord(c)==0 for c in value):
            raise ContractViolation('JSON_STRING_INVALID')
    elif isinstance(value,list):
        if len(value)>10000: raise ContractViolation('JSON_CARDINALITY')
        for v in value: _walk(v,depth+1)
    elif isinstance(value,dict):
        if len(value)>10000: raise ContractViolation('JSON_CARDINALITY')
        for k,v in value.items():
            if not isinstance(k,str): raise ContractViolation('JSON_KEY_INVALID')
            _walk(k,depth+1); _walk(v,depth+1)
    else: raise ContractViolation('JSON_TYPE_INVALID')

def canonical(value:DTO|dict|list)->bytes:
    data=value.model_dump(mode='json') if isinstance(value,BaseModel) else value
    _walk(data)
    out=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')
    if len(out)>MAX_WIRE: raise ContractViolation('PAYLOAD_TOO_LARGE')
    return out

def digest(value:DTO|dict|list|bytes)->str:
    return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()

def strict_loads(raw:bytes):
    if len(raw)>MAX_WIRE: raise ContractViolation('PAYLOAD_TOO_LARGE')
    def pairs(xs):
        d={}
        for k,v in xs:
            if k in d: raise ContractViolation('JSON_DUPLICATE_KEY')
            d[k]=v
        return d
    def reject(_): raise ContractViolation('JSON_NUMBER_INVALID')
    try:
        value=json.loads(raw.decode('utf-8',errors='strict'),object_pairs_hook=pairs,
            parse_float=reject,parse_constant=reject)
        _walk(value)
        return value
    except ContractViolation: raise
    except (UnicodeError,ValueError,RecursionError) as e:
        raise ContractViolation('JSON_INVALID') from None

def decode(model:type[DTO],raw:bytes):
    try: return model.model_validate(strict_loads(raw))
    except ValidationError: raise ContractViolation('SCHEMA_INVALID') from None

def utc_seconds(value:str)->int:
    try: return int(datetime.strptime(value,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp())
    except (ValueError,TypeError): raise ContractViolation('TIME_INVALID') from None

def unique(values,code='DUPLICATE_ID'):
    result=set(values)
    if len(result)!=len(values): raise ContractViolation(code)
    return result
