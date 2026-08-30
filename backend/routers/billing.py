from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from core import *
from models import *

router = APIRouter()

# ---------------------------------------------------------------- subscription / Stripe
PLANS = {
    "founder_monthly": {"label": "Empresa Fundadora", "price": f"{FOUNDER_PRICE_MONTHLY} €", "period": "/mês"},
    "professional_monthly": {"label": "Professional", "price": f"{PROFESSIONAL_PRICE_MONTHLY} €", "period": "/mês"},
}

@router.get("/subscription")
async def subscription(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
    plan = u.get("plan")
    status = u.get("subscription_status")
    prem = bool(u.get("is_premium")) or is_admin_email(user)
    sub_info = None
    if u.get("stripe_subscription_id"):
        sub_info = {
            "status": status,
            "plan": PLAN_LABELS.get(plan, "Premium"),
            "plan_key": plan,
            "cancel_at_period_end": bool(u.get("cancel_at_period_end")),
            "current_period_end": u.get("current_period_end"),
            "is_founder": bool(u.get("is_founder")),
            "founder_number": u.get("founder_number"),
            "founder_price_locked": bool(u.get("founder_price_locked")),
        }
    return {"is_premium": prem, "plans": PLANS, "subscription": sub_info,
            "has_billing": bool(u.get("stripe_customer_id")), "is_admin": is_admin_email(user)}

@router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    lk = req.lookup_key
    if lk == "enterprise":
        raise HTTPException(400, "O plano Enterprise é vendido por consultoria. Fala com um consultor.")
    if lk == "founder_monthly":
        u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
        if u.get("founder_number"):
            raise HTTPException(409, "founder_used")
        camp = await get_campaign()
        claimed = await founder_claimed_count()
        if not camp.get("active", True) or claimed >= FOUNDER_LIMIT:
            raise HTTPException(409, "founder_closed")
    prices = stripe.Price.list(lookup_keys=[lk], active=True, limit=1).data
    if not prices:
        raise HTTPException(400, f"Preço não encontrado: {lk}")
    price = prices[0]
    sub_data = {"metadata": {"user_id": user["id"], "lookup_key": lk}}
    if lk == "professional_monthly":
        sub_data["trial_period_days"] = PROFESSIONAL_TRIAL_DAYS
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="subscription",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"user_id": user["id"], "lookup_key": lk},
        subscription_data=sub_data,
    )
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(**kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
        else:
            raise
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": user["id"], "lookup_key": lk,
        "amount": (price.unit_amount or 0), "currency": price.currency,
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"checkout_url": session.url, "session_id": session.id}

@router.get("/payments/status/{session_id}")
async def get_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transação não encontrada")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "stripe_subscription_id": s.subscription, "updated_at": datetime.now(timezone.utc).isoformat()}})
                if s.subscription:
                    await sync_subscription(s.subscription, record.get("user_id"))
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"]}

def _get_portal_config():
    cfgs = stripe.billing_portal.Configuration.list(limit=1).data
    if cfgs:
        return cfgs[0].id
    cfg = stripe.billing_portal.Configuration.create(
        business_profile={"headline": "CEO AI 2.0 — Gestão da subscrição"},
        features={
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            "subscription_cancel": {"enabled": True, "mode": "at_period_end"},
        },
    )
    return cfg.id

@router.post("/payments/portal")
async def billing_portal(req: OriginRequest, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
    cust = u.get("stripe_customer_id")
    if not cust:
        raise HTTPException(400, "Sem subscrição ativa")
    origin = req.origin_url or os.environ.get("FRONTEND_URL", "")
    try:
        sess = stripe.billing_portal.Session.create(customer=cust, configuration=_get_portal_config(),
                                                     return_url=f"{origin}/subscricao")
        return {"url": sess.url}
    except Exception as e:
        logger.error(f"portal error: {e}")
        raise HTTPException(500, "Portal indisponível")

@router.post("/payments/cancel-subscription")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
    sub_id = u.get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(400, "Sem subscrição ativa")
    try:
        stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"cancel_at_period_end": True}})
    except Exception as e:
        logger.error(f"cancel error: {e}")
        raise HTTPException(500, "Não foi possível cancelar")
    return {"ok": True, "cancel_at_period_end": True}

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Assinatura inválida")
    eid = event["id"]
    try:
        await db.stripe_events.insert_one({"_id": eid, "type": event["type"],
                                           "created_at": datetime.now(timezone.utc).isoformat()})
    except DuplicateKeyError:
        return {"status": "duplicate"}
    obj, t = event["data"]["object"], event["type"]
    try:
        if t == "checkout.session.completed":
            uid = (obj.get("metadata") or {}).get("user_id")
            await db.payment_transactions.update_one(
                {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                          "stripe_subscription_id": obj.get("subscription"), "updated_at": datetime.now(timezone.utc).isoformat()}})
            if obj.get("subscription"):
                await sync_subscription(obj.get("subscription"), uid)
        elif t in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            await sync_subscription(obj.get("id"))
        elif t == "invoice.paid":
            sub_id = obj.get("subscription")
            if sub_id:
                await sync_subscription(sub_id)
                await db.users.update_one({"stripe_subscription_id": sub_id},
                                          {"$set": {"last_payment_at": datetime.now(timezone.utc).isoformat()}})
        elif t == "invoice.payment_failed":
            sub_id = obj.get("subscription")
            if sub_id:
                await db.users.update_one({"stripe_subscription_id": sub_id},
                                          {"$set": {"subscription_status": "past_due"}, "$inc": {"failed_payments": 1}})
                await db.payment_events.insert_one({"type": "payment_failed", "subscription": sub_id,
                                                    "created_at": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        logger.error(f"webhook handling error ({t}): {e}")
        await db.stripe_events.delete_one({"_id": eid})
        raise HTTPException(500, "handler error")
    return {"status": "ok"}
