from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from core import *
from models import *

router = APIRouter()

@router.post("/auth/register")
async def register(inp: RegisterInput, response: Response):
    email = inp.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email já registado")
    doc = {"email": email, "password_hash": hash_password(inp.password), "name": inp.name,
           "role": "owner", "auth_provider": "email", "picture": "", "is_premium": False,
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"id": uid, "email": email, "name": inp.name, "role": "owner", "is_premium": False, "token": token}

@router.post("/auth/login")
async def login(inp: LoginInput, response: Response):
    email = inp.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "owner"),
            "is_premium": bool(user.get("is_premium")), "token": token}

@router.post("/auth/session")
async def auth_session(response: Response, payload: dict = None):
    # Optional endpoint for token verification / SSO
    return {"ok": True}

@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

def _reset_valid(rec: dict) -> bool:
    exp = rec.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            return False
    if exp is None:
        return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp >= datetime.now(timezone.utc)

@router.get("/auth/reset-password/validate")
async def validate_reset(token: str):
    rec = await db.password_reset_tokens.find_one({"token_hash": hash_reset_token(token), "used": False})
    return {"valid": bool(rec and _reset_valid(rec))}

@router.post("/auth/reset-password")
async def reset_password(inp: ResetPasswordInput):
    if len(inp.password or "") < 4:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 4 caracteres")
    rec = await db.password_reset_tokens.find_one({"token_hash": hash_reset_token(inp.token), "used": False})
    if not rec or not _reset_valid(rec):
        raise HTTPException(status_code=400, detail="Ligação inválida, expirada ou já utilizada")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])}, {"$set": {"password_hash": hash_password(inp.password)}})
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"ok": True}
