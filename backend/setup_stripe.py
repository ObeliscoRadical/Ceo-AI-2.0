"""Idempotent Stripe catalog setup for CEO AI 2.0 Premium plan."""
import os, stripe
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

CATALOG = [
    {
        "product_id": "ceo_premium",
        "name": "CEO AI 2.0 Premium",
        "tax_code": "txcd_10103001",  # SaaS
        "prices": [
            {"lookup_key": "premium_monthly", "amount": 2900, "currency": "eur", "interval": "month"},
            {"lookup_key": "premium_yearly", "amount": 29000, "currency": "eur", "interval": "year"},
            {"lookup_key": "founder_monthly", "amount": 2900, "currency": "eur", "interval": "month"},
            {"lookup_key": "professional_monthly", "amount": 5900, "currency": "eur", "interval": "month"},
        ],
    },
]

def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("product_id") == entry["product_id"]:
            return p
    return stripe.Product.create(name=entry["name"], tax_code=entry.get("tax_code"),
        metadata={"managed_by": "ceo-ai-2.0", "product_id": entry["product_id"]})

def main():
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                kwargs = dict(product=product.id, unit_amount=p["amount"], currency=p["currency"],
                              lookup_key=p["lookup_key"], transfer_lookup_key=True)
                if p.get("interval"):
                    kwargs["recurring"] = {"interval": p["interval"]}
                stripe.Price.create(**kwargs)
                print("created price", p["lookup_key"])
            else:
                print("exists", p["lookup_key"])

if __name__ == "__main__":
    main()
