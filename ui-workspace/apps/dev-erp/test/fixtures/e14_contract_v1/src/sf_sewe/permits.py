"""Signed, exact-byte permit reference; release review remains an external authority."""
from __future__ import annotations
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey,Ed25519PublicKey
from cryptography.exceptions import InvalidSignature
from .models import *
from .codec import canonical,digest,utc_seconds,ContractViolation

def sign_for_test(claims:PermitClaims,key:Ed25519PrivateKey,key_id:str)->SignedPermit:
    """Only synthetic tests call this. Live issuance belongs to PolicyAuthorityPort."""
    return SignedPermit(key_id=key_id,claims=claims,signature_hex=key.sign(canonical(claims)).hex())

def verify_permit(permit:SignedPermit, public_keys:dict[str,Ed25519PublicKey],
                  body:bytes,route_digest:str,job_id:str,mission_id:str,round:int,
                  review_ref:str,policy_epoch:int,audience:str,now_utc:str)->None:
    key=public_keys.get(permit.key_id)
    if key is None: raise ContractViolation('PERMIT_KEY_UNKNOWN')
    try: key.verify(bytes.fromhex(permit.signature_hex),canonical(permit.claims))
    except (InvalidSignature,ValueError): raise ContractViolation('PERMIT_SIGNATURE') from None
    c=permit.claims;now=utc_seconds(now_utc)
    if not utc_seconds(c.issued_utc)<=now<utc_seconds(c.expires_utc): raise ContractViolation('PERMIT_EXPIRED')
    expected=(digest(body),route_digest,job_id,mission_id,round,review_ref,policy_epoch,audience)
    actual=(c.request_sha256,c.route_sha256,c.job_id,c.mission_id,c.round,c.review_ref,c.policy_epoch,c.audience)
    if actual!=expected: raise ContractViolation('PERMIT_BINDING')
