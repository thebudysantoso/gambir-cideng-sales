#!/usr/bin/env python3
"""Geocode visited leads without coordinates using Nominatim"""
import json, sqlite3, urllib.request, time, urllib.parse

DB = '/root/.openclaw/workspace/gambir-sales-app/data/gambir_sales.db'

def geocode(address):
    """Geocode address via Nominatim with 1s delay"""
    if not address:
        return None, None
    addr = address.strip()
    if 'Jakarta' not in addr:
        addr += ', Jakarta, Indonesia'
    elif 'Indonesia' not in addr:
        addr += ', Indonesia'
    
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(addr)}&format=json&limit=1"
    req = urllib.request.Request(url, headers={'User-Agent': 'GambirSalesApp/1.0'})
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data:
                return float(data[0]['lat']), float(data[0]['lon'])
    except Exception as e:
        print(f"  Geocode error: {e}")
    return None, None

conn = sqlite3.connect(DB)
cur = conn.cursor()

cur.execute("SELECT lead_id, business_name, address FROM leads WHERE visit_status = 1 AND (lat IS NULL OR lat = '')")
rows = cur.fetchall()

print(f"Found {len(rows)} visited leads without coordinates")

updated = 0
for i, (lead_id, name, address) in enumerate(rows, 1):
    print(f"[{i}/{len(rows)}] {name}: {address}")
    lat, lng = geocode(address)
    if lat and lng:
        cur.execute("UPDATE leads SET lat = ?, lng = ? WHERE lead_id = ?", (lat, lng, lead_id))
        conn.commit()
        print(f"  -> lat={lat}, lng={lng}")
        updated += 1
    else:
        print(f"  -> NOT FOUND")
    
    time.sleep(1.1)

conn.close()
print(f"\nDone! Updated {updated}/{len(rows)} leads with coordinates.")
